"""Adaptador de fuentes verificadas al contrato cerrado de Oficina Viva."""
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from . import services
from .dashboard_service import build_executive_dashboard, comparison_window
from .margin_service import overview
from .models import AgentDecision, AgentDecisionStep, AgentExecutionRun, AgentNotificationLog, AgentSignal


OFFICE_FILTER_KEYS = ("pm", "seccion", "marca", "articulo")
PRODUCT_FILTER_SQL = """
 AND (CAST(:pm AS TEXT) IS NULL OR LOWER(COALESCE(p.product_manager, '')) = LOWER(CAST(:pm AS TEXT)))
 AND (CAST(:seccion AS TEXT) IS NULL OR LOWER(COALESCE(p.seccion, '')) = LOWER(CAST(:seccion AS TEXT)))
 AND (CAST(:marca AS TEXT) IS NULL OR LOWER(COALESCE(p.marca, '')) = LOWER(CAST(:marca AS TEXT)))
 AND (CAST(:articulo AS TEXT) IS NULL OR LOWER(COALESCE(p.sku, '')) = LOWER(CAST(:articulo AS TEXT)))
"""


def normalize_office_filters(**values: str | None) -> dict[str, str | None]:
    """Normaliza exclusivamente los filtros permitidos por Oficina Viva."""
    return {key: (str(values.get(key)).strip() or None) if values.get(key) is not None else None
            for key in OFFICE_FILTER_KEYS}


def office_filter_options(db: Session, empresa_id: int, article_query: str | None = None) -> dict[str, list[dict[str, str]]]:
    """Opciones reales de cartera; los artículos siempre se buscan en servidor."""
    if article_query is not None:
        term = article_query.strip()
        if not term:
            return {"articulo": []}
        rows = db.execute(text("""
            SELECT p.sku, COALESCE(NULLIF(TRIM(p.nombre), ''), p.sku) nombre
            FROM productos p
            WHERE p.empresa_id = :empresa_id AND (
              LOWER(p.sku) LIKE :term OR LOWER(COALESCE(p.nombre, '')) LIKE :term
            )
            ORDER BY p.sku LIMIT 50
        """), {"empresa_id": empresa_id, "term": f"%{term.lower()}%"}).mappings().all()
        return {"articulo": [{"value": row["sku"], "label": f"{row['sku']} · {row['nombre']}"} for row in rows]}

    result: dict[str, list[dict[str, str]]] = {"pm": [], "seccion": [], "marca": [], "articulo": []}
    for key, column in (("pm", "product_manager"), ("seccion", "seccion"), ("marca", "marca")):
        rows = db.execute(text(f"""
            SELECT DISTINCT TRIM(p.{column}) value FROM productos p
            WHERE p.empresa_id = :empresa_id AND NULLIF(TRIM(p.{column}), '') IS NOT NULL
            ORDER BY value
        """), {"empresa_id": empresa_id}).mappings().all()
        result[key] = [{"value": row["value"], "label": row["value"]} for row in rows]
    return result


def _metric_matches_filters(metric: dict, filters: dict[str, str | None]) -> bool:
    values = {
        "pm": metric.get("product_manager"), "seccion": metric.get("seccion"),
        "marca": metric.get("marca"), "articulo": metric.get("cod_art"),
    }
    return all(not expected or str(values.get(key) or "").casefold() == expected.casefold()
               for key, expected in filters.items())


def _signal_matches_filters(signal: AgentSignal, filtered_metrics: list[dict], filters: dict[str, str | None]) -> bool:
    if not any(filters.values()):
        return True
    skus = {str(metric.get("cod_art")) for metric in filtered_metrics if metric.get("cod_art")}
    families = {str(metric.get("familia")) for metric in filtered_metrics if metric.get("familia")}
    if signal.entidad_tipo == "sku":
        return str(signal.entidad_id) in skus
    if signal.entidad_tipo == "familia":
        return str(signal.entidad_id) in families
    return False


def _inventory_drill_rows(db: Session, empresa_id: int, filters: dict[str, str | None], inventory_date: date) -> list[dict]:
    """Base común de los desgloses de almacén, limitada después por cada gráfico."""
    rows = db.execute(text(f"""
        SELECT p.sku, COALESCE(NULLIF(TRIM(p.nombre), ''), p.sku) articulo,
               COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección') seccion,
               COALESCE(ih.inventario_eur, 0) inventario_eur,
               COALESCE(pm.dias_cobertura, 0) dias_cobertura,
               MAX(v.fecha_venta) ultima_venta
        FROM inventario_historico ih
        JOIN productos p ON p.id = ih.producto_id
        LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
        LEFT JOIN ventas_historicas v ON v.producto_id = p.id AND v.fecha_venta <= :inventory_date
        WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date {PRODUCT_FILTER_SQL}
        GROUP BY p.sku, p.nombre, p.seccion, ih.inventario_eur, pm.dias_cobertura
    """), {"empresa_id": empresa_id, "inventory_date": inventory_date, **filters}).mappings().all()
    return [dict(row) for row in rows]


def _days_without_sale(inventory_date: date, last_sale: date | datetime | str | None) -> int:
    return (inventory_date - _as_date(last_sale)).days if last_sale else 181


def _inventory_date(db: Session, empresa_id: int) -> date | None:
    value = db.execute(text("""
        SELECT MAX(ih.fecha_inventario) FROM inventario_historico ih
        JOIN productos p ON p.id = ih.producto_id WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).scalar()
    return _as_date(value) if value else None


def _drill_result(title: str, subtitle: str, rows: list[dict], *, unit: str, digits: int = 0) -> dict:
    return {"title": title, "subtitle": subtitle, "unit": unit, "digits": digits, "rows": rows[:10]}


def office_viva_drill(db: Session, empresa_id: int, *, chart: str, key: str,
                       pm: str | None = None, seccion: str | None = None,
                       marca: str | None = None, articulo: str | None = None) -> dict:
    """Desglose verificable de cada punto interactivo de Oficina Viva v6."""
    filters = normalize_office_filters(pm=pm, seccion=seccion, marca=marca, articulo=articulo)
    if chart not in {"pmHealth", "pmCov", "deadByCat", "agingBucket", "invWeek", "sales", "salesDelta", "mgd"}:
        raise ValueError("Gráfico de Oficina Viva no válido.")

    if chart in {"pmHealth", "pmCov"}:
        pm_filters = {**filters, "pm": key}
        metrics = [row for row in services.calculate_inventory_metrics(db, empresa_id)
                   if _metric_matches_filters(row, pm_filters)]
        def risk_rank(row: dict) -> tuple[int, int, float]:
            risks = row.get("riesgos_categorizados") or []
            return (0 if {"Riesgo Rotura", "Alerta Rotura"}.intersection(risks) else 1,
                    int(row.get("dias_cobertura") or 0), -float(row.get("valor_inv") or 0))
        rows = sorted(metrics, key=(lambda row: (int(row.get("dias_cobertura") or 0), -float(row.get("valor_inv") or 0))) if chart == "pmCov" else risk_rank)[:10]
        return _drill_result(
            f"Cartera {key}", "Artículos con peor cobertura o riesgo de rotura",
            [{"label": f"{row.get('cod_art')} · {row.get('nombre_art')}",
              "value": float(row.get("valor_inv") or 0) / 1000,
              "sub": f"{int(row.get('dias_cobertura') or 0)} días de cobertura"}
             for row in rows], unit=" k€", digits=1,
        )

    inventory_date = _inventory_date(db, empresa_id)
    if chart in {"deadByCat", "agingBucket", "invWeek"} and not inventory_date:
        return _drill_result("Inventario", "No hay snapshot de inventario disponible", [], unit=" k€", digits=1)

    if chart in {"deadByCat", "agingBucket"}:
        local_filters = {**filters, "seccion": key} if chart == "deadByCat" and key != "Todas las categorías" else filters
        rows = _inventory_drill_rows(db, empresa_id, local_filters, inventory_date)
        if chart == "deadByCat":
            rows = [row for row in rows if _days_without_sale(inventory_date, row["ultima_venta"]) > 180]
            rows.sort(key=lambda row: float(row["inventario_eur"] or 0), reverse=True)
            return _drill_result(
                f"Aging muerto · {key}", "Artículos con más valor sin venta durante más de 180 días",
                [{"label": f"{row['sku']} · {row['articulo']}", "value": float(row["inventario_eur"] or 0) / 1000,
                  "sub": f"{_days_without_sale(inventory_date, row['ultima_venta'])} días sin venta"} for row in rows],
                unit=" k€", digits=1,
            )
        def in_bucket(row: dict) -> bool:
            days = _days_without_sale(inventory_date, row["ultima_venta"])
            return ((key == "0-30" and days <= 30) or (key == "31-90" and 31 <= days <= 90)
                    or (key == "91-180" and 91 <= days <= 180) or (key == ">180" and days > 180))
        rows = sorted((row for row in rows if in_bucket(row)), key=lambda row: float(row["inventario_eur"] or 0), reverse=True)
        return _drill_result(
            f"Antigüedad {key}", "Artículos con más valor en este tramo",
            [{"label": f"{row['sku']} · {row['articulo']}", "value": float(row["inventario_eur"] or 0) / 1000,
              "sub": f"{_days_without_sale(inventory_date, row['ultima_venta'])} días sin venta"} for row in rows],
            unit=" k€", digits=1,
        )

    if chart == "invWeek":
        import re
        weeks_ago = 0 if key == "Esta semana" else int((re.search(r"(\d+)", key) or ["0", "0"])[1])
        dates = db.execute(text(f"""
            SELECT DISTINCT ih.fecha_inventario
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            WHERE p.empresa_id = :empresa_id {PRODUCT_FILTER_SQL}
            ORDER BY ih.fecha_inventario DESC LIMIT 12
        """), {"empresa_id": empresa_id, **filters}).scalars().all()
        if weeks_ago >= len(dates):
            return _drill_result("Inventario", "No hay histórico para esa semana", [], unit=" k€", digits=1)
        selected_date = _as_date(dates[weeks_ago])
        rows = db.execute(text(f"""
            SELECT COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección') seccion,
                   COALESCE(SUM(ih.inventario_eur), 0) valor
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date {PRODUCT_FILTER_SQL}
            GROUP BY COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección') ORDER BY valor DESC LIMIT 10
        """), {"empresa_id": empresa_id, "inventory_date": selected_date, **filters}).mappings().all()
        return _drill_result(
            f"Inventario · {selected_date.isoformat()}", "Valor de inventario por sección",
            [{"label": row["seccion"], "value": float(row["valor"] or 0) / 1000} for row in rows], unit=" k€", digits=1,
        )

    anchor = db.execute(text("""
        SELECT MAX(v.fecha_venta) FROM ventas_historicas v
        JOIN productos p ON p.id = v.producto_id WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).scalar()
    if not anchor:
        return _drill_result("Ventas", "No hay ventas disponibles", [], unit=" k€", digits=1)
    current_start, current_end, previous_start, previous_end = comparison_window(_as_date(anchor), "30d")
    if chart in {"sales", "salesDelta"}:
        customer_expression = "COALESCE(NULLIF(TRIM(c.cliente_pk), '') || ' · ' || NULLIF(TRIM(c.nombre), ''), NULLIF(TRIM(c.cliente_pk), ''), NULLIF(TRIM(c.nombre), ''), 'Sin nombre cliente')"
        rows = db.execute(text(f"""
            SELECT COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección') category,
                   COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END), 0) sales,
                   COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END), 0) previous
            FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
            LEFT JOIN clientes c ON c.id = v.cliente_id
            WHERE p.empresa_id = :empresa_id AND {customer_expression} = :customer
              AND ((v.fecha_venta BETWEEN :cs AND :ce) OR (v.fecha_venta BETWEEN :ps AND :pe)) {PRODUCT_FILTER_SQL}
            GROUP BY COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección')
            ORDER BY {"(sales - previous) ASC" if chart == "salesDelta" else "sales DESC"} LIMIT 10
        """), {"empresa_id": empresa_id, "customer": key, "cs": current_start, "ce": current_end,
                 "ps": previous_start, "pe": previous_end, **filters}).mappings().all()
        return _drill_result(
            f"{key}", "Secciones con mayor caída" if chart == "salesDelta" else "Secciones con más venta",
            [{"label": row["category"], "value": (float(row["sales"] or 0) - float(row["previous"] or 0)) / 1000 if chart == "salesDelta" else float(row["sales"] or 0) / 1000,
              "sub": f"Ventas actuales: {float(row['sales'] or 0):.0f} €"} for row in rows], unit=" k€", digits=1,
        )

    mgd_filters = {**filters, "marca": key}
    rows = db.execute(text(f"""
        SELECT p.sku, COALESCE(NULLIF(TRIM(p.nombre), ''), p.sku) articulo,
               COALESCE(SUM(v.ingreso_total), 0) sales, COALESCE(SUM(v.margen_destino_eur), 0) mgd
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :start AND :end {PRODUCT_FILTER_SQL}
        GROUP BY p.sku, p.nombre HAVING COALESCE(SUM(v.ingreso_total), 0) <> 0
        ORDER BY (COALESCE(SUM(v.margen_destino_eur), 0) / NULLIF(ABS(SUM(v.ingreso_total)), 0)) ASC, p.sku LIMIT 10
    """), {"empresa_id": empresa_id, "start": current_start, "end": current_end, **mgd_filters}).mappings().all()
    return _drill_result(
        f"MGD · {key}", "Artículos con peor margen destino",
        [{"label": f"{row['sku']} · {row['articulo']}", "value": float(row["mgd"] or 0) / abs(float(row["sales"] or 1)) * 100,
          "sub": f"MGD: {float(row['mgd'] or 0):.0f} €"} for row in rows], unit=" %", digits=1,
    )


def _severity(value: int) -> str:
    return "alta" if value >= 4 else "media" if value >= 3 else "baja"


def _agent(value: str) -> str:
    return value if value in {"maria", "lucia", "mattia", "ceo"} else "ceo"


def _office_decision_status(value: str) -> str:
    return {"completada": "hecha", "descartada": "rechazada"}.get(value, value)


def _as_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def build_office_viva_data(db: Session, empresa_id: int, *, pm: str | None = None,
                           seccion: str | None = None, marca: str | None = None,
                           articulo: str | None = None) -> dict:
    filters = normalize_office_filters(pm=pm, seccion=seccion, marca=marca, articulo=articulo)
    dashboard = build_executive_dashboard(
        db, empresa_id, period="30d", breakdown="cliente", product_manager=filters["pm"],
        seccion=filters["seccion"], marca=filters["marca"], articulo=filters["articulo"],
    )
    metrics = [metric for metric in services.calculate_inventory_metrics(db, empresa_id)
               if _metric_matches_filters(metric, filters)]
    signals = db.query(AgentSignal).filter(AgentSignal.empresa_id == empresa_id, AgentSignal.estado.in_(("nueva", "persistente", "resuelta"))).order_by(AgentSignal.impacto_ponderado_eur.desc(), AgentSignal.severidad.desc()).limit(100).all()
    decisions = db.query(AgentDecision).filter(AgentDecision.empresa_id == empresa_id).order_by(AgentDecision.updated_at.desc()).all()
    steps = db.query(AgentDecisionStep).filter(AgentDecisionStep.empresa_id == empresa_id).order_by(AgentDecisionStep.orden).all()
    step_map = defaultdict(list)
    for step in steps:
        step_map[step.decision_id].append({"label": step.etiqueta, "done": step.completado, "step_id": step.id})
    alerts = [{"id": str(row.id), "agent": _agent(row.agente), "sev": _severity(row.severidad), "title": row.detector.replace("_", " ").capitalize(), "detail": f"{row.entidad_tipo or 'Entidad'} · {row.entidad_id or 'Sin detalle'}", "since": row.ultima_deteccion, "status": "resuelta" if row.estado == "resuelta" else row.office_status, "owner": row.office_owner, "feedback": None} for row in signals if _signal_matches_filters(row, metrics, filters)]
    findings = defaultdict(list)
    for alert in alerts:
        if len(findings[alert["agent"]]) < 3:
            findings[alert["agent"]].append({"t": alert["title"], "e": alert["detail"], "m": alert["sev"].capitalize()})
    pms = defaultdict(list)
    for metric in metrics:
        pms[metric.get("product_manager") or "Sin PM"].append(metric)
    pm_health = []
    for name, rows in pms.items():
        value = sum(float(row.get("valor_inv") or 0) for row in rows)
        coverage = sum(float(row.get("dias_cobertura") or 0) * float(row.get("valor_inv") or 0) for row in rows) / value if value else 0
        breaks = sum("Riesgo Rotura" in (row.get("riesgos_categorizados") or []) for row in rows)
        over = round(100 * sum(float(row.get("dias_cobertura") or 0) > 90 for row in rows) / len(rows)) if rows else 0
        dead = sum(float(row.get("ventas_90d") or 0) == 0 and float(row.get("valor_inv") or 0) > 0 for row in rows)
        score = max(0, min(100, round(100 - min(45, breaks * 8) - min(30, over * .3) - (25 if coverage < 7 else 10 if coverage > 45 else 0))))
        issues = ([f"{breaks} referencias con riesgo de rotura"] if breaks else []) + ([f"{over} % con cobertura superior a 90 días"] if over else []) + ([f"{dead} referencias sin ventas en 90 días"] if dead else [])
        pm_health.append({"id": name, "name": name, "skus": len(rows), "cov": round(coverage), "breaks": breaks, "over": over, "dead": dead, "score": score, "issues": issues or ["Sin incidencias prioritarias"]})
    runs = db.query(AgentExecutionRun).filter(AgentExecutionRun.empresa_id == empresa_id).order_by(AgentExecutionRun.inicio.desc()).limit(10).all()
    notified = {}
    for row in db.query(AgentNotificationLog).filter(AgentNotificationLog.empresa_id == empresa_id).order_by(AgentNotificationLog.enviada_en.desc()).all():
        if row.product_manager not in notified:
            notified[row.product_manager] = row.enviada_en
    if not dashboard.get("ready"):
        return {"alerts": alerts, "decisions": [], "pms": pm_health, "findings": dict(findings), "runs": [], "notified": notified, "inventory": None, "filterOptions": office_filter_options(db, empresa_id)}
    margin = overview(db, empresa_id, "30d", marca=filters["marca"], seccion=filters["seccion"], product_manager=filters["pm"], articulo=filters["articulo"])
    series = dashboard.get("serie_mensual", [])
    inventory = dashboard["inventario"]
    inventory_date = inventory.get("fecha")
    inventory_payload = None
    if inventory_date:
        inventory_day = _as_date(inventory_date)
        history = db.execute(text(f"""
            SELECT ih.fecha_inventario, COALESCE(SUM(ih.inventario_eur), 0) value
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            WHERE p.empresa_id = :empresa_id {PRODUCT_FILTER_SQL} GROUP BY ih.fecha_inventario
            ORDER BY ih.fecha_inventario DESC LIMIT 12
        """), {"empresa_id": empresa_id, **filters}).mappings().all()
        movement = db.execute(text(f"""
            SELECT COALESCE(NULLIF(TRIM(p.seccion), ''), 'Sin sección') seccion, ih.inventario_eur,
                   MAX(v.fecha_venta) last_sale
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN ventas_historicas v ON v.producto_id = p.id AND v.fecha_venta <= :inventory_date
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date {PRODUCT_FILTER_SQL}
            GROUP BY p.seccion, ih.producto_id, ih.inventario_eur
        """), {"empresa_id": empresa_id, "inventory_date": inventory_date, **filters}).mappings().all()
        buckets = {"0-30": 0.0, "31-90": 0.0, "91-180": 0.0, ">180": 0.0}
        dead_by_category = defaultdict(float)
        for row in movement:
            days = (inventory_day - _as_date(row["last_sale"])).days if row["last_sale"] else 181
            label = "0-30" if days <= 30 else "31-90" if days <= 90 else "91-180" if days <= 180 else ">180"
            buckets[label] += float(row["inventario_eur"] or 0)
            if days > 180: dead_by_category[row["seccion"]] += float(row["inventario_eur"] or 0)
        trend = [float(row["value"] or 0) for row in reversed(history)] or [float(inventory["valor_eur"])]
        previous_value = trend[-2] if len(trend) > 1 else trend[-1]
        inventory_payload = {"valueEur": inventory["valor_eur"], "valueDelta": (inventory["valor_eur"] - previous_value) / previous_value * 100 if previous_value else 0, "units": inventory["unidades"], "unitsDelta": 0, "agingDays": 180, "agingDelta": 0, "deadEur": buckets[">180"], "deadDays": 180, "coverageDays": round(sum(item["cov"] * item["skus"] for item in pm_health) / max(1, sum(item["skus"] for item in pm_health))), "updatedAt": inventory_day, "trendEur": trend, "aging": list(buckets.items()), "deadByCat": sorted(dead_by_category.items(), key=lambda item: item[1], reverse=True)[:8]}
    mgd_rows = db.execute(text(f"""
        SELECT COALESCE(NULLIF(TRIM(p.marca), ''), 'Sin marca') category,
               COALESCE(SUM(v.ingreso_total), 0) sales, COALESCE(SUM(v.margen_destino_eur), 0) mgd
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id AND v.fecha_venta BETWEEN :start AND :end {PRODUCT_FILTER_SQL}
        GROUP BY COALESCE(NULLIF(TRIM(p.marca), ''), 'Sin marca') ORDER BY category
    """), {"empresa_id": empresa_id, "start": dashboard["periodo_actual"]["inicio"],
             "end": dashboard["periodo_actual"]["fin"], **filters}).mappings().all()
    return {
        "kpis": {"sales": {"value": dashboard["actual"]["ventas_eur"], "delta": dashboard["variacion"]["ventas_pct"], "spark": [item["ventas_eur"] for item in series]}, "stockHealth": {"value": 100 - 100 * dashboard["inventario"]["clase_a_sin_stock"] / max(1, dashboard["inventario"]["clase_a_total"]), "delta": None}, "margin": {"value": margin["actual"].get("mg_pct"), "delta": margin["variacion"].get("mg_pct"), "spark": [item["mg_pct"] or 0 for item in margin.get("serie_diaria", [])][-8:]}, "alertsSpark": []},
        "alerts": alerts, "pms": pm_health, "findings": dict(findings),
        "sales": [(row["entidad"], row["ventas_eur"] / 1000, row["variacion_pct"] or 0) for row in dashboard["desglose"]["filas"][:8]],
        "mgWeeks": [item["mg_pct"] or 0 for item in margin.get("serie_diaria", [])][-8:],
        "mgd": [(row["category"], float(row["mgd"] or 0) / float(row["sales"] or 1) * 100) for row in mgd_rows],
        "decisions": [{"id": str(row.id), "title": row.titulo, "why": row.descripcion, "impact": row.metrica_objetivo, "agents": ["ceo"], "status": _office_decision_status(row.estado), "owner": row.responsable, "steps": step_map[row.id]} for row in decisions],
        "runs": [{"id": row.run_id, "start": row.inicio, "durMin": round((row.duracion_ms or 0) / 60000), "status": "ok" if row.estado == "completada" else "error", "alerts": 0} for row in runs], "notified": notified, "inventory": inventory_payload,
        "filterOptions": office_filter_options(db, empresa_id), "updated_at": datetime.utcnow(),
    }


def dead_inventory_rows(db: Session, empresa_id: int) -> list[dict]:
    dashboard = build_executive_dashboard(db, empresa_id, period="30d", breakdown="cliente")
    inventory_date = dashboard.get("inventario", {}).get("fecha") if dashboard.get("ready") else None
    if not inventory_date:
        return []
    inventory_day = _as_date(inventory_date)
    rows = db.execute(text("""
        SELECT p.sku, p.nombre, COALESCE(p.familia, 'Sin familia') family,
               COALESCE(p.product_manager, 'Sin PM') product_manager, ih.unidades_inventario, ih.inventario_eur,
               MAX(v.fecha_venta) last_sale
        FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
        LEFT JOIN ventas_historicas v ON v.producto_id = p.id AND v.fecha_venta <= :inventory_date
        WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date
        GROUP BY p.sku, p.nombre, p.familia, p.product_manager, ih.unidades_inventario, ih.inventario_eur
    """), {"empresa_id": empresa_id, "inventory_date": inventory_day}).mappings().all()
    result = []
    for row in rows:
        days = (inventory_day - _as_date(row["last_sale"])).days if row["last_sale"] else 181
        if days > 180 and float(row["inventario_eur"] or 0) > 0:
            result.append({"sku": row["sku"], "articulo": row["nombre"], "familia": row["family"], "product_manager": row["product_manager"], "unidades": row["unidades_inventario"], "inventario_eur": float(row["inventario_eur"] or 0), "ultima_venta": str(row["last_sale"] or "Sin ventas"), "dias_sin_venta": days})
    return sorted(result, key=lambda item: item["inventario_eur"], reverse=True)
