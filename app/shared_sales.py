"""Comparativas comerciales deterministas compartidas por los módulos.

La vista usa los agregados publicados solo cuando su revisión está al día;
en otro caso consulta los hechos originales. No certifica la cobertura de carga.
"""
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


DIMENSIONES = {
    "sku": ("CAST(p.id AS TEXT)", "COALESCE(p.sku, 'Sin SKU')", "COALESCE(p.nombre, 'Sin nombre')", ""),
    "cliente": ("CAST(c.id AS TEXT)", "COALESCE(c.cliente_pk, 'Sin identificar')", "COALESCE(c.nombre, 'Sin nombre cliente')", "JOIN clientes c ON c.id = v.cliente_id AND c.empresa_id = p.empresa_id"),
    "seccion": ("COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')", "COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')", "COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')", ""),
    "familia": ("COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')", "COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')", "COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')", ""),
}
FILTROS = {"familia": "p.familia", "marca": "p.marca", "familia_marca": "p.familia_marca", "seccion": "p.seccion", "product_manager": "p.product_manager", "sku": "p.sku"}


def origen_ventas(db: Session) -> str:
    """La vista decide por transacción entre datos preparados y hechos actuales."""
    try:
        with db.begin_nested():
            db.execute(text("SELECT 1 FROM shared_sales_effective LIMIT 0"))
        return "shared_sales_effective"
    except Exception:
        # Migración o permiso aún no desplegado: continuar con la fuente real.
        return "ventas_historicas"


def revision_ventas(db: Session, empresa_id: int) -> int | None:
    """Versión de origen; None cuando todavía no existe la migración."""
    try:
        with db.begin_nested():
            valor = db.execute(text("SELECT source_revision FROM shared_sales_state WHERE empresa_id=:empresa_id"), {"empresa_id": empresa_id}).scalar()
        return int(valor) if valor is not None else None
    except Exception:
        return None


def ultimo_dia_ventas(db: Session, empresa_id: int, inicio: date, fin: date, filtros: dict[str, Any] | None = None) -> date | None:
    filtros = filtros or {}
    if set(filtros) - set(FILTROS):
        raise ValueError("Filtro no soportado por la comparativa compartida")
    condiciones = ["p.empresa_id = :empresa_id", "v.fecha_venta BETWEEN :inicio AND :fin"]
    parametros: dict[str, Any] = {"empresa_id": empresa_id, "inicio": inicio, "fin": fin}
    for clave, valor in filtros.items():
        if valor is not None:
            condiciones.append(f"LOWER(COALESCE({FILTROS[clave]}, '')) = LOWER(:f_{clave})")
            parametros[f"f_{clave}"] = valor
    fuente = origen_ventas(db)
    value = db.execute(text(f"SELECT MAX(v.fecha_venta) FROM {fuente} v JOIN productos p ON p.id = v.producto_id WHERE {' AND '.join(condiciones)}"), parametros).scalar()
    return date.fromisoformat(str(value)[:10]) if value else None


def comparar_ventas_por_dimension(
    db: Session, empresa_id: int, actual: tuple[date, date], anterior: tuple[date, date],
    dimension: str, filtros: dict[str, Any] | None = None, direccion: str | None = None, limite: int | None = None,
) -> list[dict[str, Any]]:
    """Devuelve ventas y unidades por entidad, con orden estable por impacto.

    Una base previa no positiva produce porcentaje N/D, no cero ni infinito.
    Los nombres y secciones son los del catálogo actual, no históricos.
    """
    if dimension not in DIMENSIONES or direccion not in {None, "subidas", "caidas"}:
        raise ValueError("Dimensión o dirección no soportada")
    if actual[0] > actual[1] or anterior[0] > anterior[1]:
        raise ValueError("Período inválido")
    filtros = filtros or {}
    if set(filtros) - set(FILTROS):
        raise ValueError("Filtro no soportado por la comparativa compartida")
    identificador, codigo, nombre, join = DIMENSIONES[dimension]
    condiciones = ["p.empresa_id = :empresa_id"]
    parametros: dict[str, Any] = {"empresa_id": empresa_id, "cs": actual[0], "ce": actual[1], "ps": anterior[0], "pe": anterior[1]}
    for clave, valor in filtros.items():
        if valor is not None:
            condiciones.append(f"LOWER(COALESCE({FILTROS[clave]}, '')) = LOWER(:f_{clave})")
            parametros[f"f_{clave}"] = valor
    if dimension == "cliente":
        condiciones.append("c.cliente_pk <> 'SIN-CLIENTE'")
    condiciones.append("((v.fecha_venta BETWEEN :cs AND :ce) OR (v.fecha_venta BETWEEN :ps AND :pe))")
    cambio = "(COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END), 0))"
    having = f"HAVING {cambio} {'< 0' if direccion == 'caidas' else '> 0'}" if direccion else ""
    orden = "ORDER BY cambio ASC, codigo ASC" if direccion == "caidas" else "ORDER BY cambio DESC, codigo ASC" if direccion == "subidas" else ""
    limite_sql = "LIMIT :limite" if limite is not None and direccion else ""
    if limite_sql:
        parametros["limite"] = max(1, min(limite, 50))
    fuente = origen_ventas(db)
    rows = db.execute(text(f"""
        SELECT {identificador} entidad_id, {codigo} codigo, {nombre} entidad,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END), 0) actual,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END), 0) previo,
          {cambio} AS cambio,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END), 0) unidades_actuales,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END), 0) unidades_previas
        FROM {fuente} v JOIN productos p ON p.id = v.producto_id {join}
        WHERE {' AND '.join(condiciones)}
        GROUP BY {identificador}, {codigo}, {nombre} {having} {orden} {limite_sql}
    """), parametros).mappings().all()
    result = []
    for row in rows:
        current, previous = float(row["actual"] or 0), float(row["previo"] or 0)
        delta = current - previous
        if direccion == "caidas" and delta >= 0 or direccion == "subidas" and delta <= 0:
            continue
        result.append({"entidad_id": row["entidad_id"], "codigo": row["codigo"], "entidad": row["entidad"],
                       "actual": current, "previo": previous, "variacion_eur": delta,
                       "variacion_pct": delta / previous * 100 if previous > 0 else None,
                       "unidades_actuales": float(row["unidades_actuales"] or 0),
                       "unidades_previas": float(row["unidades_previas"] or 0)})
    result.sort(key=lambda row: (-(abs(row["variacion_eur"])), str(row["codigo"])))
    return result[:max(1, min(limite, 50))] if limite is not None else result


def comprobar_extremos_periodos(db: Session, empresa_id: int, actual: tuple[date, date], anterior: tuple[date, date], filtros: dict[str, Any] | None = None) -> bool:
    """Control conservador: fechas extremas equivalentes no certifican cobertura."""
    filtros = filtros or {}
    if set(filtros) - set(FILTROS):
        raise ValueError("Filtro no soportado por la comparativa compartida")
    condiciones = ["p.empresa_id = :empresa_id"]
    parametros: dict[str, Any] = {"empresa_id": empresa_id, "cs": actual[0], "ce": actual[1], "ps": anterior[0], "pe": anterior[1]}
    for clave, valor in filtros.items():
        if valor is not None:
            condiciones.append(f"LOWER(COALESCE({FILTROS[clave]}, '')) = LOWER(:f_{clave})")
            parametros[f"f_{clave}"] = valor
    fuente = origen_ventas(db)
    row = db.execute(text(f"""
        SELECT MIN(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.fecha_venta END) primera_actual,
               MAX(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.fecha_venta END) ultima_actual,
               MIN(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.fecha_venta END) primera_anterior,
               MAX(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.fecha_venta END) ultima_anterior
        FROM {fuente} v JOIN productos p ON p.id = v.producto_id
        WHERE {' AND '.join(condiciones)}
          AND ((v.fecha_venta BETWEEN :cs AND :ce) OR (v.fecha_venta BETWEEN :ps AND :pe))
    """), parametros).mappings().one()
    def to_date(value: Any) -> date | None:
        return date.fromisoformat(str(value)[:10]) if value else None
    ca, cb, pa, pb = (to_date(row[key]) for key in ("primera_actual", "ultima_actual", "primera_anterior", "ultima_anterior"))
    return bool(ca and cb and pa and pb and (actual[1] - actual[0]).days == (anterior[1] - anterior[0]).days
                and (ca - actual[0]).days == (pa - anterior[0]).days and (actual[1] - cb).days == (anterior[1] - pb).days)
