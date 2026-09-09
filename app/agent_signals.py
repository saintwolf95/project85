"""Señales deterministas para los agentes de negocio.

Los detectores calculan y persisten la evidencia. Los modelos de lenguaje solo
reciben el resultado serializado para explicarlo: nunca reciben herramientas SQL.
"""
import hashlib
import json
import math
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import AgentSignal, AgentSignalFeedback
from .business_rules import resolve_detector_threshold, resolve_rule, rule_evidence, truthy


ACTIVE_STATES = ("nueva", "persistente")
MAX_NEW_SIGNALS_PER_AGENT_PER_DAY = 5
MAX_NEW_OPPORTUNITIES_PER_AGENT_PER_DAY = 2
FDR_ALPHA = 0.10
SUPRESION_DIAS = 30
IMPACTO_FACTOR = {"realizado": 1.00, "en_riesgo": 0.60, "capital": 0.30}
IMPACTO_TIPO_POR_DETECTOR = {
    "caida_facturacion_familia": "realizado",
    "precio_volumen_familia": "realizado",
    "erosion_mgd_familia": "realizado",
    "rotura_stock_clase_a": "en_riesgo",
    "cobertura_vs_lead_time": "en_riesgo",
    "concentracion_clientes": "en_riesgo",
    "exceso_cobertura": "capital",
    "stock_muerto_90d": "capital",
    "cliente_en_fuga": "en_riesgo",
    "caida_ventas_sku": "realizado",
    "caida_ventas_comercial": "realizado",
    "perdida_amplitud_cliente": "en_riesgo",
    "dispersion_precio_sku": "realizado",
    "cliente_recuperado": "realizado",
    "familia_en_aceleracion": "realizado",
    "erosion_mgd_cliente": "realizado",
    "erosion_mgd_comercial": "realizado",
    "venta_bajo_coste": "realizado",
    "margen_bajo_objetivo": "realizado",
    "concentracion_margen": "en_riesgo",
    "cobertura_clase_b": "en_riesgo",
    "sku_sin_stock_sin_ventas": "capital",
    "stock_sobre_familia_en_declive": "capital",
}
OPPORTUNITY_DETECTORS = {"cliente_recuperado", "familia_en_aceleracion"}


def _number(value, default=0.0):
    return float(value or default)


def is_signal_suppressed(db: Session, signal: AgentSignal, now: datetime) -> bool:
    """Una señal descartada conserva trazabilidad pero no vuelve a la bandeja durante 30 días."""
    if signal.estado != "descartada" or not signal.descartada_en:
        return False
    if (now - signal.descartada_en).days >= SUPRESION_DIAS:
        return False
    feedback = db.query(AgentSignalFeedback.veredicto).filter(
        AgentSignalFeedback.empresa_id == signal.empresa_id,
        AgentSignalFeedback.signal_id == signal.id,
    ).order_by(AgentSignalFeedback.created_at.desc()).first()
    return bool(feedback and feedback[0] in {"falso_positivo", "no_accionable"})


def _fingerprint(signal: dict) -> str:
    raw = "|".join(str(signal.get(field) or "") for field in (
        "agente", "detector", "entidad_tipo", "entidad_id"
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def impact_type_for_detector(detector: str) -> str:
    """Clasifica la naturaleza económica sin alterar el importe de negocio."""
    return IMPACTO_TIPO_POR_DETECTOR.get(detector, "en_riesgo")


def _signal(agent, detector, entity_type, entity_id, start, end, severity, impact, confidence, current, expected, evidence, naturaleza=None):
    impact_eur = max(0.0, _number(impact))
    impact_type = impact_type_for_detector(detector)
    signal = {
        "agente": agent, "detector": detector, "entidad_tipo": entity_type,
        "entidad_id": str(entity_id), "periodo_inicio": start, "periodo_fin": end,
        "severidad": severity, "impacto_eur": impact_eur,
        "impacto_tipo": impact_type,
        "impacto_ponderado_eur": impact_eur * IMPACTO_FACTOR[impact_type],
        "naturaleza": naturaleza or ("oportunidad" if detector in OPPORTUNITY_DETECTORS else "riesgo"),
        "confianza": max(0.0, min(1.0, _number(confidence))),
        "valor_actual": _number(current), "valor_esperado": _number(expected),
        "desviacion": _number(current) - _number(expected), "evidencia": evidence,
    }
    signal["fingerprint"] = _fingerprint(signal)
    return signal


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    size = len(ordered)
    if not size:
        return 0.0
    middle = size // 2
    return ordered[middle] if size % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def _normal_lower_tail(z: float) -> float:
    """p unilateral estable, sin asumir una desviación típica frágil."""
    return 0.5 * math.erfc(-z / math.sqrt(2))


def _normal_upper_tail(z: float) -> float:
    """p unilateral para crecimientos persistentes."""
    return 0.5 * math.erfc(z / math.sqrt(2))


def _benjamini_hochberg(pvalues: list[float], alpha: float = FDR_ALPHA) -> set[int]:
    """Control FDR BH: devuelve índices aceptados, no prioriza por p-valor."""
    if not pvalues:
        return set()
    ordered = sorted(enumerate(pvalues), key=lambda item: item[1])
    accepted_until = -1
    total = len(ordered)
    for rank, (_, pvalue) in enumerate(ordered, start=1):
        if pvalue <= alpha * rank / total:
            accepted_until = rank
    return {index for index, _ in ordered[:accepted_until]} if accepted_until > 0 else set()


def _robust_temporal_tests(db: Session, empresa_id: int, entities: list[str], ps: date, pe: date, cs: date, ce: date, metric: str = "ventas", entity_sql: str = "COALESCE(p.familia, 'Sin familia')") -> dict[str, dict]:
    """Mediana+MAD y CUSUM sobre la métrica diaria correcta."""
    if not entities:
        return {}
    rows = db.execute(text(f"""
        SELECT {entity_sql} entidad, v.fecha_venta fecha,
          SUM(CASE WHEN :metric = 'mgd' THEN v.margen_destino_eur ELSE v.ingreso_total END) valor
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY {entity_sql}, v.fecha_venta
    """), {"empresa_id": empresa_id, "ps": ps, "ce": ce, "metric": metric}).mappings().all()
    dates = [ps + timedelta(days=offset) for offset in range((ce - ps).days + 1)]
    series = defaultdict(dict)
    for row in rows:
        series[row["entidad"]][row["fecha"]] = _number(row["valor"])
    result = {}
    for entity in entities:
        values = series[entity]
        baseline = [values.get(day, 0.0) for day in dates if day <= pe]
        current = [values.get(day, 0.0) for day in dates if day >= cs]
        if len(baseline) < 14 or len(current) < 7:
            result[entity] = {"p_value": 1.0, "apto": False, "motivo": "histórico diario insuficiente"}
            continue
        median = _median(baseline)
        mad = _median([abs(value - median) for value in baseline])
        scale = max(1.0, 1.4826 * mad)
        current_median = _median(current)
        z = (current_median - median) / scale
        # CUSUM inferior y superior simétricos: el primero conserva el criterio de riesgos.
        cusum = 0.0
        lower_limit = 0.5 * scale
        for value in current:
            cusum = min(0.0, cusum + (value - median + lower_limit))
        cusum_superior = 0.0
        for value in current:
            cusum_superior = max(0.0, cusum_superior + (value - median - lower_limit))
        streak = 0
        for value in reversed(current):
            if value < median - lower_limit:
                streak += 1
            else:
                break
        result[entity] = {
            "metrica": metric, "p_value": _normal_lower_tail(z), "p_value_alza": _normal_upper_tail(z), "apto": True, "baseline_mediana_eur_dia": median,
            "mad_eur_dia": mad, "mediana_actual_eur_dia": current_median, "z_robusto": z,
            "cusum_inferior": cusum, "dias_consecutivos_bajos": streak,
            "persistente": streak >= 3 or abs(cusum) >= 5 * scale,
            "cusum_superior": cusum_superior,
            "persistente_alza": sum(value > median + lower_limit for value in current[-3:]) >= 3 or cusum_superior >= 5 * scale,
        }
    return result


def _sales_window(db: Session, empresa_id: int):
    row = db.execute(text("""
        SELECT MIN(v.fecha_venta), MAX(v.fecha_venta)
        FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id
        WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": empresa_id}).first()
    if not row or not row[0] or not row[1]:
        return None
    first, anchor = row[0], row[1]
    days = min(30, max(1, (anchor - first).days + 1))
    current_start = anchor - timedelta(days=days - 1)
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return previous_start, previous_end, current_start, anchor, days


def _sales_signals(db: Session, empresa_id: int) -> list[dict]:
    window = _sales_window(db, empresa_id)
    if not window:
        return []
    previous_start, previous_end, current_start, anchor, days = window
    confidence = min(1.0, days / 30)
    params = {"empresa_id": empresa_id, "ps": previous_start, "pe": previous_end, "cs": current_start, "ce": anchor}
    rows = db.execute(text("""
        SELECT COALESCE(p.familia, 'Sin familia') AS entidad,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END),0) previo,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END),0) actual,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END),0) unidades_previas,
          COALESCE(SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END),0) unidades_actuales
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY COALESCE(p.familia, 'Sin familia')
        HAVING SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) > 0
    """), params).mappings().all()
    signals = []
    for row in rows:
        previous, current = _number(row["previo"]), _number(row["actual"])
        change = current - previous
        threshold_rule = resolve_detector_threshold(db, empresa_id, "caida_facturacion_familia", default=max(250, previous * .08), on_date=anchor)
        threshold = _number(threshold_rule.value, max(250, previous * .08))
        if change >= -threshold:
            continue
        pct = change / previous * 100
        severity = 5 if pct <= -30 else 4 if pct <= -15 else 3
        evidence = {"metodo": "periodos equivalentes", "periodo_actual": [str(current_start), str(anchor)],
                    "periodo_base": [str(previous_start), str(previous_end)], "ventas_actuales_eur": current,
                    "ventas_base_eur": previous, "variacion_eur": change, "variacion_pct": pct,
                    "unidades_actuales": _number(row["unidades_actuales"]), "unidades_base": _number(row["unidades_previas"]),
                    "umbral_eur": threshold, "reglas_aplicadas": rule_evidence(umbral_detector=threshold_rule)}
        signals.append(_signal("lucia", "caida_facturacion_familia", "familia", row["entidad"], current_start, anchor,
                               severity, -change, confidence, current, previous, evidence))
        up, uc = _number(row["unidades_previas"]), _number(row["unidades_actuales"])
        if up > 0 and uc > 0:
            pp, pc = previous / up, current / uc
            volume = (uc - up) * pp
            price = (pc - pp) * uc
            if abs(price) > 250 or abs(volume) > 250:
                decomposition = dict(evidence, precio_medio_base=pp, precio_medio_actual=pc,
                                     efecto_precio_eur=price, efecto_volumen_eur=volume)
                signals.append(_signal("lucia", "precio_volumen_familia", "familia", row["entidad"], current_start, anchor,
                                       severity, abs(min(0, price)) + abs(min(0, volume)), confidence,
                                       current, previous, decomposition))
    # Concentración de facturación: solo se emite cuando top 3 superan el 50 %.
    # Filtro estadístico común para familias: mediana/MAD, CUSUM y Benjamini-Hochberg.
    tested = [signal for signal in signals if signal["detector"] == "caida_facturacion_familia"]
    temporal = _robust_temporal_tests(db, empresa_id, [signal["entidad_id"] for signal in tested], previous_start, previous_end, current_start, anchor)
    accepted = _benjamini_hochberg([temporal[signal["entidad_id"]]["p_value"] for signal in tested])
    accepted_entities = set()
    for index, signal in enumerate(tested):
        stats = temporal[signal["entidad_id"]]
        stats["fdr_bh_alpha"] = FDR_ALPHA
        stats["fdr_aprobado"] = index in accepted
        signal["evidencia"]["validacion_estadistica"] = stats
        if stats["fdr_aprobado"] and stats.get("persistente"):
            accepted_entities.add(signal["entidad_id"])
    signals = [signal for signal in signals if signal["detector"] not in {"caida_facturacion_familia", "precio_volumen_familia"} or signal["entidad_id"] in accepted_entities]
    for signal in signals:
        if signal["detector"] == "precio_volumen_familia":
            signal["evidencia"]["validacion_estadistica"] = temporal[signal["entidad_id"]]

    # SKU y comercial: mismas ventanas comparables, pero umbrales y entidad propios.
    sku_rows = db.execute(text("""
        SELECT p.sku entidad, COALESCE(p.familia, 'Sin familia') familia,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) previo,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY p.sku, COALESCE(p.familia, 'Sin familia') HAVING SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) >= 500
    """), params).mappings().all()
    sku_candidates = []
    for row in sku_rows:
        previous, current = _number(row["previo"]), _number(row["actual"])
        change = current - previous
        threshold_rule = resolve_detector_threshold(db, empresa_id, "caida_ventas_sku", default=max(500, previous * .15), on_date=anchor)
        threshold = _number(threshold_rule.value, max(500, previous * .15))
        if change < -threshold:
            pct = change / previous * 100
            sku_candidates.append(_signal("lucia", "caida_ventas_sku", "sku", row["entidad"], current_start, anchor,
                5 if pct <= -40 else 4 if pct <= -25 else 3, -change, confidence, current, previous,
                {"metodo": "ventas SKU en periodos equivalentes", "familia": row["familia"], "ventas_actuales_eur": current, "ventas_base_eur": previous, "variacion_eur": change, "variacion_pct": pct, "umbral_eur": threshold,
                 "periodo_actual": [str(current_start), str(anchor)], "periodo_base": [str(previous_start), str(previous_end)],
                 "reglas_aplicadas": rule_evidence(umbral_detector=threshold_rule)}))
    sku_temporal = _robust_temporal_tests(db, empresa_id, [signal["entidad_id"] for signal in sku_candidates], previous_start, previous_end, current_start, anchor, entity_sql="p.sku")
    sku_accepted = _benjamini_hochberg([sku_temporal[signal["entidad_id"]]["p_value"] for signal in sku_candidates])
    for index, signal in enumerate(sku_candidates):
        stats = sku_temporal[signal["entidad_id"]]
        signal["evidencia"]["validacion_estadistica"] = dict(stats, fdr_bh_alpha=FDR_ALPHA, fdr_aprobado=index in sku_accepted)
        if index in sku_accepted and stats.get("persistente"):
            signals.append(signal)

    commercial_rows = db.execute(text("""
        SELECT COALESCE(NULLIF(v.comercial_factura,''), 'Sin comercial') entidad,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) previo,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY COALESCE(NULLIF(v.comercial_factura,''), 'Sin comercial') HAVING SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) > 0
    """), params).mappings().all()
    for row in commercial_rows:
        previous, current = _number(row["previo"]), _number(row["actual"])
        change = current - previous
        if change < -max(1000, previous * .10):
            pct = change / previous * 100
            signals.append(_signal("lucia", "caida_ventas_comercial", "comercial", row["entidad"], current_start, anchor,
                4 if pct <= -20 else 3, -change, confidence, current, previous,
                {"metodo": "cartera comercial en periodos equivalentes", "ventas_actuales_eur": current, "ventas_base_eur": previous, "variacion_eur": change, "variacion_pct": pct}))

    amplitude_rows = db.execute(text("""
        SELECT c.cliente_pk cliente, COALESCE(c.nombre, 'Cliente sin identificar') nombre, COALESCE(p.familia, 'Sin familia') familia,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) previo,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id JOIN clientes c ON c.id=v.cliente_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY c.cliente_pk, COALESCE(c.nombre, 'Cliente sin identificar'), COALESCE(p.familia, 'Sin familia')
    """), params).mappings().all()
    per_client = defaultdict(list)
    for row in amplitude_rows:
        per_client[row["cliente"]].append(row)
    for customer, rows_by_family in per_client.items():
        base = [row for row in rows_by_family if _number(row["previo"]) > 0]
        current_families = [row for row in rows_by_family if _number(row["actual"]) > 0]
        base_sales = sum(_number(row["previo"]) for row in base)
        if len(base) >= 5 and base_sales >= 2000 and len(current_families) <= len(base) * .60:
            lost = [row for row in base if _number(row["actual"]) <= 0]
            impact = sum(_number(row["previo"]) for row in lost)
            strategic = truthy(resolve_rule(db, empresa_id, "cliente_estrategico", cliente=customer, default=False, on_date=anchor))
            signals.append(_signal("lucia", "perdida_amplitud_cliente", "cliente", customer, current_start, anchor, 5 if strategic else 4, impact, confidence, len(current_families), len(base),
                {"metodo": "perdida de amplitud de familias", "cliente": rows_by_family[0]["nombre"], "familias_base": len(base), "familias_actuales": len(current_families), "familias_perdidas": [row["familia"] for row in lost], "ventas_base_familias_perdidas_eur": impact,
                 "reglas_aplicadas": rule_evidence(cliente_estrategico=resolve_rule(db, empresa_id, "cliente_estrategico", cliente=customer, default=False, on_date=anchor))}))

    price_rows = db.execute(text("""
        SELECT p.sku, COALESCE(p.familia, 'Sin familia') familia, c.cliente_pk cliente,
          SUM(v.ingreso_total) ventas, SUM(v.cantidad_vendida) unidades
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id JOIN clientes c ON c.id=v.cliente_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :desde AND :ce
        GROUP BY p.sku, COALESCE(p.familia, 'Sin familia'), c.cliente_pk
    """), {"empresa_id": empresa_id, "desde": anchor - timedelta(days=89), "ce": anchor}).mappings().all()
    per_sku = defaultdict(list)
    for row in price_rows:
        if _number(row["unidades"]) > 0:
            per_sku[row["sku"]].append(dict(row, precio=_number(row["ventas"]) / _number(row["unidades"])))
    for sku, price_data in per_sku.items():
        total_sales = sum(_number(row["ventas"]) for row in price_data)
        prices = [row["precio"] for row in price_data]
        if len(price_data) < 3 or total_sales < 2000:
            continue
        mean = sum(prices) / len(prices)
        cv = math.sqrt(sum((value - mean) ** 2 for value in prices) / len(prices)) / mean if mean else 0
        if cv > .25:
            median_price = _median(prices)
            impact = sum(_number(row["unidades"]) * max(0, median_price - row["precio"]) for row in price_data)
            signals.append(_signal("lucia", "dispersion_precio_sku", "sku", sku, anchor - timedelta(days=89), anchor, 4 if cv > .40 else 3, impact, .85, cv, .25,
                {"metodo": "dispersion de precio medio por cliente", "familia": price_data[0]["familia"], "clientes": len(price_data), "ventas_90d_eur": total_sales, "cv_precio": cv, "precio_mediano_eur": median_price, "impacto_clientes_bajo_mediana_eur": impact}))

    # Oportunidades: la misma estadística robusta, usando CUSUM superior y su propia naturaleza.
    acceleration = []
    for row in rows:
        previous, current = _number(row["previo"]), _number(row["actual"])
        change = current - previous
        if previous > 0 and change > max(1000, previous * .15):
            pct = change / previous * 100
            acceleration.append(_signal("lucia", "familia_en_aceleracion", "familia", row["entidad"], current_start, anchor, 3 if pct >= 30 else 2, change, confidence, current, previous,
                {"metodo": "crecimiento de familia en periodos equivalentes", "ventas_actuales_eur": current, "ventas_base_eur": previous, "variacion_eur": change, "variacion_pct": pct}, naturaleza="oportunidad"))
    acceleration_stats = _robust_temporal_tests(db, empresa_id, [signal["entidad_id"] for signal in acceleration], previous_start, previous_end, current_start, anchor)
    for signal in acceleration:
        stats = acceleration_stats[signal["entidad_id"]]
        signal["evidencia"]["validacion_estadistica"] = stats
        if stats.get("persistente_alza") and stats.get("p_value_alza", 1) <= FDR_ALPHA:
            signals.append(signal)

    customer_history = db.execute(text("""
        SELECT c.cliente_pk cliente, COALESCE(c.nombre, 'Cliente sin identificar') nombre, v.fecha_venta fecha, SUM(v.ingreso_total) ventas
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id JOIN clientes c ON c.id=v.cliente_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :desde AND :ce
        GROUP BY c.cliente_pk, COALESCE(c.nombre, 'Cliente sin identificar'), v.fecha_venta
        ORDER BY c.cliente_pk, v.fecha_venta
    """), {"empresa_id": empresa_id, "desde": anchor - timedelta(days=364), "ce": anchor}).mappings().all()
    per_customer = defaultdict(list)
    for row in customer_history:
        per_customer[row["cliente"]].append(row)
    for customer, history in per_customer.items():
        recent = [row for row in history if row["fecha"] >= anchor - timedelta(days=179)]
        annual_sales = sum(_number(row["ventas"]) for row in history)
        if len(recent) >= 4 and annual_sales > 1000:
            dates = [row["fecha"] for row in recent]
            intervals = [(right - left).days for left, right in zip(dates, dates[1:])]
            median_interval = _median(intervals)
            absence = (anchor - dates[-1]).days
            threshold = max(2 * median_interval, median_interval + 14)
            if median_interval > 0 and absence > threshold:
                average_monthly = annual_sales / 12
                impact = min(3, absence / 30) * average_monthly
                strategic_rule = resolve_rule(db, empresa_id, "cliente_estrategico", cliente=customer, default=False, on_date=anchor)
                strategic = truthy(strategic_rule)
                signals.append(_signal("lucia", "cliente_en_fuga", "cliente", customer, dates[-1], anchor,
                    5 if strategic else 4 if annual_sales >= 5000 else 3, impact, .9, absence, threshold,
                    {"metodo": "recencia frente a intervalo intercompra mediano", "cliente": history[0]["nombre"], "compras_180d": len(recent), "ventas_12m_eur": annual_sales, "intervalo_mediano_dias": median_interval, "dias_sin_compra": absence, "umbral_ausencia_dias": threshold, "venta_media_mensual_eur": average_monthly, "meses_ausencia": min(3, absence / 30),
                     "reglas_aplicadas": rule_evidence(cliente_estrategico=strategic_rule)}))
        return_start_index = next((index for index in range(1, len(history)) if (history[index]["fecha"] - history[index - 1]["fecha"]).days >= 180), None)
        if return_start_index is not None:
            before_return, after_return = history[:return_start_index], history[return_start_index:]
            recovered_sales = sum(_number(row["ventas"]) for row in after_return)
            if recovered_sales > 500:
                signals.append(_signal("lucia", "cliente_recuperado", "cliente", customer, after_return[0]["fecha"], anchor, 2, recovered_sales, .85, recovered_sales, 500,
                    {"metodo": "cliente que reaparece tras 180 dias", "cliente": history[0]["nombre"], "ultima_compra_previa": str(before_return[-1]["fecha"]), "primera_compra_retorno": str(after_return[0]["fecha"]), "venta_recuperada_eur": recovered_sales}, naturaleza="oportunidad"))

    concentration = db.execute(text("""
        WITH clientes AS (
          SELECT COALESCE(c.nombre, 'Cliente sin identificar') nombre, SUM(v.ingreso_total) ventas
          FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
          LEFT JOIN clientes c ON c.id=v.cliente_id
          WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :cs AND :ce GROUP BY COALESCE(c.nombre, 'Cliente sin identificar')
        ), total AS (SELECT SUM(ventas) ventas FROM clientes)
        SELECT COALESCE((SELECT SUM(ventas) FROM (SELECT ventas FROM clientes ORDER BY ventas DESC LIMIT 3) t),0) top3,
               COALESCE((SELECT ventas FROM total),0) total
    """), params).mappings().first()
    top3, total = _number(concentration["top3"]), _number(concentration["total"])
    if total and top3 / total >= .5:
        pct = top3 / total * 100
        signals.append(_signal("lucia", "concentracion_clientes", "empresa", str(empresa_id), current_start, anchor,
                               4 if pct >= 70 else 3, top3, confidence, pct, 50,
                               {"metodo": "participacion de los tres clientes con mayor facturacion", "ventas_top_3_eur": top3,
                                "ventas_periodo_eur": total, "participacion_pct": pct, "umbral_pct": 50,
                                "periodo": [str(current_start), str(anchor)]}))
    temporal_detectors = {"caida_facturacion_familia", "precio_volumen_familia", "caida_ventas_sku", "caida_ventas_comercial", "familia_en_aceleracion"}
    retained = []
    for signal in signals:
        family = signal["entidad_id"] if signal["entidad_tipo"] == "familia" else signal["evidencia"].get("familia")
        seasonal = resolve_rule(db, empresa_id, "familia_estacional", familia=family, default=None, on_date=anchor) if family else None
        months = seasonal.value if seasonal else None
        if signal["detector"] in temporal_detectors and isinstance(months, list) and anchor.month not in months:
            continue
        if seasonal and seasonal.rule_id:
            signal["evidencia"].setdefault("reglas_aplicadas", {}).update(rule_evidence(familia_estacional=seasonal))
        retained.append(signal)
    return retained


def _inventory_signals(db: Session, empresa_id: int) -> list[dict]:
    snapshot = db.execute(text("SELECT MAX(ih.fecha_inventario) FROM inventario_historico ih JOIN productos p ON p.id=ih.producto_id WHERE p.empresa_id=:empresa_id"), {"empresa_id": empresa_id}).scalar()
    if not snapshot:
        return []
    # El snapshot representa un riesgo vigente durante la última semana operativa.
    # Así puede compararse con ventanas de ventas sin convertirlo en una tendencia.
    snapshot_window_start = snapshot - timedelta(days=6)
    rows = db.execute(text("""
        SELECT p.sku, p.nombre, COALESCE(p.familia, 'Sin familia') familia, pm.abc,
          ih.unidades_inventario unidades, ih.inventario_eur valor, COALESCE(pm.dias_cobertura, 0) cobertura,
          p.lead_time_dias
        FROM inventario_historico ih JOIN productos p ON p.id=ih.producto_id
        LEFT JOIN producto_metricas pm ON pm.producto_id=p.id
        WHERE p.empresa_id=:empresa_id AND ih.fecha_inventario=:fecha
    """), {"empresa_id": empresa_id, "fecha": snapshot}).mappings().all()
    signals = []
    for row in rows:
        value, coverage, units = _number(row["valor"]), _number(row["cobertura"]), _number(row["unidades"])
        lead_rule = resolve_rule(db, empresa_id, "lead_time_dias", sku=row["sku"], familia=row["familia"], default=max(7, int(row["lead_time_dias"] or 7)), on_date=snapshot)
        lead = max(1, int(_number(lead_rule.value, 7)))
        discontinued_rule = resolve_rule(db, empresa_id, "sku_discontinuado", sku=row["sku"], familia=row["familia"], default=False, on_date=snapshot)
        discontinued = truthy(discontinued_rule)
        base = {"fecha_snapshot": str(snapshot), "sku": row["sku"], "articulo": row["nombre"], "familia": row["familia"],
                "clase_abc": row["abc"], "unidades_inventario": units, "valor_inventario_eur": value, "cobertura_dias": coverage, "lead_time_dias": lead,
                "reglas_aplicadas": rule_evidence(lead_time_dias=lead_rule, sku_discontinuado=discontinued_rule)}
        if not discontinued and row["abc"] == "A" and units == 0:
            signals.append(_signal("maria", "rotura_stock_clase_a", "sku", row["sku"], snapshot_window_start, snapshot, 5, max(value, 1), .9, units, 1, dict(base, metodo="nivel de stock actual de SKU clase A")))
        elif not discontinued and row["abc"] == "A" and coverage > 0 and coverage <= lead:
            signals.append(_signal("maria", "cobertura_vs_lead_time", "sku", row["sku"], snapshot_window_start, snapshot, 4, max(value, 1), .85, coverage, lead, dict(base, metodo="cobertura calculada frente a lead time configurado")))
        elif not discontinued and row["abc"] == "B" and coverage > 0 and coverage <= lead:
            signals.append(_signal("maria", "cobertura_clase_b", "sku", row["sku"], snapshot_window_start, snapshot, 3, max(value, 1), .80, coverage, lead, dict(base, metodo="cobertura calculada frente a lead time configurado para clase B")))
        if not discontinued and coverage > 180 and value > 1000:
            signals.append(_signal("maria", "exceso_cobertura", "sku", row["sku"], snapshot_window_start, snapshot, 3, value, .8, coverage, 180, dict(base, metodo="cobertura superior a 180 dias y valor inmovilizado superior a 1.000 EUR")))
        if units == 0:
            without_sales = db.execute(text("SELECT NOT EXISTS (SELECT 1 FROM ventas_historicas v JOIN productos p2 ON p2.id=v.producto_id WHERE p2.empresa_id=:empresa_id AND p2.sku=:sku AND v.fecha_venta >= :desde)"), {"empresa_id": empresa_id, "sku": row["sku"], "desde": snapshot - timedelta(days=180)}).scalar()
            if without_sales:
                signals.append(_signal("maria", "sku_sin_stock_sin_ventas", "sku", row["sku"], snapshot - timedelta(days=180), snapshot, 2, 0, .9, 0, 1, dict(base, metodo="sin stock y sin ventas en 180 dias; candidato a saneamiento de catálogo")))
    # Stock muerto frente a ventas de 90 días: el valor es del último snapshot.
    dead = db.execute(text("""
        SELECT p.sku, p.nombre, COALESCE(p.familia,'Sin familia') familia, ih.inventario_eur valor
        FROM inventario_historico ih JOIN productos p ON p.id=ih.producto_id
        WHERE p.empresa_id=:empresa_id AND ih.fecha_inventario=:fecha AND ih.inventario_eur > 1000
          AND NOT EXISTS (SELECT 1 FROM ventas_historicas v WHERE v.producto_id=p.id AND v.fecha_venta >= :desde)
    """), {"empresa_id": empresa_id, "fecha": snapshot, "desde": snapshot - timedelta(days=90)}).mappings().all()
    for row in dead:
        value = _number(row["valor"])
        signals.append(_signal("maria", "stock_muerto_90d", "sku", row["sku"], snapshot - timedelta(days=90), snapshot, 4, value, .9, 0, 1,
                               {"metodo": "sin ventas en los 90 dias previos con valor de inventario superior a 1.000 EUR", "fecha_snapshot": str(snapshot), "sku": row["sku"], "articulo": row["nombre"], "familia": row["familia"], "valor_inventario_eur": value}))
    decline_window = _sales_window(db, empresa_id)
    if decline_window:
        ps, pe, cs, ce, _ = decline_window
        declining = db.execute(text("""
            SELECT COALESCE(p.familia,'Sin familia') familia,
              SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) previo,
              SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) actual
            FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
            GROUP BY COALESCE(p.familia,'Sin familia')
        """), {"empresa_id": empresa_id, "ps": ps, "pe": pe, "cs": cs, "ce": ce}).mappings().all()
        falling_families = {row["familia"]: (_number(row["actual"]) - _number(row["previo"])) / _number(row["previo"]) * 100 for row in declining if _number(row["previo"]) > 0 and _number(row["actual"]) < _number(row["previo"]) * .85}
        for row in rows:
            if _number(row["cobertura"]) > 90 and _number(row["valor"]) > 1000 and row["familia"] in falling_families:
                signals.append(_signal("maria", "stock_sobre_familia_en_declive", "sku", row["sku"], snapshot_window_start, snapshot, 4, _number(row["valor"]), .85, _number(row["cobertura"]), 90,
                    {"metodo": "stock sobre familia con caída de ventas", "familia": row["familia"], "cobertura_dias": _number(row["cobertura"]), "valor_inventario_eur": _number(row["valor"]), "variacion_familia_pct": falling_families[row["familia"]]}))
    return signals


def _finance_signals(db: Session, empresa_id: int) -> list[dict]:
    window = _sales_window(db, empresa_id)
    if not window:
        return []
    ps, pe, cs, ce, days = window
    rows = db.execute(text("""
        SELECT COALESCE(p.familia,'Sin familia') entidad,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_previas,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actuales,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.margen_destino_eur ELSE 0 END) mgd_previo,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END) mgd_actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce GROUP BY COALESCE(p.familia,'Sin familia')
    """), {"empresa_id": empresa_id, "ps": ps, "pe": pe, "cs": cs, "ce": ce}).mappings().all()
    signals = []
    confidence = min(1.0, days / 30)
    decomposition_rows = db.execute(text("""
        SELECT COALESCE(p.familia,'Sin familia') familia, p.sku,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) ventas_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) ventas_actuales,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.cantidad_vendida ELSE 0 END) unidades_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.cantidad_vendida ELSE 0 END) unidades_actuales,
          SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.margen_destino_eur ELSE 0 END) mgd_base,
          SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END) mgd_actual
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce GROUP BY COALESCE(p.familia,'Sin familia'), p.sku
    """), {"empresa_id": empresa_id, "ps": ps, "pe": pe, "cs": cs, "ce": ce}).mappings().all()
    decompositions = defaultdict(lambda: {"precio": 0.0, "coste": 0.0, "delta_mgd": 0.0})
    for item in decomposition_rows:
        ub, ua = _number(item["unidades_base"]), _number(item["unidades_actuales"])
        vb, va = _number(item["ventas_base"]), _number(item["ventas_actuales"])
        mb, ma = _number(item["mgd_base"]), _number(item["mgd_actual"])
        if not ua:
            continue
        price_base, price_actual = (vb / ub if ub else 0), va / ua
        # El coste efectivo se infiere de venta menos MGD de cada período; no se usa coste de catálogo actual.
        cost_base = (vb - mb) / ub if ub else 0
        cost_actual = (va - ma) / ua
        bucket = decompositions[item["familia"]]
        bucket["precio"] += (price_actual - price_base) * ua
        bucket["coste"] += (cost_base - cost_actual) * ua
        bucket["delta_mgd"] += ma - mb
    for row in rows:
        vp, va, mp, ma = map(_number, (row["ventas_previas"], row["ventas_actuales"], row["mgd_previo"], row["mgd_actual"]))
        if vp <= 0 or va <= 0:
            continue
        pp, pa = mp / vp * 100, ma / va * 100
        if pa <= pp - 2 and ma < mp:
            decomposition = decompositions[row["entidad"]]
            decomposition["mix"] = decomposition["delta_mgd"] - decomposition["precio"] - decomposition["coste"]
            signals.append(_signal("mattia", "erosion_mgd_familia", "familia", row["entidad"], cs, ce,
                                   4 if pp - pa >= 5 else 3, mp - ma, confidence, pa, pp,
                                   {"metodo": "ratio MGD ponderado por ventas en periodos equivalentes", "periodo_actual": [str(cs), str(ce)], "periodo_base": [str(ps), str(pe)], "ventas_actuales_eur": va, "ventas_base_eur": vp, "mgd_actual_eur": ma, "mgd_base_eur": mp, "mgd_actual_pct": pa, "mgd_base_pct": pp, "variacion_pp": pa - pp,
                                    "descomposicion_mgd": {"efecto_precio_eur": decomposition["precio"], "efecto_coste_eur": decomposition["coste"], "efecto_mix_residual_eur": decomposition["mix"], "delta_mgd_eur": decomposition["delta_mgd"], "nota": "El efecto mix es el residuo no explicado directamente por precio ni coste."}}))
    temporal = _robust_temporal_tests(db, empresa_id, [signal["entidad_id"] for signal in signals], ps, pe, cs, ce, metric="mgd")
    accepted = _benjamini_hochberg([temporal[signal["entidad_id"]]["p_value"] for signal in signals])
    filtered = []
    for index, signal in enumerate(signals):
        stats = temporal[signal["entidad_id"]]
        stats["fdr_bh_alpha"] = FDR_ALPHA
        stats["fdr_aprobado"] = index in accepted
        signal["evidencia"]["validacion_estadistica"] = stats
        if stats["fdr_aprobado"] and stats.get("persistente"):
            filtered.append(signal)
    # Erosión por cliente y comercial, con bases suficientes y la misma relación MGD ponderada.
    for entity_sql, entity_type, detector in (("c.cliente_pk", "cliente", "erosion_mgd_cliente"), ("COALESCE(NULLIF(v.comercial_factura,''), 'Sin comercial')", "comercial", "erosion_mgd_comercial")):
        joins = "LEFT JOIN clientes c ON c.id=v.cliente_id" if entity_type == "cliente" else "LEFT JOIN clientes c ON c.id=v.cliente_id"
        scoped = db.execute(text(f"""
            SELECT {entity_sql} entidad,
              SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.ingreso_total ELSE 0 END) vp,
              SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.ingreso_total ELSE 0 END) va,
              SUM(CASE WHEN v.fecha_venta BETWEEN :ps AND :pe THEN v.margen_destino_eur ELSE 0 END) mp,
              SUM(CASE WHEN v.fecha_venta BETWEEN :cs AND :ce THEN v.margen_destino_eur ELSE 0 END) ma
            FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id {joins}
            WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce GROUP BY {entity_sql}
        """), {"empresa_id": empresa_id, "ps": ps, "pe": pe, "cs": cs, "ce": ce}).mappings().all()
        for item in scoped:
            vp, va, mp, ma = map(_number, (item["vp"], item["va"], item["mp"], item["ma"]))
            if vp < 3000 or va < 3000 or vp <= 0 or va <= 0:
                continue
            pp, pa = mp / vp * 100, ma / va * 100
            if pa <= pp - 2 and ma < mp:
                strategic_rule = resolve_rule(db, empresa_id, "cliente_estrategico", cliente=item["entidad"], default=False, on_date=ce) if entity_type == "cliente" else None
                strategic = bool(strategic_rule and truthy(strategic_rule))
                base_severity = 4 if pp - pa >= 5 else 3
                signals.append(_signal("mattia", detector, entity_type, item["entidad"], cs, ce, min(5, base_severity + int(strategic)), mp - ma, confidence, pa, pp,
                    {"metodo": "erosion MGD ponderada por entidad", "ventas_base_eur": vp, "ventas_actuales_eur": va, "mgd_base_pct": pp, "mgd_actual_pct": pa, "variacion_pp": pa - pp,
                     "reglas_aplicadas": rule_evidence(cliente_estrategico=strategic_rule) if strategic_rule else {}}))

    below_cost = db.execute(text("""
        SELECT p.sku, COALESCE(p.familia,'Sin familia') familia, SUM(v.ingreso_total) ventas, SUM(v.margen_destino_eur) mgd
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :cs AND :ce GROUP BY p.sku, COALESCE(p.familia,'Sin familia')
        HAVING SUM(v.ingreso_total) >= 250 AND SUM(v.margen_destino_eur) < 0
    """), {"empresa_id": empresa_id, "cs": cs, "ce": ce}).mappings().all()
    for item in below_cost:
        loss = abs(_number(item["mgd"]))
        signals.append(_signal("mattia", "venta_bajo_coste", "sku", item["sku"], cs, ce, 5 if loss > 1000 else 4, loss, .95, _number(item["mgd"]), 0,
            {"metodo": "MGD negativo agregado por SKU", "familia": item["familia"], "ventas_periodo_eur": _number(item["ventas"]), "mgd_negativo_eur": _number(item["mgd"])}))

    for row in rows:
        sales, mgd = _number(row["ventas_actuales"]), _number(row["mgd_actual"])
        target = resolve_rule(db, empresa_id, "margen_objetivo_pct", familia=row["entidad"], default=None, on_date=ce)
        if target.value is None or sales <= 0:
            continue
        actual_pct = mgd / sales * 100
        gap = _number(target.value) - actual_pct
        if gap >= 3:
            signals.append(_signal("mattia", "margen_bajo_objetivo", "familia", row["entidad"], cs, ce, 4 if gap >= 6 else 3, gap * sales / 100, confidence, actual_pct, _number(target.value),
                {"metodo": "MGD frente a objetivo configurado", "ventas_actuales_eur": sales, "mgd_actual_pct": actual_pct, "margen_objetivo_pct": _number(target.value), "brecha_pp": gap, "reglas_aplicadas": rule_evidence(margen_objetivo_pct=target)}))

    concentration = db.execute(text("""
        WITH sku AS (SELECT p.sku, SUM(v.margen_destino_eur) mgd FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :cs AND :ce GROUP BY p.sku),
        total AS (SELECT SUM(mgd) valor FROM sku WHERE mgd > 0) SELECT COALESCE((SELECT SUM(mgd) FROM (SELECT mgd FROM sku WHERE mgd > 0 ORDER BY mgd DESC LIMIT 10) top),0) top10, COALESCE((SELECT valor FROM total),0) total
    """), {"empresa_id": empresa_id, "cs": cs, "ce": ce}).mappings().first()
    top10, total_mgd = _number(concentration["top10"]), _number(concentration["total"])
    if total_mgd > 0 and top10 / total_mgd > .60:
        share = top10 / total_mgd * 100
        filtered.append(_signal("mattia", "concentracion_margen", "empresa", str(empresa_id), cs, ce, 4 if share >= 75 else 3, top10, confidence, share, 60,
            {"metodo": "concentracion de MGD en Top 10 SKU", "mgd_top10_eur": top10, "mgd_total_eur": total_mgd, "participacion_pct": share}))
    return filtered + [signal for signal in signals if signal["detector"] != "erosion_mgd_familia"]


def collect_detected_signals(db: Session, empresa_id: int) -> list[dict]:
    return _sales_signals(db, empresa_id) + _inventory_signals(db, empresa_id) + _finance_signals(db, empresa_id)


def refresh_agent_signals(db: Session, empresa_id: int) -> list[AgentSignal]:
    detected = collect_detected_signals(db, empresa_id)
    now = datetime.utcnow()
    detector_names = set(IMPACTO_TIPO_POR_DETECTOR)
    existing = {item.fingerprint: item for item in db.query(AgentSignal).filter(AgentSignal.empresa_id == empresa_id).all()}
    start_of_day = datetime.combine(now.date(), datetime.min.time())
    new_counts = defaultdict(int)
    for row in existing.values():
        if row.estado in ACTIVE_STATES and row.primera_deteccion and row.primera_deteccion >= start_of_day:
            new_counts[(row.agente, row.naturaleza or "riesgo")] += 1
    # El p-valor filtra la entrada; impacto EUR, confianza y severidad eligen las cinco nuevas.
    detected.sort(key=lambda item: item["impacto_ponderado_eur"] * item["confianza"] * (1 + .15 * (item["severidad"] - 1)), reverse=True)
    accepted_detected = []
    for data in detected:
        nature = data.get("naturaleza", "riesgo")
        limit = MAX_NEW_OPPORTUNITIES_PER_AGENT_PER_DAY if nature == "oportunidad" else MAX_NEW_SIGNALS_PER_AGENT_PER_DAY
        if data["fingerprint"] in existing or new_counts[(data["agente"], nature)] < limit:
            accepted_detected.append(data)
            if data["fingerprint"] not in existing:
                new_counts[(data["agente"], nature)] += 1
    fingerprints = {item["fingerprint"] for item in accepted_detected}
    for data in accepted_detected:
        row = existing.get(data["fingerprint"])
        if row:
            for field in ("severidad", "impacto_eur", "impacto_tipo", "impacto_ponderado_eur", "naturaleza", "confianza", "valor_actual", "valor_esperado", "desviacion"):
                setattr(row, field, data[field])
            row.evidencia = json.dumps(data["evidencia"], ensure_ascii=False, default=str)
            row.ultima_deteccion = now
            if row.estado == "descartada" and not is_signal_suppressed(db, row, now):
                row.estado = "nueva"
                row.evidencia = json.dumps(dict(data["evidencia"], reincidencia=True), ensure_ascii=False, default=str)
            elif row.estado != "descartada":
                row.estado = "persistente"
        else:
            db.add(AgentSignal(
                empresa_id=empresa_id,
                **{key: value for key, value in data.items() if key != "evidencia"},
                evidencia=json.dumps(data["evidencia"], ensure_ascii=False, default=str),
                estado="nueva",
                primera_deteccion=now,
                ultima_deteccion=now,
            ))
    for row in existing.values():
        if row.detector in detector_names and row.fingerprint not in fingerprints and row.estado in ACTIVE_STATES:
            row.estado = "resuelta"
    db.flush()
    return get_active_signals(db, empresa_id, limit=100)


def get_active_signals(db: Session, empresa_id: int, agent: str | None = None, limit: int = 7) -> list[AgentSignal]:
    query = db.query(AgentSignal).filter(AgentSignal.empresa_id == empresa_id, AgentSignal.estado.in_(ACTIVE_STATES))
    if agent and agent != "ceo":
        query = query.filter(AgentSignal.agente == agent)
    rows = query.all()
    def priority(row):
        age = max(0, (datetime.utcnow() - (row.primera_deteccion or datetime.utcnow())).days)
        return _number(row.impacto_ponderado_eur) * _number(row.confianza) * (1 + .15 * (int(row.severidad or 1) - 1)) * (1 + min(age, 30) / 100)
    return sorted(rows, key=priority, reverse=True)[:limit]


def _signal_evidence(signal: AgentSignal) -> dict:
    return {"id": signal.id, "agente": signal.agente, "detector": signal.detector, "entidad": {"tipo": signal.entidad_tipo, "id": signal.entidad_id}, "periodo": [str(signal.periodo_inicio), str(signal.periodo_fin)], "severidad": signal.severidad, "impacto_eur": _number(signal.impacto_eur), "impacto_tipo": signal.impacto_tipo, "impacto_ponderado_eur": _number(signal.impacto_ponderado_eur), "naturaleza": signal.naturaleza or "riesgo", "confianza": _number(signal.confianza), "valor_actual": _number(signal.valor_actual), "valor_esperado": _number(signal.valor_esperado), "desviacion": _number(signal.desviacion), "estado": signal.estado, "primera_deteccion": str(signal.primera_deteccion), "evidencia": json.loads(signal.evidencia or "{}")}


def build_evidence_bundle(db: Session, empresa_id: int, agent: str, limit: int = 7, signal_id: int | None = None) -> dict:
    signals = get_active_signals(db, empresa_id, agent, limit)
    selected_signal = None
    if signal_id:
        selected_signal = db.query(AgentSignal).filter(
            AgentSignal.id == signal_id,
            AgentSignal.empresa_id == empresa_id,
            AgentSignal.agente == agent,
        ).first()
        if selected_signal:
            signals = [selected_signal, *[signal for signal in signals if signal.id != selected_signal.id]]
    payload = []
    for signal in signals:
        payload.append(_signal_evidence(signal))
    return {"fuente": "agent_signals", "agente": agent, "regla": "Las cifras y los hallazgos son deterministas; no se permiten calculos nuevos.", "senales": payload,
            "senal_contextual": _signal_evidence(selected_signal) if selected_signal else None,
            "limitaciones": ["El histórico de inventario comienza el 2026-08-06: no se infieren tendencias ni XYZ fiables hasta acumular más observaciones."]}
