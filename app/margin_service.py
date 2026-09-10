"""Consultas deterministas para Marginalidad; nunca calcula desde porcentajes de línea."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


MARGIN_COLUMNS = {"mg": "margen_bruto_eur", "mgd": "margen_destino_eur"}
DETAIL_DIMENSIONS = {
    "sku": ("p.sku", "p.sku", "p.nombre", "p.familia", "p.product_manager"),
    "familia": ("COALESCE(p.familia, 'Sin familia')", "COALESCE(p.familia, 'Sin familia')", "NULL", "COALESCE(p.familia, 'Sin familia')", "NULL"),
    "cliente": ("COALESCE(c.cliente_pk, 'Sin cliente')", "COALESCE(c.cliente_pk, 'Sin cliente')", "COALESCE(c.nombre, 'Sin nombre cliente')", "NULL", "NULL"),
    "comercial": ("COALESCE(NULLIF(v.comercial_factura, ''), 'Sin comercial')", "COALESCE(NULLIF(v.comercial_factura, ''), 'Sin comercial')", "NULL", "NULL", "NULL"),
    "product_manager": ("COALESCE(p.product_manager, 'Sin Product Manager')", "COALESCE(p.product_manager, 'Sin Product Manager')", "NULL", "NULL", "COALESCE(p.product_manager, 'Sin Product Manager')"),
}


def _number(value: Any) -> float:
    return float(value or 0)


def _pct(margin: float, sales: float) -> float | None:
    return margin / sales * 100 if sales > 0 else None


def resolve_period(db: Session, empresa_id: int, window: str, start: date | None = None, end: date | None = None) -> tuple[date, date, date, date]:
    anchor = db.execute(text("""
        SELECT MAX(v.fecha_venta) FROM ventas_historicas v
        JOIN productos p ON p.id = v.producto_id WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).scalar()
    if not anchor:
        raise ValueError("No hay ventas cargadas para calcular marginalidad.")
    if isinstance(anchor, str):
        anchor = date.fromisoformat(anchor)
    if window == "custom":
        if not start or not end or start > end:
            raise ValueError("El rango personalizado requiere fechas de inicio y fin válidas.")
        current_start, current_end = start, end
    else:
        current_end = anchor
        if window == "fytd":
            fiscal_year = anchor.year if anchor.month >= 5 else anchor.year - 1
            current_start = date(fiscal_year, 5, 1)
        else:
            days = {"30d": 30, "90d": 90, "12m": 365}[window]
            current_start = anchor - timedelta(days=days - 1)
    length = (current_end - current_start).days + 1
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=length - 1)
    return current_start, current_end, previous_start, previous_end


def _summary(db: Session, empresa_id: int, start: date, end: date) -> dict[str, float | None]:
    row = db.execute(text("""
        SELECT COALESCE(SUM(v.ingreso_total), 0) ventas,
               COALESCE(SUM(v.margen_bruto_eur), 0) mg,
               COALESCE(SUM(v.margen_destino_eur), 0) mgd,
               COUNT(DISTINCT CASE WHEN v.margen_bruto_eur < 0 OR v.margen_destino_eur < 0 THEN p.sku END) sku_negativos,
               COALESCE(SUM(CASE WHEN v.margen_bruto_eur < 0 OR v.margen_destino_eur < 0 THEN CASE WHEN v.margen_bruto_eur < v.margen_destino_eur THEN v.margen_bruto_eur ELSE v.margen_destino_eur END ELSE 0 END), 0) margen_negativo,
               COUNT(CASE WHEN v.margen_destino_eur > v.margen_bruto_eur THEN 1 END) lineas_mgd_superior_mg,
               COALESCE(SUM(CASE WHEN v.margen_destino_eur > v.margen_bruto_eur THEN v.margen_destino_eur - v.margen_bruto_eur ELSE 0 END), 0) exceso_mgd_sobre_mg_eur
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :start AND :end
    """), {"empresa_id": empresa_id, "start": start, "end": end}).mappings().one()
    sales, mg, mgd = _number(row["ventas"]), _number(row["mg"]), _number(row["mgd"])
    return {"ventas_eur": sales, "mg_eur": mg, "mg_pct": _pct(mg, sales), "mgd_eur": mgd, "mgd_pct": _pct(mgd, sales), "diferencia_eur": mg - mgd, "diferencia_pp": (_pct(mg, sales) - _pct(mgd, sales)) if sales > 0 else None, "sku_negativos": int(row["sku_negativos"] or 0), "margen_negativo_eur": _number(row["margen_negativo"]), "lineas_mgd_superior_mg": int(row["lineas_mgd_superior_mg"] or 0), "exceso_mgd_sobre_mg_eur": _number(row["exceso_mgd_sobre_mg_eur"])}


def overview(db: Session, empresa_id: int, window: str, start: date | None = None, end: date | None = None) -> dict:
    cs, ce, ps, pe = resolve_period(db, empresa_id, window, start, end)
    current, previous = _summary(db, empresa_id, cs, ce), _summary(db, empresa_id, ps, pe)
    daily = db.execute(text("""
        SELECT v.fecha_venta fecha, COALESCE(SUM(v.ingreso_total),0) ventas_eur,
               COALESCE(SUM(v.margen_bruto_eur),0) mg_eur, COALESCE(SUM(v.margen_destino_eur),0) mgd_eur
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :start AND :end
        GROUP BY v.fecha_venta ORDER BY v.fecha_venta
    """), {"empresa_id": empresa_id, "start": cs, "end": ce}).mappings().all()
    concentration = _concentration_rows(db, empresa_id, cs, ce, "mgd")
    total = sum(max(0, _number(row["margen_eur"])) for row in concentration)
    top10 = sum(max(0, _number(row["margen_eur"])) for row in concentration[:10])
    return {"periodo": {"inicio": str(cs), "fin": str(ce), "anterior_inicio": str(ps), "anterior_fin": str(pe)}, "actual": current, "anterior": previous, "variacion": {key: (_number(current[key]) - _number(previous[key])) if current[key] is not None and previous[key] is not None else None for key in current}, "top10_mgd_positivo_pct": top10 / total * 100 if total > 0 else None, "serie_diaria": [{**dict(row), "mg_pct": _pct(_number(row["mg_eur"]), _number(row["ventas_eur"])), "mgd_pct": _pct(_number(row["mgd_eur"]), _number(row["ventas_eur"]))} for row in daily]}


def _concentration_rows(db: Session, empresa_id: int, start: date, end: date, metric: str) -> list[dict]:
    margin = MARGIN_COLUMNS[metric]
    return [dict(row) for row in db.execute(text(f"""
        SELECT p.sku, p.nombre, COALESCE(p.familia,'Sin familia') familia, COALESCE(p.product_manager,'Sin Product Manager') product_manager,
               COALESCE(SUM(v.ingreso_total),0) ventas_eur, COALESCE(SUM(v.{margin}),0) margen_eur
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :start AND :end
        GROUP BY p.sku, p.nombre, p.familia, p.product_manager ORDER BY margen_eur DESC, p.sku LIMIT 500
    """), {"empresa_id": empresa_id, "start": start, "end": end}).mappings().all()]


def concentration(db: Session, empresa_id: int, metric: str, window: str, start: date | None = None, end: date | None = None) -> dict:
    cs, ce, _, _ = resolve_period(db, empresa_id, window, start, end)
    rows = _concentration_rows(db, empresa_id, cs, ce, metric)
    total, positive_total = sum(_number(row["margen_eur"]) for row in rows), sum(max(0, _number(row["margen_eur"])) for row in rows)
    running, hhi, enriched = 0.0, 0.0, []
    for row in rows:
        margin = _number(row["margen_eur"]); running += margin
        weight = margin / total * 100 if total else None
        positive_weight = max(0, margin) / positive_total * 100 if positive_total else None
        if positive_weight is not None: hhi += positive_weight ** 2
        enriched.append({**row, "tasa_margen_pct": _pct(margin, _number(row["ventas_eur"])), "peso_total_pct": weight, "peso_acumulado_pct": running / total * 100 if total else None, "peso_sobre_positivos_pct": positive_weight})
    top10 = sum(_number(row["margen_eur"]) for row in enriched[:10])
    def reaches(target: float) -> int | None:
        current = 0.0
        for index, row in enumerate(enriched, 1):
            current += max(0, _number(row["margen_eur"]))
            if positive_total and current / positive_total >= target: return index
        return None
    return {"periodo": {"inicio": str(cs), "fin": str(ce)}, "metrica": metric, "total_eur": total, "total_positivo_eur": positive_total, "top10_eur": top10, "top10_total_pct": top10 / total * 100 if total else None, "top10_positivos_pct": top10 / positive_total * 100 if positive_total else None, "skus_50_pct": reaches(.5), "skus_80_pct": reaches(.8), "hhi": hhi, "filas": enriched[:20]}


def margin_detail(db: Session, empresa_id: int, dimension: str, metric: str, window: str, page: int, limit: int, order: str, direction: str, search: str | None = None, family: str | None = None, product_manager: str | None = None, only_negative: bool = False, start: date | None = None, end: date | None = None) -> dict:
    if dimension not in DETAIL_DIMENSIONS: raise ValueError("Dimensión no válida.")
    cs, ce, ps, pe = resolve_period(db, empresa_id, window, start, end)
    entity, entity_id, name, family_expr, manager = DETAIL_DIMENSIONS[dimension]
    active_margin = MARGIN_COLUMNS[metric]
    allowed_order = {"entidad": "entidad", "ventas_eur": "ventas_eur", "mg_eur": "mg_eur", "mgd_eur": "mgd_eur", "unidades": "unidades", "variacion_eur": f"SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.{active_margin} ELSE 0 END) - SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.{active_margin} ELSE 0 END)"}
    order_sql = allowed_order.get(order, "mgd_eur")
    direction_sql = "ASC" if direction.lower() == "asc" else "DESC"
    filters = ["p.empresa_id=:empresa_id", "v.fecha_venta BETWEEN :ps AND :ce"]
    params: dict[str, Any] = {"empresa_id": empresa_id, "cs": cs, "ce": ce, "ps": ps, "pe": pe, "limit": limit, "offset": (page - 1) * limit}
    if search: filters.append(f"LOWER({entity}) LIKE :search"); params["search"] = f"%{search.lower()}%"
    if family: filters.append("COALESCE(p.familia,'Sin familia')=:family"); params["family"] = family
    if product_manager: filters.append("COALESCE(p.product_manager,'Sin Product Manager')=:product_manager"); params["product_manager"] = product_manager
    having = "HAVING SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_bruto_eur ELSE 0 END) < 0 OR SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END) < 0" if only_negative else ""
    rows = db.execute(text(f"""
        SELECT {entity} entidad, {entity_id} entidad_id, {name} nombre, {family_expr} familia, {manager} product_manager,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_eur,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_bruto_eur ELSE 0 END) mg_eur,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END) mgd_eur,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END) unidades,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.{MARGIN_COLUMNS[metric]} ELSE 0 END) margen_anterior_eur,
          COUNT(DISTINCT p.sku) referencias
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id LEFT JOIN clientes c ON c.id=v.cliente_id
        WHERE {' AND '.join(filters)} GROUP BY {entity}, {entity_id}, {name}, {family_expr}, {manager} {having}
        ORDER BY {order_sql} {direction_sql} LIMIT :limit OFFSET :offset
    """), params).mappings().all()
    result = []
    for row in rows:
        item = dict(row); item["mg_pct"] = _pct(_number(item["mg_eur"]), _number(item["ventas_eur"])); item["mgd_pct"] = _pct(_number(item["mgd_eur"]), _number(item["ventas_eur"])); item["diferencia_mg_mgd_pp"] = item["mg_pct"] - item["mgd_pct"] if item["mg_pct"] is not None and item["mgd_pct"] is not None else None; item["variacion_eur"] = _number(item["mg_eur"] if metric == "mg" else item["mgd_eur"]) - _number(item["margen_anterior_eur"]); result.append(item)
    return {"periodo": {"inicio": str(cs), "fin": str(ce)}, "dimension": dimension, "metrica_destacada": metric, "page": page, "limit": limit, "filas": result}


def bridge(db: Session, empresa_id: int, metric: str, window: str, start: date | None = None, end: date | None = None) -> dict:
    cs, ce, ps, pe = resolve_period(db, empresa_id, window, start, end); column = MARGIN_COLUMNS[metric]
    rows = db.execute(text(f"""
        SELECT p.sku, SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actual,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END) unidades_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END) unidades_actual,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.{column} ELSE 0 END) margen_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.{column} ELSE 0 END) margen_actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce GROUP BY p.sku
    """), {"empresa_id": empresa_id, "ps": ps, "pe": pe, "cs": cs, "ce": ce}).mappings().all()
    price = cost = delta = 0.0
    for row in rows:
        ub, ua = _number(row["unidades_base"]), _number(row["unidades_actual"])
        if not ua: continue
        vb, va, mb, ma = map(_number, (row["ventas_base"], row["ventas_actual"], row["margen_base"], row["margen_actual"]))
        price += ((va / ua) - (vb / ub if ub else 0)) * ua
        cost += (((vb - mb) / ub if ub else 0) - (va - ma) / ua) * ua
        delta += ma - mb
    return {"metrica": metric, "periodo": {"inicio": str(cs), "fin": str(ce), "anterior_inicio": str(ps), "anterior_fin": str(pe)}, "efecto_precio_eur": price, "efecto_coste_eur": cost, "efecto_mix_residual_eur": delta - price - cost, "delta_margen_eur": delta, "nota": "El efecto mix es el residuo no explicado directamente por precio ni coste."}


def entity_series(db: Session, empresa_id: int, entity_type: str, entity_id: str, window: str, start: date | None = None, end: date | None = None) -> dict:
    if entity_type not in DETAIL_DIMENSIONS: raise ValueError("Tipo de entidad no válido.")
    cs, ce, _, _ = resolve_period(db, empresa_id, window, start, end)
    expression = DETAIL_DIMENSIONS[entity_type][0]
    rows = db.execute(text(f"""
        SELECT v.fecha_venta fecha, COALESCE(SUM(v.ingreso_total),0) ventas_eur,
          COALESCE(SUM(v.margen_bruto_eur),0) mg_eur, COALESCE(SUM(v.margen_destino_eur),0) mgd_eur
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id LEFT JOIN clientes c ON c.id=v.cliente_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :start AND :end AND {expression}=:entity_id
        GROUP BY v.fecha_venta ORDER BY v.fecha_venta
    """), {"empresa_id": empresa_id, "start": cs, "end": ce, "entity_id": entity_id}).mappings().all()
    months: dict[str, dict[str, float]] = {}
    for row in rows:
        key = str(row["fecha"])[:7]; bucket = months.setdefault(key, {"ventas_eur": 0.0, "mg_eur": 0.0, "mgd_eur": 0.0})
        for value in bucket: bucket[value] += _number(row[value])
    return {"entidad_tipo": entity_type, "entidad_id": entity_id, "periodo": {"inicio": str(cs), "fin": str(ce)}, "serie_mensual": [{"mes": key, **values, "mg_pct": _pct(values["mg_eur"], values["ventas_eur"]), "mgd_pct": _pct(values["mgd_eur"], values["ventas_eur"])} for key, values in months.items()]}
