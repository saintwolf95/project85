"""Métricas ejecutivas deterministas para el Dashboard.

El Dashboard no infiere cifras en el navegador: todos los períodos, comparables
y agregados se calculan en SQL y quedan aislados por empresa.
"""
from __future__ import annotations

from datetime import date, timedelta
from threading import RLock

from cachetools import TTLCache, cached
from sqlalchemy import text
from sqlalchemy.orm import Session


PERIOD_DAYS = {"30d": 30, "90d": 90}
_dashboard_cache = TTLCache(maxsize=128, ttl=300)
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


def _fiscal_start(anchor: date) -> date:
    return date(anchor.year if anchor.month >= 5 else anchor.year - 1, 5, 1)


def comparison_window(anchor: date, period: str) -> tuple[date, date, date, date]:
    """Devuelve período actual y comparable de idéntica duración."""
    if period == "fytd":
        current_start = _fiscal_start(anchor)
        previous_start = current_start.replace(year=current_start.year - 1)
        previous_end = previous_start + (anchor - current_start)
    else:
        days = PERIOD_DAYS.get(period, PERIOD_DAYS["90d"])
        current_start = anchor - timedelta(days=days - 1)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)
    return current_start, anchor, previous_start, previous_end


def _sales_totals(db: Session, empresa_id: int, start: date, end: date, familia: str | None) -> dict:
    row = db.execute(text("""
        SELECT COALESCE(SUM(v.ingreso_total), 0) ventas_eur,
               COALESCE(SUM(v.cantidad_vendida), 0) unidades,
               COALESCE(SUM(v.margen_bruto_eur), 0) margen_eur,
               COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur,
               COUNT(DISTINCT v.producto_id) skus_con_venta,
               COUNT(DISTINCT v.cliente_id) clientes_con_venta
        FROM ventas_historicas v
        JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
          AND v.fecha_venta BETWEEN :start AND :end
          AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
    """), {"empresa_id": empresa_id, "start": start, "end": end, "familia": familia}).mappings().one()
    sales = _number(row["ventas_eur"])
    margin = _number(row["margen_eur"])
    mgd = _number(row["mgd_eur"])
    return {
        "ventas_eur": sales,
        "unidades": int(row["unidades"] or 0),
        "margen_eur": margin,
        "margen_pct": round(margin / sales * 100, 2) if sales else None,
        "mgd_eur": mgd,
        "mgd_pct": round(mgd / sales * 100, 2) if sales else None,
        "skus_con_venta": int(row["skus_con_venta"] or 0),
        "clientes_con_venta": int(row["clientes_con_venta"] or 0),
    }


@cached(
    _dashboard_cache,
    key=lambda _db, empresa_id, period="fytd", familia=None: (
        empresa_id, period, (familia or "").strip().casefold(),
    ),
    lock=_dashboard_cache_lock,
)
def build_executive_dashboard(db: Session, empresa_id: int, period: str = "fytd", familia: str | None = None) -> dict:
    if period not in {"fytd", "90d", "30d"}:
        period = "fytd"
    familia = familia.strip() if familia and familia.strip() else None

    coverage = db.execute(text("""
        SELECT MIN(v.fecha_venta) ventas_desde, MAX(v.fecha_venta) ventas_hasta
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).mappings().one()
    anchor = coverage["ventas_hasta"]
    if not anchor:
        return {"ready": False, "message": "No hay ventas cargadas para construir el Dashboard ejecutivo."}

    current_start, current_end, previous_start, previous_end = comparison_window(anchor, period)
    current = _sales_totals(db, empresa_id, current_start, current_end, familia)
    previous = _sales_totals(db, empresa_id, previous_start, previous_end, familia)
    comparison = {
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

    inventory = {
        "fecha": inventory_date,
        "valor_eur": 0.0,
        "unidades": 0,
        "skus": 0,
        "clase_a_total": 0,
        "clase_a_sin_stock": 0,
        "capital_sin_ventas_90d_eur": 0.0,
        "capital_clase_c_eur": 0.0,
    }
    if inventory_date:
        inventory_row = db.execute(text("""
            SELECT COALESCE(SUM(ih.inventario_eur), 0) valor_eur,
                   COALESCE(SUM(ih.unidades_inventario), 0) unidades,
                   COUNT(*) skus,
                   SUM(CASE WHEN pm.abc = 'A' THEN 1 ELSE 0 END) clase_a_total,
                   SUM(CASE WHEN pm.abc = 'A' AND ih.unidades_inventario <= 0 THEN 1 ELSE 0 END) clase_a_sin_stock,
                   COALESCE(SUM(CASE WHEN pm.abc = 'C' THEN ih.inventario_eur ELSE 0 END), 0) capital_clase_c_eur,
                   COALESCE(SUM(CASE WHEN ih.inventario_eur > 0 AND NOT EXISTS (
                       SELECT 1 FROM ventas_historicas v
                       WHERE v.producto_id = ih.producto_id AND v.fecha_venta BETWEEN :sales_90_start AND :anchor
                   ) THEN ih.inventario_eur ELSE 0 END), 0) capital_sin_ventas_90d_eur
            FROM inventario_historico ih
            JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date
              AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
        """), {
            "empresa_id": empresa_id,
            "inventory_date": inventory_date,
            "familia": familia,
            "sales_90_start": anchor - timedelta(days=89),
            "anchor": anchor,
        }).mappings().one()
        inventory.update({
            "valor_eur": _number(inventory_row["valor_eur"]),
            "unidades": int(inventory_row["unidades"] or 0),
            "skus": int(inventory_row["skus"] or 0),
            "clase_a_total": int(inventory_row["clase_a_total"] or 0),
            "clase_a_sin_stock": int(inventory_row["clase_a_sin_stock"] or 0),
            "capital_sin_ventas_90d_eur": _number(inventory_row["capital_sin_ventas_90d_eur"]),
            "capital_clase_c_eur": _number(inventory_row["capital_clase_c_eur"]),
        })

    monthly_rows = db.execute(text("""
        SELECT DATE_TRUNC('month', v.fecha_venta)::date mes,
               COALESCE(SUM(v.ingreso_total), 0) ventas_eur,
               COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
          AND v.fecha_venta >= :history_start
          AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
        GROUP BY DATE_TRUNC('month', v.fecha_venta)
        ORDER BY mes
    """), {
        "empresa_id": empresa_id,
        "history_start": max(coverage["ventas_desde"], date(anchor.year - 1, anchor.month, 1)),
        "familia": familia,
    }).mappings().all()

    family_rows = db.execute(text("""
        SELECT COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia') familia,
               COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :current_start AND :current_end THEN v.ingreso_total ELSE 0 END), 0) actual_eur,
               COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :previous_start AND :previous_end THEN v.ingreso_total ELSE 0 END), 0) anterior_eur
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
          AND v.fecha_venta BETWEEN :previous_start AND :current_end
          AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
        GROUP BY COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia')
    """), {
        "empresa_id": empresa_id,
        "current_start": current_start,
        "current_end": current_end,
        "previous_start": previous_start,
        "previous_end": previous_end,
        "familia": familia,
    }).mappings().all()
    family_drivers = []
    for row in family_rows:
        actual, previous_value = _number(row["actual_eur"]), _number(row["anterior_eur"])
        family_drivers.append({
            "familia": row["familia"],
            "actual_eur": actual,
            "anterior_eur": previous_value,
            "variacion_eur": actual - previous_value,
            "variacion_pct": _pct(actual, previous_value),
        })
    family_drivers.sort(key=lambda item: abs(item["variacion_eur"]), reverse=True)

    quadrants = []
    if inventory_date:
        quadrant_rows = db.execute(text("""
            WITH sales90 AS (
                SELECT v.producto_id, SUM(v.ingreso_total) ventas_90d
                FROM ventas_historicas v
                WHERE v.fecha_venta BETWEEN :sales_90_start AND :anchor
                GROUP BY v.producto_id
            )
            SELECT COALESCE(pm.matriz_abc, 'Sin clasificar') cuadrante,
                   COUNT(*) skus,
                   COALESCE(SUM(ih.inventario_eur), 0) inventario_eur,
                   COALESCE(SUM(s.ventas_90d), 0) ventas_90d_eur
            FROM inventario_historico ih
            JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            LEFT JOIN sales90 s ON s.producto_id = p.id
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date
              AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
            GROUP BY COALESCE(pm.matriz_abc, 'Sin clasificar')
            ORDER BY cuadrante
        """), {
            "empresa_id": empresa_id,
            "inventory_date": inventory_date,
            "familia": familia,
            "sales_90_start": anchor - timedelta(days=89),
            "anchor": anchor,
        }).mappings().all()
        quadrants = [{
            "cuadrante": row["cuadrante"],
            "skus": int(row["skus"] or 0),
            "inventario_eur": _number(row["inventario_eur"]),
            "ventas_90d_eur": _number(row["ventas_90d_eur"]),
        } for row in quadrant_rows]

    families = [row[0] for row in db.execute(text("""
        SELECT DISTINCT TRIM(p.familia)
        FROM productos p
        WHERE p.empresa_id = :empresa_id AND NULLIF(TRIM(p.familia), '') IS NOT NULL
        ORDER BY TRIM(p.familia)
    """), {"empresa_id": empresa_id}).all()]

    return {
        "ready": True,
        "period": period,
        "familia": familia,
        "periodo_actual": {"inicio": current_start, "fin": current_end},
        "periodo_comparable": {"inicio": previous_start, "fin": previous_end},
        "cobertura": {
            "ventas_desde": coverage["ventas_desde"],
            "ventas_hasta": coverage["ventas_hasta"],
            "inventario_desde": inventory_coverage["inventario_desde"],
            "inventario_hasta": inventory_coverage["inventario_hasta"],
        },
        "calidad": {
            "comparable_completo": coverage["ventas_desde"] <= previous_start,
            "aviso_comparable": None if coverage["ventas_desde"] <= previous_start else (
                f"El histórico comparable comienza el {coverage['ventas_desde'].strftime('%d/%m/%Y')}; "
                f"no existen registros entre el {previous_start.strftime('%d/%m/%Y')} y el día anterior."
            ),
        },
        "actual": current,
        "anterior": previous,
        "variacion": comparison,
        "inventario": inventory,
        "serie_mensual": [{"mes": str(row["mes"]), "ventas_eur": _number(row["ventas_eur"]), "mgd_eur": _number(row["mgd_eur"])} for row in monthly_rows],
        "impulsores_familia": family_drivers[:8],
        "cuadrantes": quadrants,
        "familias": families,
    }
