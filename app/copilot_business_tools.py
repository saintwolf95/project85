"""Herramientas deterministas compartidas por Copilot y Control IA."""
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from .agent_signals import get_active_signals


METRIC_DICTIONARY = [
    {"terms": ("mgd", "margen destino"), "definition": "MGD es margen puesto en destino. Se calcula como suma de margen_destino_eur / suma de ventas, nunca como promedio de porcentajes."},
    {"terms": ("mg", "margen bruto"), "definition": "MG es margen bruto: suma de margen_bruto_eur / suma de ventas."},
    {"terms": ("abc",), "definition": "ABC clasifica artículos por ventas EUR de los últimos 90 días; A concentra la mayor contribución comercial."},
    {"terms": ("xyz",), "definition": "XYZ usa valor de inventario actual. No es fiable sin inventario real e histórico suficiente."},
    {"terms": ("año fiscal", "ano fiscal", "fy"), "definition": "El año fiscal de Five Minutes empieza el 1 de mayo y termina el 30 de abril."},
    {"terms": ("seccion", "sección"), "definition": "Sección es la subcategoría operativa del catálogo, distinta de familia y marca."},
]


def semantic_context(message: str) -> str:
    normalized = message.lower()
    matches = [item["definition"] for item in METRIC_DICTIONARY if any(term in normalized for term in item["terms"])]
    return "\n".join(f"- {item}" for item in matches[:3]) or "- Ventas significa ingreso_total en euros; comparar siempre periodos equivalentes."


def buscar_senales(db: Session, empresa_id: int, agente: str | None = None, entidad: str | None = None, periodo: tuple[date, date] | None = None) -> list[dict[str, Any]]:
    rows = get_active_signals(db, empresa_id, agente, limit=100)
    entity_normalized = (entidad or "").lower()
    result = []
    for row in rows:
        if entity_normalized and entity_normalized not in (row.entidad_id or "").lower():
            continue
        if periodo and (row.periodo_fin < periodo[0] or row.periodo_inicio > periodo[1]):
            continue
        result.append({"detector": row.detector, "agente": row.agente, "entidad": row.entidad_id, "periodo": [str(row.periodo_inicio), str(row.periodo_fin)], "impacto_eur": float(row.impacto_eur or 0), "confianza": float(row.confianza or 0), "estado": row.estado, "evidencia": row.evidencia})
    return result


def descomponer_variacion(db: Session, empresa_id: int, periodo_a: tuple[date, date], periodo_b: tuple[date, date], dimension: str = "familia", value: str | None = None) -> list[dict[str, Any]]:
    """Puente precio, volumen, mix de SKU y clientes con consultas parametrizadas."""
    column = {"familia": "p.familia", "marca": "p.marca", "seccion": "p.seccion"}.get(dimension, "p.familia")
    filter_sql, params = "", {"empresa_id": empresa_id, "a_start": periodo_a[0], "a_end": periodo_a[1], "b_start": periodo_b[0], "b_end": periodo_b[1]}
    if value:
        filter_sql = f" AND {column} = :value"
        params["value"] = value
    rows = db.execute(text(f"""
        SELECT COALESCE({column}, 'Sin dato') entidad, p.id producto_id,
          SUM(CASE WHEN v.fecha_venta BETWEEN :a_start AND :a_end THEN v.ingreso_total ELSE 0 END) ventas_a,
          SUM(CASE WHEN v.fecha_venta BETWEEN :b_start AND :b_end THEN v.ingreso_total ELSE 0 END) ventas_b,
          SUM(CASE WHEN v.fecha_venta BETWEEN :a_start AND :a_end THEN v.cantidad_vendida ELSE 0 END) unidades_a,
          SUM(CASE WHEN v.fecha_venta BETWEEN :b_start AND :b_end THEN v.cantidad_vendida ELSE 0 END) unidades_b
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :a_start AND :b_end {filter_sql}
        GROUP BY COALESCE({column}, 'Sin dato'), p.id
    """), params).mappings().all()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["entidad"], []).append(dict(row))
    customer_rows = db.execute(text(f"""
        SELECT COALESCE({column}, 'Sin dato') entidad, COALESCE(c.nombre, 'Cliente sin identificar') cliente,
          SUM(CASE WHEN v.fecha_venta BETWEEN :a_start AND :a_end THEN v.ingreso_total ELSE 0 END) ventas_a,
          SUM(CASE WHEN v.fecha_venta BETWEEN :b_start AND :b_end THEN v.ingreso_total ELSE 0 END) ventas_b
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id LEFT JOIN clientes c ON c.id=v.cliente_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :a_start AND :b_end {filter_sql}
        GROUP BY COALESCE({column}, 'Sin dato'), COALESCE(c.nombre, 'Cliente sin identificar')
    """), params).mappings().all()
    customers: dict[str, list[dict]] = {}
    for row in customer_rows:
        customers.setdefault(row["entidad"], []).append({"cliente": row["cliente"], "variacion_eur": float(row["ventas_b"] or 0) - float(row["ventas_a"] or 0)})
    result = []
    for entity, products in grouped.items():
        ua_total, ub_total = sum(float(row["unidades_a"] or 0) for row in products), sum(float(row["unidades_b"] or 0) for row in products)
        va_total, vb_total = sum(float(row["ventas_a"] or 0) for row in products), sum(float(row["ventas_b"] or 0) for row in products)
        base_price = va_total / ua_total if ua_total else 0
        volume = mix = price = 0.0
        for row in products:
            ua, ub, va, vb = (float(row[key] or 0) for key in ("unidades_a", "unidades_b", "ventas_a", "ventas_b"))
            product_base_price, product_current_price = (va / ua if ua else base_price), (vb / ub if ub else base_price)
            quantity_change = ub - ua
            volume += quantity_change * base_price
            mix += quantity_change * (product_base_price - base_price)
            price += (product_current_price - product_base_price) * ub
        result.append({"entidad": entity, "ventas_periodo_a_eur": va_total, "ventas_periodo_b_eur": vb_total, "efecto_volumen_eur": volume, "efecto_mix_eur": mix, "efecto_precio_eur": price, "precio_medio_a_eur": base_price, "precio_medio_b_eur": vb_total / ub_total if ub_total else 0, "clientes_impulsores": sorted(customers.get(entity, []), key=lambda item: item["variacion_eur"])[:5]})
    return sorted(result, key=lambda item: abs(item["ventas_periodo_b_eur"] - item["ventas_periodo_a_eur"]), reverse=True)


def serie_temporal(db: Session, empresa_id: int, metric: str, start: date, end: date, family: str | None = None) -> list[dict[str, Any]]:
    column = {"ventas": "SUM(v.ingreso_total)", "unidades": "SUM(v.cantidad_vendida)", "mgd": "SUM(v.margen_destino_eur)"}.get(metric, "SUM(v.ingreso_total)")
    family_filter = " AND p.familia=:family" if family else ""
    params = {"empresa_id": empresa_id, "start": start, "end": end, "family": family}
    return [dict(row) for row in db.execute(text(f"""
        SELECT v.fecha_venta fecha, {column} valor FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :start AND :end {family_filter}
        GROUP BY v.fecha_venta ORDER BY v.fecha_venta
    """), params).mappings().all()]

