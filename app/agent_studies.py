"""Estudios estadísticos persistentes para los centros de analítica de agentes."""

import json
import math
import threading
from datetime import date, datetime, timedelta
from statistics import mean, median, pstdev
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from .agent_metrics import build_company_data_readiness
from .models import AgentStudySnapshot, EmpresaEstadisticas


_study_lock = threading.Lock()
MADRID_TZ = ZoneInfo("Europe/Madrid")
ALLOWED_STUDY_AGENTS = {"maria", "lucia", "mattia"}


def _rows(db: Session, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def _number(value: Any) -> float:
    return float(value or 0)


def _linear_regression(values: list[float]) -> dict[str, Any]:
    n = len(values)
    if n < 3:
        return {"n": n, "available": False, "reason": "Se requieren al menos 3 días."}
    x_mean = (n - 1) / 2
    y_mean = mean(values)
    sxx = sum((x - x_mean) ** 2 for x in range(n))
    sxy = sum((x - x_mean) * (y - y_mean) for x, y in enumerate(values))
    slope = sxy / sxx if sxx else 0
    intercept = y_mean - slope * x_mean
    fitted = [intercept + slope * x for x in range(n)]
    residual_sum = sum((y - estimate) ** 2 for y, estimate in zip(values, fitted))
    total_sum = sum((y - y_mean) ** 2 for y in values)
    r_squared = 1 - residual_sum / total_sum if total_sum else 0
    standard_error = math.sqrt((residual_sum / (n - 2)) / sxx) if n > 2 and sxx else 0
    critical = 1.96 if n >= 30 else 2.0
    return {
        "n": n,
        "available": True,
        "slope_eur_per_day": slope,
        "intercept": intercept,
        "r_squared": max(0.0, min(1.0, r_squared)),
        "slope_ci95_low": slope - critical * standard_error,
        "slope_ci95_high": slope + critical * standard_error,
        "method": "Regresión lineal OLS sobre ventas diarias; IC 95% aproximado.",
        "caution": "Describe tendencia temporal. No demuestra causalidad ni constituye una previsión por sí sola.",
    }


def _distribution(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"n": 0}
    average = mean(values)
    deviation = pstdev(values) if len(values) > 1 else 0
    ordered = sorted(values)
    q1 = ordered[round((len(ordered) - 1) * 0.25)]
    q3 = ordered[round((len(ordered) - 1) * 0.75)]
    standard_error = deviation / math.sqrt(len(values)) if values else 0
    return {
        "n": len(values),
        "mean": average,
        "median": median(values),
        "standard_deviation": deviation,
        "coefficient_variation_pct": deviation / average * 100 if average else None,
        "q1": q1,
        "q3": q3,
        "mean_ci95_low": average - 1.96 * standard_error,
        "mean_ci95_high": average + 1.96 * standard_error,
    }


def _fill_daily_series(rows: list[dict[str, Any]], start: date, end: date) -> list[dict[str, Any]]:
    indexed = {
        row["fecha"].isoformat() if isinstance(row["fecha"], date) else str(row["fecha"]): row
        for row in rows
    }
    result = []
    current = start
    while current <= end:
        row = indexed.get(current.isoformat(), {})
        result.append({
            "fecha": current.isoformat(),
            "ventas_eur": _number(row.get("ventas_eur")),
            "unidades": _number(row.get("unidades")),
            "mgd_eur": _number(row.get("mgd_eur")),
        })
        current += timedelta(days=1)
    return result


def build_agent_studies(db: Session, empresa_id: int, agent_name: str) -> dict[str, Any]:
    normalized = agent_name.lower().replace("í", "i")
    if normalized not in ALLOWED_STUDY_AGENTS:
        raise ValueError("Agente sin centro de estudios")
    readiness = build_company_data_readiness(db, empresa_id)
    source_date_raw = readiness.get("fecha_maxima")
    if not source_date_raw:
        return {
            "agent": normalized,
            "generated_at": datetime.utcnow().isoformat(),
            "source_date": None,
            "tabs": {},
            "limitations": ["No hay ventas cargadas para construir estudios."],
        }

    anchor = date.fromisoformat(source_date_raw) if isinstance(source_date_raw, str) else source_date_raw
    params = {
        "empresa_id": empresa_id,
        "start_90": anchor - timedelta(days=89),
        "start_30": anchor - timedelta(days=29),
        "start_previous": anchor - timedelta(days=59),
        "end_previous": anchor - timedelta(days=30),
    }
    daily_rows = _rows(db, """
        SELECT vh.fecha_venta AS fecha,
               SUM(vh.ingreso_total) AS ventas_eur,
               SUM(vh.cantidad_vendida) AS unidades,
               SUM(vh.margen_destino_eur) AS mgd_eur
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :start_90
        GROUP BY vh.fecha_venta ORDER BY vh.fecha_venta
    """, params)
    daily = _fill_daily_series(daily_rows, params["start_90"], anchor)
    daily_sales = [row["ventas_eur"] for row in daily]
    regression = _linear_regression(daily_sales)
    distribution = _distribution(daily_sales)

    weekday_groups: dict[int, list[float]] = {day: [] for day in range(7)}
    for row in daily:
        weekday_groups[date.fromisoformat(row["fecha"]).weekday()].append(row["ventas_eur"])
    weekday_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    overall_mean = mean(daily_sales) if daily_sales else 0
    weekdays = [
        {
            "weekday": weekday_names[day],
            "mean_sales_eur": mean(values) if values else 0,
            "seasonality_index": (mean(values) / overall_mean) if values and overall_mean else None,
            "n": len(values),
        }
        for day, values in weekday_groups.items()
    ]

    articles = _rows(db, """
        SELECT p.sku, p.nombre AS articulo, COALESCE(p.familia, 'Sin familia') AS familia,
               COALESCE(p.product_manager, 'Sin PM') AS product_manager,
               SUM(CASE WHEN vh.fecha_venta >= :start_30 THEN vh.ingreso_total ELSE 0 END) AS ventas_actual,
               SUM(CASE WHEN vh.fecha_venta BETWEEN :start_previous AND :end_previous THEN vh.ingreso_total ELSE 0 END) AS ventas_anterior,
               SUM(CASE WHEN vh.fecha_venta >= :start_30 THEN vh.cantidad_vendida ELSE 0 END) AS unidades_actual,
               SUM(CASE WHEN vh.fecha_venta >= :start_30 THEN vh.margen_destino_eur ELSE 0 END) AS mgd_actual
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :start_previous
        GROUP BY p.id, p.sku, p.nombre, p.familia, p.product_manager
        ORDER BY ABS(
          SUM(CASE WHEN vh.fecha_venta >= :start_30 THEN vh.ingreso_total ELSE 0 END)
          - SUM(CASE WHEN vh.fecha_venta BETWEEN :start_previous AND :end_previous THEN vh.ingreso_total ELSE 0 END)
        ) DESC LIMIT 30
    """, params)
    for row in articles:
        current = _number(row["ventas_actual"])
        previous = _number(row["ventas_anterior"])
        row["impacto_eur"] = current - previous
        row["variacion_pct"] = (current - previous) / previous * 100 if previous else None
        row["mgd_pct"] = _number(row["mgd_actual"]) / current * 100 if current else None

    clients = _rows(db, """
        SELECT c.cliente_pk, c.nombre AS cliente, COALESCE(c.tipo_cliente, 'Sin tipo') AS tipo_cliente,
               COALESCE(c.comercial_cliente, 'Sin comercial asignado') AS comercial_asignado,
               SUM(vh.ingreso_total) AS ventas_eur,
               SUM(vh.margen_destino_eur) AS mgd_eur,
               COUNT(DISTINCT vh.producto_id) AS articulos
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        JOIN clientes c ON c.id = vh.cliente_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :start_30
        GROUP BY c.id, c.cliente_pk, c.nombre, c.tipo_cliente, c.comercial_cliente
        ORDER BY ventas_eur DESC
    """, params) if readiness.get("clientes_disponibles") else []
    total_client_sales = sum(_number(row["ventas_eur"]) for row in clients)
    hhi = sum((_number(row["ventas_eur"]) / total_client_sales) ** 2 for row in clients) * 10000 if total_client_sales else None
    for row in clients:
        sales = _number(row["ventas_eur"])
        row["share_pct"] = sales / total_client_sales * 100 if total_client_sales else None
        row["mgd_pct"] = _number(row["mgd_eur"]) / sales * 100 if sales else None

    managers = _rows(db, """
        SELECT COALESCE(p.product_manager, 'Sin PM') AS product_manager,
               SUM(vh.ingreso_total) AS ventas_eur,
               SUM(vh.margen_destino_eur) AS mgd_eur,
               SUM(vh.cantidad_vendida) AS unidades,
               COUNT(DISTINCT p.id) AS articulos,
               COUNT(DISTINCT vh.cliente_id) AS clientes
        FROM ventas_historicas vh
        JOIN productos p ON p.id = vh.producto_id
        WHERE p.empresa_id = :empresa_id AND vh.fecha_venta >= :start_30
        GROUP BY COALESCE(p.product_manager, 'Sin PM')
        ORDER BY ventas_eur DESC LIMIT 30
    """, params)
    total_manager_sales = sum(_number(row["ventas_eur"]) for row in managers)
    for row in managers:
        sales = _number(row["ventas_eur"])
        row["share_pct"] = sales / total_manager_sales * 100 if total_manager_sales else None
        row["mgd_pct"] = _number(row["mgd_eur"]) / sales * 100 if sales else None

    focus = {
        "maria": "Demanda, estabilidad del artículo, cobertura y responsabilidad del portfolio.",
        "lucia": "Crecimiento, clientes, mix comercial y contribución de artículos.",
        "mattia": "Rentabilidad ponderada, concentración y exposición económica.",
    }[normalized]
    return {
        "agent": normalized,
        "generated_at": datetime.utcnow().isoformat(),
        "source_date": anchor.isoformat(),
        "period": {"start": params["start_90"].isoformat(), "end": anchor.isoformat()},
        "focus": focus,
        "tabs": {
            "articles": {
                "title": "Artículos",
                "summary": "Artículos con mayor contribución al cambio de ventas entre periodos equivalentes de 30 días.",
                "rows": articles,
                "methodology": "Impacto = ventas actuales menos ventas del periodo anterior. MGD% es ponderado sobre ventas.",
            },
            "clients": {
                "title": "Clientes",
                "summary": "Concentración, amplitud de compra y rentabilidad de clientes en los últimos 30 días.",
                "rows": clients[:50],
                "metrics": {"active_clients": len(clients), "hhi": hhi, "total_sales_eur": total_client_sales},
                "methodology": "HHI suma los cuadrados de las cuotas. Menos de 1.500 suele indicar baja concentración; más de 2.500, alta.",
            },
            "product_managers": {
                "title": "Product Managers",
                "summary": "Rendimiento económico y complejidad del portfolio gestionado durante los últimos 30 días.",
                "rows": managers,
                "methodology": "Compara ventas, MGD ponderado, artículos activos y clientes atendidos; no es una evaluación individual aislada.",
            },
            "laboratory": {
                "title": "Laboratorio estadístico",
                "summary": "Tendencia, dispersión, intervalos y estacionalidad de las ventas diarias de 90 días.",
                "regression": regression,
                "distribution": distribution,
                "weekday_seasonality": weekdays,
                "series": daily,
                "methodology": [
                    "Los días sin ventas registradas se incluyen como cero.",
                    "El intervalo de la media describe incertidumbre estadística, no un objetivo comercial.",
                    "R² mide ajuste de la tendencia temporal y no causalidad.",
                ],
            },
        },
        "data_quality": {
            "dimension_completeness_pct": readiness.get("completitud_dimensiones_pct"),
            "sales_records": readiness.get("registros_ventas"),
            "inventory_available": readiness.get("inventario_disponible"),
            "purchases_available": readiness.get("compras_disponibles"),
        },
        "limitations": [
            "Las conclusiones son descriptivas y asociativas; no prueban causalidad.",
            "No se analizan compras hasta disponer de una fuente real.",
            "Inventario, cobertura y roturas solo se calculan cuando exista inventario cargado.",
        ],
    }


def ensure_agent_study_snapshot(db: Session, empresa_id: int, agent_name: str) -> dict[str, Any]:
    normalized = agent_name.lower().replace("í", "i")
    report_date = datetime.now(MADRID_TZ).date()
    metrics_updated_at = db.query(EmpresaEstadisticas.actualizado_en).filter(
        EmpresaEstadisticas.empresa_id == empresa_id
    ).scalar()

    def current_snapshot():
        query = db.query(AgentStudySnapshot).filter(
            AgentStudySnapshot.empresa_id == empresa_id,
            AgentStudySnapshot.agent_name == normalized,
            AgentStudySnapshot.report_date == report_date,
        )
        if metrics_updated_at:
            query = query.filter(AgentStudySnapshot.created_at >= metrics_updated_at)
        return query.first()

    snapshot = current_snapshot()
    if snapshot:
        return json.loads(snapshot.payload_json)
    with _study_lock:
        snapshot = current_snapshot()
        if snapshot:
            return json.loads(snapshot.payload_json)
        payload = build_agent_studies(db, empresa_id, normalized)
        existing = db.query(AgentStudySnapshot).filter(
            AgentStudySnapshot.empresa_id == empresa_id,
            AgentStudySnapshot.agent_name == normalized,
            AgentStudySnapshot.report_date == report_date,
        ).first()
        if existing:
            existing.source_date = date.fromisoformat(payload["source_date"]) if payload.get("source_date") else None
            existing.payload_json = json.dumps(payload, ensure_ascii=False, default=str)
            existing.created_at = datetime.utcnow()
        else:
            db.add(AgentStudySnapshot(
                empresa_id=empresa_id,
                agent_name=normalized,
                report_date=report_date,
                source_date=date.fromisoformat(payload["source_date"]) if payload.get("source_date") else None,
                payload_json=json.dumps(payload, ensure_ascii=False, default=str),
            ))
        db.commit()
        return payload
