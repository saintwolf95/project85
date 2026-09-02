"""Dashboard ejecutivo calculado de forma determinista y aislado por empresa."""
from __future__ import annotations

from datetime import date, timedelta
from threading import RLock

from cachetools import TTLCache, cached
from sqlalchemy import text
from sqlalchemy.orm import Session


PERIOD_DAYS = {"30d": 30, "90d": 90}
BREAKDOWN_DIMENSIONS = {
    "comercial": (
        "COALESCE(NULLIF(TRIM(v.comercial_factura), ''), 'Sin comercial')",
        "COALESCE(NULLIF(TRIM(v.comercial_factura), ''), 'Sin comercial')",
        "Comercial de factura",
    ),
    "cliente": (
        "COALESCE(NULLIF(TRIM(c.cliente_pk), ''), 'SIN-CLIENTE')",
        "COALESCE(NULLIF(TRIM(c.cliente_pk), '') || ' · ' || NULLIF(TRIM(c.nombre), ''), "
        "NULLIF(TRIM(c.cliente_pk), ''), NULLIF(TRIM(c.nombre), ''), 'Sin nombre cliente')",
        "Cliente",
    ),
    "familia": (
        "COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')",
        "COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')",
        "Familia",
    ),
    "marca": (
        "COALESCE(NULLIF(TRIM(p.marca), ''), 'Sin marca')",
        "COALESCE(NULLIF(TRIM(p.marca), ''), 'Sin marca')",
        "Marca",
    ),
    "seccion": (
        "COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')",
        "COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')",
        "Sección",
    ),
}
FILTER_SQL = """
 AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
 AND (:marca IS NULL OR LOWER(COALESCE(p.marca, '')) = LOWER(:marca))
 AND (:familia_marca IS NULL OR LOWER(COALESCE(p.familia_marca, '')) = LOWER(:familia_marca))
 AND (:seccion IS NULL OR LOWER(COALESCE(p.seccion, '')) = LOWER(:seccion))
"""
_dashboard_cache = TTLCache(maxsize=256, ttl=300)
_dashboard_cache_lock = RLock()


def invalidate_dashboard_cache(empresa_id: int) -> None:
    with _dashboard_cache_lock:
        for key in list(_dashboard_cache):
            if key[0] == empresa_id:
                _dashboard_cache.pop(key, None)


def _number(value) -> float:
    return float(value or 0)


def _pct(current: float, previous: float) -> float | None:
    return round((current - previous) / abs(previous) * 100, 2) if previous else None


def _clean(value: str | None) -> str | None:
    return value.strip() if value and value.strip() else None


def _fiscal_start(anchor: date) -> date:
    return date(anchor.year if anchor.month >= 5 else anchor.year - 1, 5, 1)


def _shift_year(value: date, years: int = -1) -> date:
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(year=value.year + years, day=28)


def _month_starts(start: date, end: date) -> list[date]:
    month, result = start.replace(day=1), []
    while month <= end:
        result.append(month)
        month = date(month.year + (month.month == 12), month.month % 12 + 1, 1)
    return result


def comparison_window(anchor: date, period: str) -> tuple[date, date, date, date]:
    """Devuelve período actual y comparable de idéntica duración."""
    if period == "fytd":
        current_start = _fiscal_start(anchor)
        previous_start = current_start.replace(year=current_start.year - 1)
        previous_end = previous_start + (anchor - current_start)
    else:
        days = PERIOD_DAYS.get(period, 90)
        current_start = anchor - timedelta(days=days - 1)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)
    return current_start, anchor, previous_start, previous_end


def _filters(familia=None, marca=None, familia_marca=None, seccion=None) -> dict:
    return {key: _clean(value) for key, value in {
        "familia": familia, "marca": marca, "familia_marca": familia_marca, "seccion": seccion,
    }.items()}


def _sales_totals(db: Session, empresa_id: int, start: date, end: date, filters: dict) -> dict:
    row = db.execute(text(f"""
        SELECT COALESCE(SUM(v.ingreso_total), 0) ventas_eur,
               COALESCE(SUM(v.cantidad_vendida), 0) unidades,
               COALESCE(SUM(v.margen_bruto_eur), 0) margen_eur,
               COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur,
               COUNT(DISTINCT v.producto_id) skus_con_venta,
               COUNT(DISTINCT v.cliente_id) clientes_con_venta
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :start AND :end {FILTER_SQL}
    """), {"empresa_id": empresa_id, "start": start, "end": end, **filters}).mappings().one()
    sales, margin, mgd = map(_number, (row["ventas_eur"], row["margen_eur"], row["mgd_eur"]))
    return {
        "ventas_eur": sales, "unidades": int(row["unidades"] or 0),
        "margen_eur": margin, "margen_pct": round(margin / sales * 100, 2) if sales else None,
        "mgd_eur": mgd, "mgd_pct": round(mgd / sales * 100, 2) if sales else None,
        "skus_con_venta": int(row["skus_con_venta"] or 0),
        "clientes_con_venta": int(row["clientes_con_venta"] or 0),
    }


def _monthly_series(db: Session, empresa_id: int, start: date, end: date, filters: dict) -> list[dict]:
    def query(query_start: date, query_end: date):
        return db.execute(text(f"""
            SELECT DATE_TRUNC('month', v.fecha_venta)::date mes,
                   COALESCE(SUM(v.ingreso_total), 0) ventas_eur,
                   COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur
            FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
            WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :start AND :end {FILTER_SQL}
            GROUP BY DATE_TRUNC('month', v.fecha_venta)
        """), {"empresa_id": empresa_id, "start": query_start, "end": query_end, **filters}).mappings().all()

    current = {row["mes"]: row for row in query(start, end)}
    previous = {row["mes"]: row for row in query(_shift_year(start), _shift_year(end))}
    result = []
    for month in _month_starts(start, end):
        previous_month = _shift_year(month)
        current_row, previous_row = current.get(month, {}), previous.get(previous_month, {})
        sales, previous_sales = _number(current_row.get("ventas_eur")), _number(previous_row.get("ventas_eur"))
        result.append({
            "mes": str(month), "mes_anterior": str(previous_month),
            "ventas_eur": sales, "ventas_anterior_eur": previous_sales,
            "variacion_eur": sales - previous_sales, "variacion_pct": _pct(sales, previous_sales),
            "mgd_eur": _number(current_row.get("mgd_eur")),
            "mgd_anterior_eur": _number(previous_row.get("mgd_eur")),
        })
    return result


def _breakdown(db: Session, empresa_id: int, starts: tuple[date, date], ends: tuple[date, date],
               filters: dict, dimension: str, total_sales: float) -> dict:
    dimension = dimension if dimension in BREAKDOWN_DIMENSIONS else "comercial"
    identifier_expression, display_expression, label = BREAKDOWN_DIMENSIONS[dimension]
    current_start, previous_start = starts
    current_end, previous_end = ends
    rows = db.execute(text(f"""
        SELECT {identifier_expression} entidad_id, {display_expression} entidad,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END), 0) ventas_eur,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END), 0) ventas_anterior_eur,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END), 0) unidades,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_bruto_eur ELSE 0 END), 0) margen_eur,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END), 0) mgd_eur,
          COUNT(DISTINCT CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.producto_id END) skus
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :ps AND :ce {FILTER_SQL}
        GROUP BY {identifier_expression}, {display_expression}
        HAVING SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN ABS(v.ingreso_total) ELSE 0 END) > 0
            OR SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN ABS(v.ingreso_total) ELSE 0 END) > 0
    """), {"empresa_id": empresa_id, "cs": current_start, "ce": current_end,
             "ps": previous_start, "pe": previous_end, **filters}).mappings().all()
    items = []
    for row in rows:
        sales, previous_sales = _number(row["ventas_eur"]), _number(row["ventas_anterior_eur"])
        margin = _number(row["margen_eur"])
        items.append({
            "entidad_id": str(row["entidad_id"]), "entidad": row["entidad"],
            "ventas_eur": sales, "ventas_anterior_eur": previous_sales,
            "variacion_eur": sales - previous_sales, "variacion_pct": _pct(sales, previous_sales),
            "peso_pct": round(sales / total_sales * 100, 2) if total_sales else 0,
            "unidades": int(row["unidades"] or 0), "margen_eur": margin,
            "margen_pct": round(margin / sales * 100, 2) if sales else None,
            "mgd_eur": _number(row["mgd_eur"]), "skus": int(row["skus"] or 0),
        })
    leader = max(items, key=lambda item: item["ventas_eur"], default=None)
    growth = max((item for item in items if item["variacion_eur"] > 0),
                 key=lambda item: item["variacion_eur"], default=None)
    decline = min((item for item in items if item["variacion_eur"] < 0),
                  key=lambda item: item["variacion_eur"], default=None)
    rows = sorted(items, key=lambda item: abs(item["variacion_eur"]), reverse=True)[:100]
    return {
        "dimension": dimension,
        "etiqueta": label,
        "resumen": {
            "mayor_facturacion": leader,
            "mayor_crecimiento": growth,
            "mayor_caida": decline,
        },
        "filas": rows,
    }


def _filter_options(db: Session, empresa_id: int) -> dict:
    options = {}
    for key, column in {"familias": "familia", "marcas": "marca", "familias_marca": "familia_marca", "secciones": "seccion"}.items():
        options[key] = [row[0] for row in db.execute(text(f"""
            SELECT DISTINCT TRIM(p.{column}) FROM productos p
            WHERE p.empresa_id = :empresa_id AND NULLIF(TRIM(p.{column}), '') IS NOT NULL
            ORDER BY TRIM(p.{column})
        """), {"empresa_id": empresa_id}).all()]
    return options


@cached(_dashboard_cache, key=lambda _db, empresa_id, period="fytd", familia=None, marca=None,
        familia_marca=None, seccion=None, breakdown="comercial": (
            empresa_id, period, *[(_clean(value) or "").casefold()
            for value in (familia, marca, familia_marca, seccion)], breakdown,
        ), lock=_dashboard_cache_lock)
def build_executive_dashboard(db: Session, empresa_id: int, period: str = "fytd",
                              familia: str | None = None, marca: str | None = None,
                              familia_marca: str | None = None, seccion: str | None = None,
                              breakdown: str = "comercial") -> dict:
    period = period if period in {"fytd", "90d", "30d"} else "fytd"
    breakdown = breakdown if breakdown in BREAKDOWN_DIMENSIONS else "comercial"
    filters = _filters(familia, marca, familia_marca, seccion)
    coverage = db.execute(text("""
        SELECT MIN(v.fecha_venta) ventas_desde, MAX(v.fecha_venta) ventas_hasta
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).mappings().one()
    anchor = coverage["ventas_hasta"]
    if not anchor:
        return {"ready": False, "message": "No hay ventas cargadas para construir el Dashboard ejecutivo."}

    cs, ce, ps, pe = comparison_window(anchor, period)
    current, previous = _sales_totals(db, empresa_id, cs, ce, filters), _sales_totals(db, empresa_id, ps, pe, filters)
    variation = {
        "ventas_pct": _pct(current["ventas_eur"], previous["ventas_eur"]),
        "ventas_eur": current["ventas_eur"] - previous["ventas_eur"],
        "unidades_pct": _pct(current["unidades"], previous["unidades"]),
        "margen_pct": _pct(current["margen_eur"], previous["margen_eur"]),
        "mgd_pct": _pct(current["mgd_eur"], previous["mgd_eur"]),
        "mgd_eur": current["mgd_eur"] - previous["mgd_eur"],
    }
    inventory_coverage = db.execute(text("""
        SELECT MIN(ih.fecha_inventario) inventario_desde, MAX(ih.fecha_inventario) inventario_hasta
        FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
        WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).mappings().one()
    inventory_date = inventory_coverage["inventario_hasta"]
    inventory = {"fecha": inventory_date, "valor_eur": 0.0, "unidades": 0, "skus": 0,
                 "clase_a_total": 0, "clase_a_sin_stock": 0,
                 "capital_sin_ventas_90d_eur": 0.0, "capital_clase_c_eur": 0.0}
    if inventory_date:
        row = db.execute(text(f"""
            SELECT COALESCE(SUM(ih.inventario_eur), 0) valor_eur,
              COALESCE(SUM(ih.unidades_inventario), 0) unidades, COUNT(*) skus,
              SUM(CASE WHEN pm.abc = 'A' THEN 1 ELSE 0 END) clase_a_total,
              SUM(CASE WHEN pm.abc = 'A' AND ih.unidades_inventario <= 0 THEN 1 ELSE 0 END) clase_a_sin_stock,
              COALESCE(SUM(CASE WHEN pm.abc = 'C' THEN ih.inventario_eur ELSE 0 END), 0) capital_clase_c_eur,
              COALESCE(SUM(CASE WHEN ih.inventario_eur > 0 AND NOT EXISTS (
                SELECT 1 FROM ventas_historicas sv WHERE sv.producto_id = ih.producto_id
                AND sv.fecha_venta BETWEEN :sales90 AND :anchor
              ) THEN ih.inventario_eur ELSE 0 END), 0) capital_sin_ventas_90d_eur
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date {FILTER_SQL}
        """), {"empresa_id": empresa_id, "inventory_date": inventory_date,
                 "sales90": anchor - timedelta(days=89), "anchor": anchor, **filters}).mappings().one()
        inventory.update({key: (_number(row[key]) if key.endswith("_eur") else int(row[key] or 0))
                          for key in inventory if key != "fecha"})

    family_rows = db.execute(text(f"""
        SELECT COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia') familia,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) actual_eur,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) anterior_eur
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :ps AND :ce {FILTER_SQL}
        GROUP BY COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')
    """), {"empresa_id": empresa_id, "cs": cs, "ce": ce, "ps": ps, "pe": pe, **filters}).mappings().all()
    drivers = [{"familia": row["familia"], "actual_eur": _number(row["actual_eur"]),
                "anterior_eur": _number(row["anterior_eur"]),
                "variacion_eur": _number(row["actual_eur"]) - _number(row["anterior_eur"]),
                "variacion_pct": _pct(_number(row["actual_eur"]), _number(row["anterior_eur"]))}
               for row in family_rows]
    drivers.sort(key=lambda item: abs(item["variacion_eur"]), reverse=True)

    quadrants = []
    if inventory_date:
        rows = db.execute(text(f"""
            WITH sales90 AS (SELECT producto_id, SUM(ingreso_total) ventas_90d FROM ventas_historicas
              WHERE fecha_venta BETWEEN :sales90 AND :anchor GROUP BY producto_id)
            SELECT COALESCE(pm.matriz_abc, 'Sin clasificar') cuadrante, COUNT(*) skus,
              COALESCE(SUM(ih.inventario_eur), 0) inventario_eur,
              COALESCE(SUM(s.ventas_90d), 0) ventas_90d_eur
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id LEFT JOIN sales90 s ON s.producto_id = p.id
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date {FILTER_SQL}
            GROUP BY COALESCE(pm.matriz_abc, 'Sin clasificar') ORDER BY cuadrante
        """), {"empresa_id": empresa_id, "inventory_date": inventory_date,
                 "sales90": anchor - timedelta(days=89), "anchor": anchor, **filters}).mappings().all()
        quadrants = [{"cuadrante": row["cuadrante"], "skus": int(row["skus"] or 0),
                      "inventario_eur": _number(row["inventario_eur"]),
                      "ventas_90d_eur": _number(row["ventas_90d_eur"])} for row in rows]

    options = _filter_options(db, empresa_id)
    comparable_complete = coverage["ventas_desde"] <= ps
    return {
        "ready": True, "period": period, "familia": filters["familia"],
        "filtros": {"seleccion": filters, "opciones": options},
        "periodo_actual": {"inicio": cs, "fin": ce}, "periodo_comparable": {"inicio": ps, "fin": pe},
        "cobertura": {"ventas_desde": coverage["ventas_desde"], "ventas_hasta": anchor,
                      "inventario_desde": inventory_coverage["inventario_desde"], "inventario_hasta": inventory_date},
        "calidad": {"comparable_completo": comparable_complete,
                    "aviso_comparable": None if comparable_complete else
                    f"El histórico comparable comienza el {coverage['ventas_desde'].strftime('%d/%m/%Y')}; no existen registros entre el {ps.strftime('%d/%m/%Y')} y el día anterior."},
        "actual": current, "anterior": previous, "variacion": variation, "inventario": inventory,
        "serie_mensual": _monthly_series(db, empresa_id, cs, ce, filters),
        "impulsores_familia": drivers[:8], "cuadrantes": quadrants,
        "desglose": _breakdown(db, empresa_id, (cs, ps), (ce, pe), filters, breakdown, current["ventas_eur"]),
        "familias": options["familias"],
    }
