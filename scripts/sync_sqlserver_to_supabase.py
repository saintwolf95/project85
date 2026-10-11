"""Carga completa SQL Server -> Supabase con merge incremental y controles.

Se ejecuta desde un host con acceso de red a DATA01 y con Microsoft ODBC Driver
18 for SQL Server instalado. No forma parte del servidor web ni expone secretos.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable, Sequence

import psycopg

try:
    import pyodbc
except ImportError:  # Allows --help and static checks on hosts without the ODBC driver.
    pyodbc = None


SALES_COLUMNS = (
    "empresa_id", "fecha_venta", "articulo_pk", "nombre_articulo", "cliente_pk",
    "nombre_cliente", "tipo_cliente", "nombre_comercial", "comercial_factura", "kd",
    "ventas_eur", "unidades_venta", "margen_bruto_eur", "margen_destino_eur",
    "nombre_marca", "familia_marca", "nombre_familia", "nombre_seccion", "ean",
    "product_manager",
)
INVENTORY_COLUMNS = (
    "empresa_id", "fecha_inventario", "articulo_pk", "nombre_articulo", "inventario_eur",
    "unidades_inventario", "nombre_marca", "familia_marca", "nombre_familia",
    "nombre_seccion", "ean", "product_manager",
)
DATASETS = {
    "ventas": ("dbo.vw_ventas_supabase", "sync.stg_ventas_diarias", SALES_COLUMNS, "fecha_venta"),
    "inventario": ("dbo.vw_inventario_supabase", "sync.stg_inventario_diario", INVENTORY_COLUMNS, "fecha_inventario"),
}
LOG = logging.getLogger("sqlserver_supabase_sync")


@dataclass(frozen=True)
class Totals:
    rows: int
    values: tuple[Decimal, ...]

    def as_json(self, fields: Sequence[str]) -> str:
        return json.dumps({"rows": self.rows, **{name: str(value) for name, value in zip(fields, self.values)}})


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Falta la variable de entorno {name}.")
    return value


def normalize_postgres_url(url: str) -> str:
    return url.replace("?pgbouncer=true&", "?").replace("&pgbouncer=true", "").replace("?pgbouncer=true", "")


def source_totals(cursor, dataset: str) -> Totals:
    view, _, _, _ = DATASETS[dataset]
    if dataset == "ventas":
        cursor.execute(f"SELECT COUNT(*), COALESCE(SUM(ventas_eur), 0), COALESCE(SUM(unidades_venta), 0), COALESCE(SUM(margen_bruto_eur), 0) FROM {view}")
    else:
        cursor.execute(f"SELECT COUNT(*), COALESCE(SUM(inventario_eur), 0), COALESCE(SUM(unidades_inventario), 0) FROM {view}")
    row = cursor.fetchone()
    return Totals(int(row[0]), tuple(Decimal(str(value)) for value in row[1:]))


def staging_totals(cursor, dataset: str) -> Totals:
    _, staging, _, _ = DATASETS[dataset]
    if dataset == "ventas":
        cursor.execute(f"SELECT COUNT(*), COALESCE(SUM(ventas_eur), 0), COALESCE(SUM(unidades_venta), 0), COALESCE(SUM(margen_bruto_eur), 0) FROM {staging}")
    else:
        cursor.execute(f"SELECT COUNT(*), COALESCE(SUM(inventario_eur), 0), COALESCE(SUM(unidades_inventario), 0) FROM {staging}")
    row = cursor.fetchone()
    return Totals(int(row[0]), tuple(Decimal(str(value)) for value in row[1:]))


def assert_totals_match(source: Totals, staging: Totals, dataset: str) -> None:
    if source.rows == 0 or staging.rows == 0:
        raise RuntimeError(f"{dataset}: origen o staging vacíos; se aborta la sincronización.")
    if source != staging:
        raise RuntimeError(f"{dataset}: los controles de filas o totales no coinciden entre SQL Server y staging.")


def copy_rows(pg_cursor, sql_cursor, dataset: str, batch_size: int) -> None:
    view, staging, columns, _ = DATASETS[dataset]
    quoted_columns = ", ".join(columns)
    sql_cursor.execute(f"SELECT {quoted_columns} FROM {view}")
    with pg_cursor.copy(f"COPY {staging} ({quoted_columns}) FROM STDIN WITH (FORMAT CSV, HEADER FALSE)") as copy:
        while rows := sql_cursor.fetchmany(batch_size):
            for row in rows:
                # COPY CSV serializa correctamente comas, comillas y caracteres Unicode.
                output = io.StringIO()
                csv.writer(output, lineterminator="").writerow(list(row))
                copy.write(output.getvalue())


def assert_staging_is_unique(pg_cursor, dataset: str) -> None:
    _, staging, _, _ = DATASETS[dataset]
    if dataset == "ventas":
        key = "empresa_id, fecha_venta, articulo_pk, cliente_pk, kd, comercial_factura"
        pg_cursor.execute(f"SELECT COUNT(*) FROM (SELECT 1 FROM {staging} GROUP BY {key} HAVING COUNT(*) > 1) duplicates")
        duplicates = pg_cursor.fetchone()[0]
        pg_cursor.execute(f"SELECT COUNT(*) FROM {staging} WHERE unidades_venta <> trunc(unidades_venta)")
        fractional_units = pg_cursor.fetchone()[0]
    else:
        key = "empresa_id, fecha_inventario, articulo_pk"
        pg_cursor.execute(f"SELECT COUNT(*) FROM (SELECT 1 FROM {staging} GROUP BY {key} HAVING COUNT(*) > 1) duplicates")
        duplicates = pg_cursor.fetchone()[0]
        fractional_units = 0
    if duplicates:
        raise RuntimeError(f"{dataset}: existen {duplicates} claves naturales duplicadas en staging.")
    if dataset == "ventas":
        if fractional_units:
            raise RuntimeError("ventas: hay unidades no enteras; no se puede cargar sin perder precisión.")


def assert_no_large_drop(pg_cursor, dataset: str, source_rows: int) -> None:
    pg_cursor.execute(
        """SELECT source_rows FROM sync.load_log
        WHERE dataset = %s AND status = 'succeeded'
        ORDER BY finished_at DESC LIMIT 1""",
        (dataset,),
    )
    previous = pg_cursor.fetchone()
    if previous and source_rows < int(previous[0]) * Decimal("0.95"):
        raise RuntimeError(f"{dataset}: cae más del 5 % frente a la carga correcta anterior.")


def merge_dataset(pg_cursor, dataset: str, retention_days: int) -> tuple[int, int, int]:
    _, staging, _, date_column = DATASETS[dataset]
    target = f"sync.{dataset}_diarias"
    key_fields = (
        "empresa_id, fecha_venta, articulo_pk, cliente_pk, kd, comercial_factura"
        if dataset == "ventas" else "empresa_id, fecha_inventario, articulo_pk"
    )
    columns = SALES_COLUMNS if dataset == "ventas" else INVENTORY_COLUMNS
    key_expr = (
        "concat_ws('|', empresa_id, fecha_venta, articulo_pk, cliente_pk, kd, comercial_factura)"
        if dataset == "ventas" else "concat_ws('|', empresa_id, fecha_inventario, articulo_pk)"
    )
    non_key = [column for column in columns if column not in key_fields.replace(" ", "").split(",")]
    hash_expr = "md5(concat_ws(chr(31), " + ", ".join(f"COALESCE({column}::text, '')" for column in non_key) + "))"
    insert_columns = ", ".join(("source_record_key", *columns, "row_hash"))
    select_columns = ", ".join(("source_record_key", *columns, "row_hash"))
    update_columns = ", ".join(f"{column} = EXCLUDED.{column}" for column in (*columns, "row_hash"))

    pg_cursor.execute(
        f"""WITH source_rows AS (
            SELECT {key_expr} AS source_record_key, s.*, {hash_expr} AS row_hash
            FROM {staging} s
        ), classified AS (
            SELECT s.*, t.source_record_key IS NULL AS is_insert,
                   t.row_hash IS DISTINCT FROM s.row_hash OR t.is_deleted AS is_update
            FROM source_rows s LEFT JOIN {target} t USING (source_record_key)
        ), upserted AS (
            INSERT INTO {target} ({insert_columns})
            SELECT {select_columns} FROM classified
            ON CONFLICT (source_record_key) DO UPDATE SET
                {update_columns}, source_updated_at = now(), is_deleted = false, deleted_at = NULL
            WHERE {target}.row_hash IS DISTINCT FROM EXCLUDED.row_hash OR {target}.is_deleted
            RETURNING 1
        )
        SELECT COALESCE(SUM(is_insert::int), 0), COALESCE(SUM((NOT is_insert AND is_update)::int), 0)
        FROM classified"""
    )
    inserted, updated = map(int, pg_cursor.fetchone())
    cutoff = date.today() - timedelta(days=retention_days)
    pg_cursor.execute(
        f"""UPDATE {target} target SET is_deleted = true, deleted_at = now(), source_updated_at = now()
        WHERE NOT target.is_deleted AND target.{date_column} >= %s
          AND NOT EXISTS (SELECT 1 FROM {staging} s WHERE {key_expr} = target.source_record_key)""",
        (cutoff,),
    )
    return inserted, updated, pg_cursor.rowcount


def load_dataset(pg_connection, sql_connection, dataset: str, batch_size: int, retention_days: int) -> None:
    fields = ("ventas_eur", "unidades_venta", "margen_bruto_eur") if dataset == "ventas" else ("inventario_eur", "unidades_inventario")
    load_id = uuid.uuid4()
    source = None
    try:
        with sql_connection.cursor() as sql_cursor, pg_connection.cursor() as pg_cursor:
            source = source_totals(sql_cursor, dataset)
            pg_cursor.execute("SELECT pg_advisory_xact_lock(hashtext('sqlserver-supabase-sync'))")
            pg_cursor.execute("INSERT INTO sync.load_log (id, dataset, status, source_rows, source_totals) VALUES (%s, %s, 'running', %s, %s::jsonb)", (load_id, dataset, source.rows, source.as_json(fields)))
            _, staging, _, _ = DATASETS[dataset]
            pg_cursor.execute(f"TRUNCATE {staging}")
            copy_rows(pg_cursor, sql_cursor, dataset, batch_size)
            staged = staging_totals(pg_cursor, dataset)
            assert_totals_match(source, staged, dataset)
            assert_staging_is_unique(pg_cursor, dataset)
            assert_no_large_drop(pg_cursor, dataset, source.rows)
            inserted, updated, deleted = merge_dataset(pg_cursor, dataset, retention_days)
            pg_cursor.execute(
                """UPDATE sync.load_log SET finished_at = now(), status = 'succeeded', staging_rows = %s,
                inserted_rows = %s, updated_rows = %s, deleted_rows = %s, staging_totals = %s::jsonb WHERE id = %s""",
                (staged.rows, inserted, updated, deleted, staged.as_json(fields), load_id),
            )
        pg_connection.commit()
        LOG.info("%s sincronizado: %s filas; %s nuevas, %s actualizadas, %s bajas lógicas.", dataset, source.rows, inserted, updated, deleted)
    except Exception as error:
        pg_connection.rollback()
        with pg_connection.cursor() as pg_cursor:
            pg_cursor.execute(
                """INSERT INTO sync.load_log (id, dataset, started_at, finished_at, status, source_rows, source_totals, error_message)
                VALUES (%s, %s, now(), now(), 'failed', %s, %s::jsonb, %s)""",
                (load_id, dataset, source.rows if source else None, source.as_json(fields) if source else "{}", str(error)[:4_000]),
            )
        pg_connection.commit()
        raise


def refresh_metrics(database_url: str, database_ro_url: str, company_id: int) -> None:
    os.environ["DATABASE_URL"] = database_url
    os.environ["DATABASE_RO_URL"] = database_ro_url
    from app.database import SessionLocal
    from app.services import invalidate_metrics_cache, sync_metrics_to_db

    with SessionLocal() as session:
        invalidate_metrics_cache(company_id)
        sync_metrics_to_db(session, company_id)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=10_000)
    parser.add_argument("--retention-days", type=int, default=1095)
    parser.add_argument("--skip-metrics", action="store_true")
    args = parser.parse_args()
    if pyodbc is None:
        raise RuntimeError("Instala pyodbc y Microsoft ODBC Driver 18 for SQL Server en el host ejecutor.")

    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    sqlserver_url = required_env("SQLSERVER_CONNECTION_STRING")
    supabase_url = normalize_postgres_url(required_env("SUPABASE_SYNC_DATABASE_URL"))
    app_ro_url = os.getenv("APP_DATABASE_RO_URL")
    company_id = int(os.getenv("SYNC_EMPRESA_ID", "1"))

    with pyodbc.connect(sqlserver_url, autocommit=True) as sql_connection, psycopg.connect(supabase_url) as pg_connection:
        load_dataset(pg_connection, sql_connection, "ventas", args.batch_size, args.retention_days)
        load_dataset(pg_connection, sql_connection, "inventario", args.batch_size, args.retention_days)
        with pg_connection.cursor() as cursor:
            cursor.execute("SELECT sync.materialize_application_data(%s)", (company_id,))
        pg_connection.commit()

    if not args.skip_metrics:
        if not app_ro_url:
            raise RuntimeError("Falta APP_DATABASE_RO_URL para recalcular ABCXYZ; usa --skip-metrics solo para diagnóstico.")
        refresh_metrics(supabase_url, normalize_postgres_url(app_ro_url), company_id)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        LOG.exception("Sincronización abortada: %s", error)
        raise SystemExit(1)
