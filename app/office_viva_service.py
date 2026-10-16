"""Adaptador de fuentes verificadas al contrato cerrado de Oficina Viva."""
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from . import services
from .dashboard_service import build_executive_dashboard
from .margin_service import overview
from .models import AgentDecision, AgentDecisionStep, AgentExecutionRun, AgentNotificationLog, AgentSignal


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


def build_office_viva_data(db: Session, empresa_id: int) -> dict:
    dashboard = build_executive_dashboard(db, empresa_id, period="30d", breakdown="cliente")
    metrics = services.calculate_inventory_metrics(db, empresa_id)
    signals = db.query(AgentSignal).filter(AgentSignal.empresa_id == empresa_id, AgentSignal.estado.in_(("nueva", "persistente", "resuelta"))).order_by(AgentSignal.impacto_ponderado_eur.desc(), AgentSignal.severidad.desc()).limit(100).all()
    decisions = db.query(AgentDecision).filter(AgentDecision.empresa_id == empresa_id).order_by(AgentDecision.updated_at.desc()).all()
    steps = db.query(AgentDecisionStep).filter(AgentDecisionStep.empresa_id == empresa_id).order_by(AgentDecisionStep.orden).all()
    step_map = defaultdict(list)
    for step in steps:
        step_map[step.decision_id].append({"label": step.etiqueta, "done": step.completado, "step_id": step.id})
    alerts = [{"id": str(row.id), "agent": _agent(row.agente), "sev": _severity(row.severidad), "title": row.detector.replace("_", " ").capitalize(), "detail": f"{row.entidad_tipo or 'Entidad'} · {row.entidad_id or 'Sin detalle'}", "since": row.ultima_deteccion, "status": "resuelta" if row.estado == "resuelta" else row.office_status, "owner": row.office_owner, "feedback": None} for row in signals]
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
        return {"alerts": alerts, "decisions": [], "pms": pm_health, "findings": dict(findings), "runs": [], "notified": notified, "inventory": None}
    margin = overview(db, empresa_id, "30d")
    series = dashboard.get("serie_mensual", [])
    inventory = dashboard["inventario"]
    inventory_date = inventory.get("fecha")
    inventory_payload = None
    if inventory_date:
        inventory_day = _as_date(inventory_date)
        history = db.execute(text("""
            SELECT ih.fecha_inventario, COALESCE(SUM(ih.inventario_eur), 0) value
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            WHERE p.empresa_id = :empresa_id GROUP BY ih.fecha_inventario
            ORDER BY ih.fecha_inventario DESC LIMIT 12
        """), {"empresa_id": empresa_id}).mappings().all()
        movement = db.execute(text("""
            SELECT COALESCE(NULLIF(TRIM(p.familia), ''), 'Sin familia') family, ih.inventario_eur,
                   MAX(v.fecha_venta) last_sale
            FROM inventario_historico ih JOIN productos p ON p.id = ih.producto_id
            LEFT JOIN ventas_historicas v ON v.producto_id = p.id AND v.fecha_venta <= :inventory_date
            WHERE p.empresa_id = :empresa_id AND ih.fecha_inventario = :inventory_date
            GROUP BY p.familia, ih.producto_id, ih.inventario_eur
        """), {"empresa_id": empresa_id, "inventory_date": inventory_date}).mappings().all()
        buckets = {"0-30": 0.0, "31-90": 0.0, "91-180": 0.0, ">180": 0.0}
        dead_by_category = defaultdict(float)
        for row in movement:
            days = (inventory_day - _as_date(row["last_sale"])).days if row["last_sale"] else 181
            label = "0-30" if days <= 30 else "31-90" if days <= 90 else "91-180" if days <= 180 else ">180"
            buckets[label] += float(row["inventario_eur"] or 0)
            if days > 180: dead_by_category[row["family"]] += float(row["inventario_eur"] or 0)
        trend = [float(row["value"] or 0) for row in reversed(history)] or [float(inventory["valor_eur"])]
        previous_value = trend[-2] if len(trend) > 1 else trend[-1]
        inventory_payload = {"valueEur": inventory["valor_eur"], "valueDelta": (inventory["valor_eur"] - previous_value) / previous_value * 100 if previous_value else 0, "units": inventory["unidades"], "unitsDelta": 0, "agingDays": 180, "agingDelta": 0, "deadEur": buckets[">180"], "deadDays": 180, "coverageDays": round(sum(item["cov"] * item["skus"] for item in pm_health) / max(1, sum(item["skus"] for item in pm_health))), "updatedAt": inventory_day, "trendEur": trend, "aging": list(buckets.items()), "deadByCat": sorted(dead_by_category.items(), key=lambda item: item[1], reverse=True)[:8]}
    return {
        "kpis": {"sales": {"value": dashboard["actual"]["ventas_eur"], "delta": dashboard["variacion"]["ventas_pct"], "spark": [item["ventas_eur"] for item in series]}, "stockHealth": {"value": 100 - 100 * dashboard["inventario"]["clase_a_sin_stock"] / max(1, dashboard["inventario"]["clase_a_total"]), "delta": None}, "margin": {"value": margin["actual"].get("mg_pct"), "delta": margin["variacion"].get("mg_pct"), "spark": [item["mg_pct"] or 0 for item in margin.get("serie_diaria", [])][-8:]}, "alertsSpark": []},
        "alerts": alerts, "pms": pm_health, "findings": dict(findings),
        "sales": [(row["entidad"], row["ventas_eur"] / 1000, row["variacion_pct"] or 0) for row in dashboard["desglose"]["filas"][:8]],
        "mgWeeks": [item["mg_pct"] or 0 for item in margin.get("serie_diaria", [])][-8:], "mgd": [],
        "decisions": [{"id": str(row.id), "title": row.titulo, "why": row.descripcion, "impact": row.metrica_objetivo, "agents": ["ceo"], "status": _office_decision_status(row.estado), "owner": row.responsable, "steps": step_map[row.id]} for row in decisions],
        "runs": [{"id": row.run_id, "start": row.inicio, "durMin": round((row.duracion_ms or 0) / 60000), "status": "ok" if row.estado == "completada" else "error", "alerts": 0} for row in runs], "notified": notified, "inventory": inventory_payload,
        "updated_at": datetime.utcnow(),
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
