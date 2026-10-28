"""Mantenimiento transaccional de agregados diarios; nunca modifica ventas."""
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def materializacion_instalada(db: Session) -> bool:
    inspector = inspect(db.connection())
    return all(inspector.has_table(nombre) for nombre in ("shared_sales_state", "shared_sales_dirty", "shared_sales_daily"))


def estado_ventas_compartidas(db: Session, empresa_id: int) -> dict:
    if not materializacion_instalada(db):
        return {"estado": "no_instalada", "fuente": "ventas originales"}
    row = db.execute(text("""
        SELECT s.source_revision, s.built_revision, s.initialized, s.calculated_at, s.coverage_start, s.coverage_end,
               (SELECT COUNT(*) FROM shared_sales_dirty d WHERE d.empresa_id=s.empresa_id) fechas_pendientes
        FROM shared_sales_state s WHERE s.empresa_id=:empresa_id
    """), {"empresa_id": empresa_id}).mappings().first()
    if not row:
        return {"estado": "sin_inicializar", "fuente": "ventas originales"}
    vigente = bool(row["initialized"] and row["source_revision"] == row["built_revision"] and not row["fechas_pendientes"])
    return {"estado": "actualizada" if vigente else "pendiente", "fuente": "agregados diarios" if vigente else "ventas originales",
            "revision_origen": row["source_revision"], "revision_calculada": row["built_revision"],
            "calculada_en": str(row["calculated_at"]) if row["calculated_at"] else None,
            "desde": str(row["coverage_start"]) if row["coverage_start"] else None,
            "hasta": str(row["coverage_end"]) if row["coverage_end"] else None,
            "fechas_pendientes": row["fechas_pendientes"],
            "advertencia": "Las fechas con registros no certifican que la carga esté completa."}


def marcar_fechas(db: Session, empresa_id: int, inicio: date, fin: date) -> None:
    """Marca la ventana modificada, incluso en SQLite sin triggers."""
    db.execute(text("""
        INSERT INTO shared_sales_state (empresa_id, source_revision, built_revision, initialized)
        VALUES (:empresa_id, 1, 0, FALSE)
        ON CONFLICT (empresa_id) DO UPDATE SET source_revision = shared_sales_state.source_revision + 1
    """), {"empresa_id": empresa_id})
    if (fin - inicio).days > 3660:
        db.execute(text("UPDATE shared_sales_state SET initialized=FALSE WHERE empresa_id=:empresa_id"), {"empresa_id": empresa_id})
        return
    fechas = [{"empresa_id": empresa_id, "fecha": inicio + timedelta(days=i)} for i in range((fin - inicio).days + 1)]
    if fechas:
        db.execute(text("INSERT INTO shared_sales_dirty (empresa_id, fecha_venta) VALUES (:empresa_id, :fecha) ON CONFLICT (empresa_id, fecha_venta) DO NOTHING"), fechas)


def recalcular_ventas_compartidas(db: Session, empresa_id: int) -> bool:
    """Reconstruye sólo fechas pendientes; primera ejecución reconstruye todo.

    Debe llamarse dentro de la misma transacción que se confirmará por el
    llamador. El bloqueo del estado serializa escrituras y publicaciones.
    """
    if not materializacion_instalada(db):
        return False
    suffix = " FOR UPDATE" if db.get_bind().dialect.name == "postgresql" else ""
    estado = db.execute(text("SELECT source_revision, built_revision, initialized FROM shared_sales_state WHERE empresa_id=:empresa_id" + suffix), {"empresa_id": empresa_id}).mappings().first()
    if not estado:
        return False
    dirty = db.execute(text("SELECT COUNT(*) FROM shared_sales_dirty WHERE empresa_id=:empresa_id"), {"empresa_id": empresa_id}).scalar_one()
    if estado["initialized"] and estado["source_revision"] == estado["built_revision"] and not dirty:
        return True
    if estado["initialized"] and dirty:
        condicion = "AND v.fecha_venta IN (SELECT fecha_venta FROM shared_sales_dirty WHERE empresa_id=:empresa_id)"
        db.execute(text("DELETE FROM shared_sales_daily WHERE empresa_id=:empresa_id AND fecha_venta IN (SELECT fecha_venta FROM shared_sales_dirty WHERE empresa_id=:empresa_id)"), {"empresa_id": empresa_id})
    else:
        condicion = ""
        db.execute(text("DELETE FROM shared_sales_daily WHERE empresa_id=:empresa_id"), {"empresa_id": empresa_id})
    db.execute(text(f"""
        INSERT INTO shared_sales_daily (empresa_id, fecha_venta, producto_id, cliente_key,
            ingreso_total, cantidad_vendida, margen_bruto_eur, margen_destino_eur)
        SELECT p.empresa_id, v.fecha_venta, v.producto_id, COALESCE(v.cliente_id, 0),
            COALESCE(SUM(v.ingreso_total), 0), COALESCE(SUM(v.cantidad_vendida), 0),
            COALESCE(SUM(v.margen_bruto_eur), 0), COALESCE(SUM(v.margen_destino_eur), 0)
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id {condicion}
        GROUP BY p.empresa_id, v.fecha_venta, v.producto_id, COALESCE(v.cliente_id, 0)
    """), {"empresa_id": empresa_id})
    db.execute(text("DELETE FROM shared_sales_dirty WHERE empresa_id=:empresa_id"), {"empresa_id": empresa_id})
    db.execute(text("""
        UPDATE shared_sales_state SET built_revision=source_revision, initialized=TRUE,
          calculated_at=:calculated_at,
          coverage_start=(SELECT MIN(fecha_venta) FROM shared_sales_daily WHERE empresa_id=:empresa_id),
          coverage_end=(SELECT MAX(fecha_venta) FROM shared_sales_daily WHERE empresa_id=:empresa_id)
        WHERE empresa_id=:empresa_id
    """), {"empresa_id": empresa_id, "calculated_at": datetime.now(timezone.utc)})
    return True


def procesar_pendientes(session_factory, max_empresas: int = 5) -> None:
    with session_factory() as db:
        try:
            if not materializacion_instalada(db):
                return
            empresas = db.execute(text("""
                SELECT s.empresa_id FROM shared_sales_state s
                WHERE NOT s.initialized OR s.source_revision <> s.built_revision
                   OR EXISTS (SELECT 1 FROM shared_sales_dirty d WHERE d.empresa_id=s.empresa_id)
                ORDER BY s.empresa_id LIMIT :limite
            """), {"limite": max_empresas}).scalars().all()
            for empresa_id in empresas:
                try:
                    recalcular_ventas_compartidas(db, empresa_id)
                    db.commit()
                except Exception:
                    db.rollback()
                    logger.exception("No se pudo actualizar la analítica compartida de empresa %s", empresa_id)
        except Exception:
            db.rollback()
            logger.exception("No se pudieron consultar las revisiones de analítica compartida")


async def ciclo_materializacion(session_factory, intervalo_segundos: int = 30) -> None:
    while True:
        await asyncio.to_thread(procesar_pendientes, session_factory)
        await asyncio.sleep(intervalo_segundos)
