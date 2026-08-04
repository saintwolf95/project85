"""Metricas deterministas que sirven de base a los agentes de Control IA."""

from datetime import date, timedelta
from decimal import Decimal
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _scalar_row(db: Session, sql: str, params: dict[str, Any]) -> dict[str, Any]:
    row = db.execute(text(sql), params).mappings().first()
    return dict(row) if row else {}


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [_clean(dict(row)) for row in db.execute(text(sql), params).mappings().all()]


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date,)):
        return value.isoformat()
    return value


def _clean(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _plain(value) for key, value in row.items()}


def build_company_data_readiness(db: Session, empresa_id: int) -> dict[str, Any]:
    """Resume cobertura y calidad sin exponer filas ni datos de otras empresas."""
    params = {"empresa_id": empresa_id}
    sales = _clean(_scalar_row(db, """
        SELECT COUNT(vh.id) AS registros_ventas,
               COUNT(DISTINCT vh.producto_id) AS productos_con_ventas,
               COUNT(DISTINCT vh.cliente_id) AS clientes_con_ventas,
               MIN(vh.fecha_venta) AS fecha_minima,
               MAX(vh.fecha_venta) AS fecha_maxima,
               SUM(CASE WHEN vh.cliente_id IS NULL THEN 1 ELSE 0 END) AS ventas_sin_cliente,
               SUM(CASE WHEN p.familia IS NULL OR TRIM(p.familia) = '' THEN 1 ELSE 0 END) AS ventas_sin_familia,
               SUM(CASE WHEN vh.ingreso_total < 0 THEN 1 ELSE 0 END) AS ventas_negativas
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id
    """, params))
    inventory = _clean(_scalar_row(db, """
        SELECT COUNT(i.producto_id) AS productos_con_inventario,
               COALESCE(SUM(i.stock_disponible), 0) AS unidades_stock,
               COALESCE(SUM(i.stock_disponible * p.costo_unitario), 0) AS inventario_eur
        FROM inventario_snapshot i
        JOIN productos p ON p.id = i.producto_id
        WHERE p.empresa_id = :empresa_id
    """, params))
    catalog = _clean(_scalar_row(db, """
        SELECT COUNT(*) AS productos_catalogo
        FROM productos
        WHERE empresa_id = :empresa_id
    """, params))
    records = int(sales.get("registros_ventas") or 0)
    quality_issues = int(sales.get("ventas_sin_cliente") or 0) + int(sales.get("ventas_sin_familia") or 0)
    return {
        **sales,
        **inventory,
        **catalog,
        "ventas_disponibles": bool(sales.get("registros_ventas")),
        "clientes_disponibles": bool(sales.get("clientes_con_ventas")),
        "inventario_disponible": bool(inventory.get("productos_con_inventario")),
        "compras_disponibles": False,
        "completitud_dimensiones_pct": max(0.0, 100 - (quality_issues / (records * 2) * 100)) if records else 0.0,
        "nota_compras": "No hay una fuente de compras cargada; los agentes no estiman compras como si fueran datos reales.",
    }


def build_agent_dossier(db: Session, empresa_id: int, agent_name: str) -> dict[str, Any]:
    """Precalcula KPIs fiables y comparables antes de invocar al modelo."""
    readiness = build_company_data_readiness(db, empresa_id)
    max_date_raw = readiness.get("fecha_maxima")
    if not max_date_raw:
        return {"cobertura": readiness, "metricas": {}, "avisos": ["No hay ventas cargadas."]}

    anchor = date.fromisoformat(max_date_raw) if isinstance(max_date_raw, str) else max_date_raw
    params = {
        "empresa_id": empresa_id,
        "inicio_30d": anchor - timedelta(days=29),
        "inicio_anterior": anchor - timedelta(days=59),
        "fin_anterior": anchor - timedelta(days=30),
        "inicio_90d": anchor - timedelta(days=89),
        "inicio_7d": anchor - timedelta(days=6),
        "inicio_7d_anterior": anchor - timedelta(days=13),
        "fin_7d_anterior": anchor - timedelta(days=7),
    }
    sales = _clean(_scalar_row(db, """
        SELECT
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_30d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_30d_anteriores,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_90d THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_90d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.cantidad_vendida ELSE 0 END), 0) AS unidades_30d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.cantidad_vendida ELSE 0 END), 0) AS unidades_30d_anteriores,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.margen_bruto_eur ELSE 0 END), 0) AS mg_30d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.margen_bruto_eur ELSE 0 END), 0) AS mg_30d_anterior,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.margen_destino_eur ELSE 0 END), 0) AS mgd_30d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.margen_destino_eur ELSE 0 END), 0) AS mgd_30d_anterior,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_7d THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_7d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_7d_anterior AND :fin_7d_anterior THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_7d_anteriores,
          COUNT(DISTINCT CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.cliente_id END) AS clientes_activos_30d,
          COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d AND NULLIF(TRIM(vh.kd), '') IS NOT NULL THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_kd_30d
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id
    """, params))
    ventas_30d = float(sales.get("ventas_30d") or 0)
    previous = float(sales.get("ventas_30d_anteriores") or 0)
    ventas_7d = float(sales.get("ventas_7d") or 0)
    ventas_7d_previous = float(sales.get("ventas_7d_anteriores") or 0)
    units = float(sales.get("unidades_30d") or 0)
    previous_units = float(sales.get("unidades_30d_anteriores") or 0)
    previous_mg_pct = float(sales.get("mg_30d_anterior") or 0) / previous * 100 if previous else None
    previous_mgd_pct = float(sales.get("mgd_30d_anterior") or 0) / previous * 100 if previous else None
    sales["variacion_ventas_30d_pct"] = ((ventas_30d - previous) / previous * 100) if previous else None
    sales["variacion_ventas_30d_eur"] = ventas_30d - previous
    sales["variacion_unidades_30d_pct"] = ((units - previous_units) / previous_units * 100) if previous_units else None
    sales["variacion_ventas_7d_pct"] = ((ventas_7d - ventas_7d_previous) / ventas_7d_previous * 100) if ventas_7d_previous else None
    sales["precio_medio_unidad_30d"] = ventas_30d / units if units else None
    sales["mg_pct_30d"] = (float(sales.get("mg_30d") or 0) / ventas_30d * 100) if ventas_30d else None
    sales["mgd_pct_30d"] = (float(sales.get("mgd_30d") or 0) / ventas_30d * 100) if ventas_30d else None
    sales["mg_pct_30d_anterior"] = previous_mg_pct
    sales["mgd_pct_30d_anterior"] = previous_mgd_pct
    sales["variacion_mg_puntos"] = sales["mg_pct_30d"] - previous_mg_pct if previous_mg_pct is not None and sales["mg_pct_30d"] is not None else None
    sales["variacion_mgd_puntos"] = sales["mgd_pct_30d"] - previous_mgd_pct if previous_mgd_pct is not None and sales["mgd_pct_30d"] is not None else None
    sales["peso_kd_30d_pct"] = (float(sales.get("ventas_kd_30d") or 0) / ventas_30d * 100) if ventas_30d else None

    top_family = _clean(_scalar_row(db, """
        SELECT COALESCE(p.familia, 'Sin familia') AS familia,
               SUM(vh.ingreso_total) AS ventas_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_30d
        GROUP BY COALESCE(p.familia, 'Sin familia')
        ORDER BY ventas_eur DESC LIMIT 1
    """, params))
    customer_concentration = _clean(_scalar_row(db, """
        SELECT COALESCE(SUM(r.ventas_cliente), 0) AS ventas_top_10_clientes
        FROM (
          SELECT SUM(vh.ingreso_total) AS ventas_cliente
          FROM ventas_historicas vh
          JOIN productos p ON p.id = vh.producto_id
          WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_30d
                AND vh.cliente_id IS NOT NULL
          GROUP BY vh.cliente_id
          ORDER BY ventas_cliente DESC LIMIT 10
        ) r
    """, params))
    customer_concentration["concentracion_top_10_pct"] = (
        float(customer_concentration.get("ventas_top_10_clientes") or 0) / ventas_30d * 100
        if ventas_30d else None
    )

    drivers = _rows(db, """
        SELECT COALESCE(p.familia, 'Sin familia') AS dimension,
               SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END) AS ventas_actual,
               SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END) AS ventas_anterior,
               SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END)
                 - SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END) AS impacto_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_anterior
        GROUP BY COALESCE(p.familia, 'Sin familia')
        ORDER BY ABS(
          SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END)
          - SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END)
        ) DESC LIMIT 8
    """, params)
    product_drivers = _rows(db, """
        SELECT p.sku AS sku, p.nombre AS producto, COALESCE(p.familia, 'Sin familia') AS familia,
               SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END) AS ventas_actual,
               SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END) AS ventas_anterior,
               SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END)
                 - SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END) AS impacto_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_anterior
        GROUP BY p.id, p.sku, p.nombre, p.familia
        ORDER BY ABS(
          SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END)
          - SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_anterior AND :fin_anterior THEN vh.ingreso_total ELSE 0 END)
        ) DESC LIMIT 10
    """, params)
    customer_leaders = _rows(db, """
        SELECT c.cliente_pk, c.nombre AS cliente, c.tipo_cliente,
               SUM(vh.ingreso_total) AS ventas_eur,
               SUM(vh.margen_destino_eur) AS mgd_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        JOIN clientes c ON c.id = vh.cliente_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_30d
        GROUP BY c.id, c.cliente_pk, c.nombre, c.tipo_cliente
        ORDER BY ventas_eur DESC LIMIT 8
    """, params) if readiness["clientes_disponibles"] else []
    commercial_leaders = _rows(db, """
        SELECT COALESCE(NULLIF(TRIM(vh.comercial_factura), ''), 'Sin comercial') AS comercial,
               SUM(vh.ingreso_total) AS ventas_eur,
               SUM(vh.margen_destino_eur) AS mgd_eur,
               COUNT(DISTINCT vh.cliente_id) AS clientes
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_30d
        GROUP BY COALESCE(NULLIF(TRIM(vh.comercial_factura), ''), 'Sin comercial')
        ORDER BY ventas_eur DESC LIMIT 8
    """, params)
    daily_sales = _rows(db, """
        SELECT vh.fecha_venta AS fecha, SUM(vh.ingreso_total) AS ventas_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :inicio_30d
        GROUP BY vh.fecha_venta ORDER BY vh.fecha_venta
    """, params)
    daily_values = [float(row["ventas_eur"] or 0) for row in daily_sales]
    daily_average = mean(daily_values) if daily_values else 0
    daily_deviation = pstdev(daily_values) if len(daily_values) > 1 else 0
    anomalous_days = [
        {**row, "desviacion_vs_media_pct": ((float(row["ventas_eur"]) / daily_average) - 1) * 100}
        for row in daily_sales
        if daily_deviation and abs(float(row["ventas_eur"]) - daily_average) >= 2 * daily_deviation
    ][-5:]

    signals = []
    if sales["variacion_ventas_30d_pct"] is not None:
        direction = "crecimiento" if sales["variacion_ventas_30d_pct"] >= 0 else "caída"
        signals.append({"tipo": "momentum_30d", "nivel": "positivo" if direction == "crecimiento" else "atencion", "lectura": f"{direction} de ventas de {abs(sales['variacion_ventas_30d_pct']):.1f}%", "impacto_eur": sales["variacion_ventas_30d_eur"]})
    if sales["variacion_mgd_puntos"] is not None and abs(sales["variacion_mgd_puntos"]) >= 1:
        signals.append({"tipo": "calidad_margen", "nivel": "positivo" if sales["variacion_mgd_puntos"] > 0 else "atencion", "lectura": f"MGD cambia {sales['variacion_mgd_puntos']:+.1f} puntos"})
    concentration = customer_concentration.get("concentracion_top_10_pct")
    if concentration is not None and concentration >= 60:
        signals.append({"tipo": "concentracion_clientes", "nivel": "riesgo", "lectura": f"Top 10 concentra {concentration:.1f}% de las ventas"})
    if sales["variacion_ventas_7d_pct"] is not None and abs(sales["variacion_ventas_7d_pct"]) >= 15:
        signals.append({"tipo": "aceleracion_7d", "nivel": "positivo" if sales["variacion_ventas_7d_pct"] > 0 else "atencion", "lectura": f"ritmo semanal {sales['variacion_ventas_7d_pct']:+.1f}%"})

    metrics: dict[str, Any] = {
        "periodo_analizado": {"desde": params["inicio_30d"].isoformat(), "hasta": anchor.isoformat()},
        **sales,
        "familia_lider_30d": top_family,
        "impulsores_familia": drivers,
        "impulsores_producto": product_drivers,
        "dias_anomalos": anomalous_days,
        "señales_priorizadas": signals,
    }
    normalized = agent_name.lower().replace("í", "i")
    if normalized in {"lucia", "mattia", "ceo"}:
        metrics.update(customer_concentration)
        metrics["clientes_lideres"] = customer_leaders
        metrics["comerciales_lideres"] = commercial_leaders
    if normalized in {"maria", "mattia", "ceo"}:
        metrics.update({
            "productos_con_inventario": readiness.get("productos_con_inventario", 0),
            "unidades_stock": readiness.get("unidades_stock", 0),
            "inventario_eur": readiness.get("inventario_eur", 0),
        })
        if readiness["inventario_disponible"]:
            metrics["prioridades_inventario"] = _rows(db, """
                SELECT p.sku, p.nombre AS producto, pm.abc, pm.xyz,
                       i.stock_disponible, pm.dias_cobertura,
                       (i.stock_disponible * p.costo_unitario) AS inventario_eur,
                       COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.cantidad_vendida ELSE 0 END), 0) AS unidades_vendidas_30d,
                       COALESCE(SUM(CASE WHEN vh.fecha_venta >= :inicio_30d THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_30d
                FROM productos p
                JOIN inventario_snapshot i ON i.producto_id = p.id
                LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
                LEFT JOIN ventas_historicas vh ON vh.producto_id = p.id AND vh.fecha_venta >= :inicio_30d
                WHERE p.empresa_id = :empresa_id
                GROUP BY p.id, p.sku, p.nombre, pm.abc, pm.xyz, i.stock_disponible,
                         pm.dias_cobertura, p.costo_unitario
                ORDER BY
                  CASE WHEN i.stock_disponible = 0 AND pm.abc IN ('A', 'B') THEN 0
                       WHEN pm.dias_cobertura <= 15 AND pm.abc = 'A' THEN 1
                       WHEN pm.dias_cobertura > 120 THEN 2 ELSE 3 END,
                  inventario_eur DESC
                LIMIT 12
            """, params)

    warnings = []
    if not readiness["inventario_disponible"]:
        warnings.append("Inventario no disponible: no calcular roturas, cobertura ni capital inmovilizado.")
    if not readiness["clientes_disponibles"]:
        warnings.append("Dimensión cliente no disponible en las ventas cargadas.")
    warnings.append(readiness["nota_compras"])
    return {"cobertura": readiness, "metricas": metrics, "avisos": warnings}


def build_agent_followups(dossier: dict[str, Any], agent_name: str) -> list[str]:
    """Propone continuaciones breves basadas en lo que realmente contiene el expediente."""
    metrics = dossier.get("metricas", {})
    normalized = agent_name.lower().replace("í", "i")
    family_drivers = metrics.get("impulsores_familia") or []
    product_drivers = metrics.get("impulsores_producto") or []
    family = family_drivers[0].get("dimension") if family_drivers else None
    sku = product_drivers[0].get("sku") if product_drivers else None

    if normalized == "maria":
        if not dossier.get("cobertura", {}).get("inventario_disponible"):
            return [
                "¿Qué demanda debería priorizar mientras no haya inventario?",
                "Resume los productos con mayor variación de ventas.",
            ]
        return [
            "Prioriza los riesgos de inventario por impacto económico.",
            f"Explica demanda y cobertura del SKU {sku}." if sku else "Relaciona demanda reciente y cobertura.",
        ]
    if normalized == "lucia":
        return [
            f"Desglosa el cambio de ventas de {family}." if family else "Desglosa los principales impulsores de ventas.",
            "Compara clientes y comerciales por ventas y MGD.",
            f"Explica qué ocurrió con el SKU {sku}." if sku else "Detecta productos con cambio relevante.",
        ]
    if normalized == "mattia":
        return [
            "Explica la variación del MGD en puntos porcentuales.",
            "¿Dónde se concentra el mayor riesgo económico?",
            f"Evalúa ventas y rentabilidad de {family}." if family else "Evalúa rentabilidad por familia.",
        ]
    return [
        "Convierte los hallazgos en tres decisiones priorizadas.",
        "¿Qué riesgo requiere seguimiento esta semana?",
    ]
