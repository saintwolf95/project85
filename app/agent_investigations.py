"""Investigaciones de Control IA con contrato de evidencia verificable."""
import json
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from .agent_signals import build_evidence_bundle
from .copilot_service import get_openai_client


CATALOG = {
    "family_sales_comparison": "Compara ventas y unidades de una familia entre dos periodos equivalentes.",
    "family_price_volume": "Descompone la variación de una familia entre precio y volumen.",
    "family_top_customers": "Identifica los clientes que explican el cambio de ventas de una familia.",
    "family_inventory_risk": "Relaciona una familia con roturas, cobertura y valor actual de inventario.",
    "signal_summary": "Recupera la señal original con impacto, periodo y confianza.",
}


def _number(value: Any) -> float:
    return float(value or 0)


def _anchor(bundle: dict) -> tuple[date, date, str]:
    signal = next((item for item in bundle["senales"] if item["entidad"]["tipo"] == "familia"), None)
    if not signal:
        raise ValueError("No hay una señal por familia investigable.")
    start, end = (date.fromisoformat(value) for value in signal["periodo"])
    return start, end, signal["entidad"]["id"]


def _safe_plan(question: str, bundle: dict) -> list[str]:
    """Plan de reserva, limitado al catálogo; evita ejecutar una intención no autorizada."""
    _, _, family = _anchor(bundle)
    plan = ["signal_summary", "family_sales_comparison", "family_price_volume", "family_top_customers"]
    if any(word in question.lower() for word in ("stock", "rotura", "inventario", "cobertura")):
        plan.append("family_inventory_risk")
    return plan


def propose_plan(question: str, bundle: dict) -> list[str]:
    """El LLM propone solo ids del catálogo; si falla, se usa el plan seguro."""
    fallback = _safe_plan(question, bundle)
    client = get_openai_client()
    if not client:
        return fallback
    prompt = {
        "tarea": "Propón las preguntas a investigar seleccionando solo ids del catálogo.",
        "pregunta_usuario": question[:1200], "catalogo": CATALOG, "evidence_bundle": bundle,
        "respuesta": "JSON estricto: {\"queries\":[\"id_catalogo\"]}. Máximo 5. No SQL.",
    }
    try:
        content = client.chat.completions.create(
            model="gpt-4o", messages=[{"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}], temperature=0,
        ).choices[0].message.content
        planned = json.loads(content).get("queries", [])
        selected = [item for item in planned if item in CATALOG]
        return selected[:5] or fallback
    except Exception:
        return fallback


def _query(db: Session, sql: str, params: dict) -> list[dict]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def collect_evidence(db: Session, empresa_id: int, plan: list[str], bundle: dict) -> dict[str, dict]:
    current_start, current_end, family = _anchor(bundle)
    duration = (current_end - current_start).days + 1
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=duration - 1)
    params = {"empresa_id": empresa_id, "family": family, "cs": current_start, "ce": current_end, "ps": previous_start, "pe": previous_end}
    evidence: dict[str, dict] = {}
    for sequence, item in enumerate(plan, start=1):
        key = f"e{sequence}"
        if item == "signal_summary":
            evidence[key] = {"query": item, "data": [signal for signal in bundle["senales"] if signal["entidad"]["id"] == family]}
        elif item == "family_sales_comparison":
            rows = _query(db, """
                SELECT SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actuales_eur,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_base_eur,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END) unidades_actuales,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END) unidades_base
                FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
                WHERE p.empresa_id=:empresa_id AND p.familia=:family AND v.fecha_venta BETWEEN :ps AND :ce
            """, params)
            evidence[key] = {"query": item, "periodos": {"actual": [str(current_start), str(current_end)], "base": [str(previous_start), str(previous_end)]}, "data": rows}
        elif item == "family_price_volume":
            rows = _query(db, """
                SELECT SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actuales_eur,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_base_eur,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END) unidades_actuales,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END) unidades_base
                FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
                WHERE p.empresa_id=:empresa_id AND p.familia=:family AND v.fecha_venta BETWEEN :ps AND :ce
            """, params)
            row = rows[0] if rows else {}
            base_units, current_units = _number(row.get("unidades_base")), _number(row.get("unidades_actuales"))
            base_sales, current_sales = _number(row.get("ventas_base_eur")), _number(row.get("ventas_actuales_eur"))
            base_price = base_sales / base_units if base_units else 0
            current_price = current_sales / current_units if current_units else 0
            evidence[key] = {"query": item, "data": [{"precio_medio_base_eur": base_price, "precio_medio_actual_eur": current_price, "efecto_volumen_eur": (current_units - base_units) * base_price, "efecto_precio_eur": (current_price - base_price) * current_units}]}
        elif item == "family_top_customers":
            evidence[key] = {"query": item, "data": _query(db, """
                SELECT COALESCE(c.nombre,'Cliente sin identificar') cliente,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actuales_eur,
                  SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_base_eur
                FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id LEFT JOIN clientes c ON c.id=v.cliente_id
                WHERE p.empresa_id=:empresa_id AND p.familia=:family AND v.fecha_venta BETWEEN :ps AND :ce
                GROUP BY COALESCE(c.nombre,'Cliente sin identificar') ORDER BY (SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END)-SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END)) ASC LIMIT 5
            """, params)}
        elif item == "family_inventory_risk":
            evidence[key] = {"query": item, "data": _query(db, """
                SELECT p.sku, p.nombre articulo, ih.unidades_inventario, ih.inventario_eur, pm.abc, pm.dias_cobertura
                FROM inventario_historico ih JOIN productos p ON p.id=ih.producto_id LEFT JOIN producto_metricas pm ON pm.producto_id=p.id
                WHERE p.empresa_id=:empresa_id AND p.familia=:family AND ih.fecha_inventario=(SELECT MAX(ih2.fecha_inventario) FROM inventario_historico ih2 JOIN productos p2 ON p2.id=ih2.producto_id WHERE p2.empresa_id=:empresa_id)
                ORDER BY ih.inventario_eur DESC LIMIT 20
            """, params)}
    return evidence


NUMBER = re.compile(r"(?<![\w\[])\-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?")


def _numeric_forms(value: Any) -> set[str]:
    if isinstance(value, bool) or value is None:
        return set()
    if isinstance(value, (int, float)):
        number = float(value)
        forms = {str(int(number)) if number.is_integer() else str(number)}
        for digits in (0, 1, 2):
            forms.add(f"{number:.{digits}f}")
            forms.add(f"{number:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", "."))
        return forms
    if isinstance(value, dict):
        return set().union(*(_numeric_forms(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(_numeric_forms(item) for item in value))
    return set(NUMBER.findall(str(value)))


def verify_report(report: str, evidence: dict[str, dict]) -> dict:
    cited = set(re.findall(r"\[(e\d+)\]", report))
    valid_keys = set(evidence)
    allowed_numbers = set().union(*(_numeric_forms(item) for item in evidence.values()))
    numbers = set(NUMBER.findall(report))
    orphan_numbers = sorted(number for number in numbers if number.rstrip("%") not in allowed_numbers and number not in allowed_numbers)
    return {"valid": not (orphan_numbers or not cited or not cited.issubset(valid_keys)), "citations": sorted(cited), "orphan_numbers": orphan_numbers, "missing_or_invalid_citations": sorted(cited - valid_keys)}


def _fallback_report(evidence: dict[str, dict]) -> str:
    return "\n".join(f"- Evidencia disponible [{key}]: {json.dumps(block['data'], ensure_ascii=False, default=str)}" for key, block in evidence.items())


def redact_and_verify(question: str, plan: list[str], evidence: dict[str, dict]) -> dict:
    client = get_openai_client()
    if not client:
        report = _fallback_report(evidence)
        return {"report": report, "verification": verify_report(report, evidence), "mode": "fallback"}
    instruction = "Redacta una investigación en español usando SOLO este JSON. Cada cifra debe citar [eN] y reproducirse desde la evidencia; no inventes cálculos."
    for attempt in range(2):
        extra = "" if attempt == 0 else " Corrige: no uses cifras huérfanas y cita cada afirmación cuantitativa."
        response = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": instruction + extra + "\n" + json.dumps({"pregunta": question, "plan": plan, "evidence": evidence}, ensure_ascii=False, default=str)}], temperature=0)
        report = response.choices[0].message.content
        verification = verify_report(report, evidence)
        if verification["valid"]:
            return {"report": report, "verification": verification, "mode": "verified"}
    return {"report": None, "verification": verification, "mode": "blocked"}


def run_investigation(db: Session, empresa_id: int, agent: str, question: str) -> dict:
    bundle = build_evidence_bundle(db, empresa_id, agent, limit=7)
    plan = propose_plan(question, bundle)
    evidence = collect_evidence(db, empresa_id, plan, bundle)
    result = redact_and_verify(question, plan, evidence)
    return {"question": question, "plan": [{"id": item, "question": CATALOG[item]} for item in plan], "evidence": evidence, **result}
