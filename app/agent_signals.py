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

from .models import AgentSignal


ACTIVE_STATES = ("nueva", "persistente")
MAX_NEW_SIGNALS_PER_AGENT_PER_DAY = 5
FDR_ALPHA = 0.10


def _number(value, default=0.0):
    return float(value or default)


def _fingerprint(signal: dict) -> str:
    raw = "|".join(str(signal.get(field) or "") for field in (
        "agente", "detector", "entidad_tipo", "entidad_id"
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _signal(agent, detector, entity_type, entity_id, start, end, severity, impact, confidence, current, expected, evidence):
    signal = {
        "agente": agent, "detector": detector, "entidad_tipo": entity_type,
        "entidad_id": str(entity_id), "periodo_inicio": start, "periodo_fin": end,
        "severidad": severity, "impacto_eur": max(0.0, _number(impact)),
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


def _robust_temporal_tests(db: Session, empresa_id: int, entities: list[str], ps: date, pe: date, cs: date, ce: date, metric: str = "ventas") -> dict[str, dict]:
    """Mediana+MAD y CUSUM sobre la métrica diaria correcta."""
    if not entities:
        return {}
    rows = db.execute(text("""
        SELECT COALESCE(p.familia, 'Sin familia') entidad, v.fecha_venta fecha,
          SUM(CASE WHEN :metric = 'mgd' THEN v.margen_destino_eur ELSE v.ingreso_total END) valor
        FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
        WHERE p.empresa_id=:empresa_id AND v.fecha_venta BETWEEN :ps AND :ce
        GROUP BY COALESCE(p.familia, 'Sin familia'), v.fecha_venta
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
        # CUSUM inferior: acumula desviaciones moderadas y evita alertar por un solo día.
        cusum = 0.0
        lower_limit = 0.5 * scale
        for value in current:
            cusum = min(0.0, cusum + (value - median + lower_limit))
        streak = 0
        for value in reversed(current):
            if value < median - lower_limit:
                streak += 1
            else:
                break
        result[entity] = {
            "metrica": metric, "p_value": _normal_lower_tail(z), "apto": True, "baseline_mediana_eur_dia": median,
            "mad_eur_dia": mad, "mediana_actual_eur_dia": current_median, "z_robusto": z,
            "cusum_inferior": cusum, "dias_consecutivos_bajos": streak,
            "persistente": streak >= 3 or abs(cusum) >= 5 * scale,
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
        if change >= -max(250, previous * .08):
            continue
        pct = change / previous * 100
        severity = 5 if pct <= -30 else 4 if pct <= -15 else 3
        evidence = {"metodo": "periodos equivalentes", "periodo_actual": [str(current_start), str(anchor)],
                    "periodo_base": [str(previous_start), str(previous_end)], "ventas_actuales_eur": current,
                    "ventas_base_eur": previous, "variacion_eur": change, "variacion_pct": pct,
                    "unidades_actuales": _number(row["unidades_actuales"]), "unidades_base": _number(row["unidades_previas"])}
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
    return signals


def _inventory_signals(db: Session, empresa_id: int) -> list[dict]:
    snapshot = db.execute(text("SELECT MAX(ih.fecha_inventario) FROM inventario_historico ih JOIN productos p ON p.id=ih.producto_id WHERE p.empresa_id=:empresa_id"), {"empresa_id": empresa_id}).scalar()
    if not snapshot:
        return []
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
        lead = max(7, int(row["lead_time_dias"] or 7))
        base = {"fecha_snapshot": str(snapshot), "sku": row["sku"], "articulo": row["nombre"], "familia": row["familia"],
                "clase_abc": row["abc"], "unidades_inventario": units, "valor_inventario_eur": value, "cobertura_dias": coverage, "lead_time_dias": lead}
        if row["abc"] == "A" and units == 0:
            signals.append(_signal("maria", "rotura_stock_clase_a", "sku", row["sku"], snapshot, snapshot, 5, max(value, 1), .9, units, 1, dict(base, metodo="nivel de stock actual de SKU clase A")))
        elif row["abc"] == "A" and coverage > 0 and coverage <= lead:
            signals.append(_signal("maria", "cobertura_vs_lead_time", "sku", row["sku"], snapshot, snapshot, 4, max(value, 1), .85, coverage, lead, dict(base, metodo="cobertura calculada frente a lead time configurado")))
        if coverage > 180 and value > 1000:
            signals.append(_signal("maria", "exceso_cobertura", "sku", row["sku"], snapshot, snapshot, 3, value, .8, coverage, 180, dict(base, metodo="cobertura superior a 180 dias y valor inmovilizado superior a 1.000 EUR")))
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
    for row in rows:
        vp, va, mp, ma = map(_number, (row["ventas_previas"], row["ventas_actuales"], row["mgd_previo"], row["mgd_actual"]))
        if vp <= 0 or va <= 0:
            continue
        pp, pa = mp / vp * 100, ma / va * 100
        if pa <= pp - 2 and ma < mp:
            signals.append(_signal("mattia", "erosion_mgd_familia", "familia", row["entidad"], cs, ce,
                                   4 if pp - pa >= 5 else 3, mp - ma, confidence, pa, pp,
                                   {"metodo": "ratio MGD ponderado por ventas en periodos equivalentes", "periodo_actual": [str(cs), str(ce)], "periodo_base": [str(ps), str(pe)], "ventas_actuales_eur": va, "ventas_base_eur": vp, "mgd_actual_eur": ma, "mgd_base_eur": mp, "mgd_actual_pct": pa, "mgd_base_pct": pp, "variacion_pp": pa - pp}))
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
    return filtered


def collect_detected_signals(db: Session, empresa_id: int) -> list[dict]:
    return _sales_signals(db, empresa_id) + _inventory_signals(db, empresa_id) + _finance_signals(db, empresa_id)


def refresh_agent_signals(db: Session, empresa_id: int) -> list[AgentSignal]:
    detected = collect_detected_signals(db, empresa_id)
    now = datetime.utcnow()
    detector_names = {item["detector"] for item in detected} | {"caida_facturacion_familia", "precio_volumen_familia", "concentracion_clientes", "rotura_stock_clase_a", "cobertura_vs_lead_time", "exceso_cobertura", "stock_muerto_90d", "erosion_mgd_familia"}
    existing = {item.fingerprint: item for item in db.query(AgentSignal).filter(AgentSignal.empresa_id == empresa_id).all()}
    start_of_day = datetime.combine(now.date(), datetime.min.time())
    new_counts = defaultdict(int)
    for row in existing.values():
        if row.estado in ACTIVE_STATES and row.primera_deteccion and row.primera_deteccion >= start_of_day:
            new_counts[row.agente] += 1
    # El p-valor filtra la entrada; impacto EUR, confianza y severidad eligen las cinco nuevas.
    detected.sort(key=lambda item: item["impacto_eur"] * item["confianza"] * (1 + .15 * (item["severidad"] - 1)), reverse=True)
    accepted_detected = []
    for data in detected:
        if data["fingerprint"] in existing or new_counts[data["agente"]] < MAX_NEW_SIGNALS_PER_AGENT_PER_DAY:
            accepted_detected.append(data)
            if data["fingerprint"] not in existing:
                new_counts[data["agente"]] += 1
    fingerprints = {item["fingerprint"] for item in accepted_detected}
    for data in accepted_detected:
        row = existing.get(data["fingerprint"])
        if row:
            for field in ("severidad", "impacto_eur", "confianza", "valor_actual", "valor_esperado", "desviacion"):
                setattr(row, field, data[field])
            row.evidencia = json.dumps(data["evidencia"], ensure_ascii=False, default=str)
            row.ultima_deteccion = now
            if row.estado != "descartada":
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
        return _number(row.impacto_eur) * _number(row.confianza) * (1 + .15 * (int(row.severidad or 1) - 1)) * (1 + min(age, 30) / 100)
    return sorted(rows, key=priority, reverse=True)[:limit]


def build_evidence_bundle(db: Session, empresa_id: int, agent: str, limit: int = 7) -> dict:
    signals = get_active_signals(db, empresa_id, agent, limit)
    payload = []
    for signal in signals:
        payload.append({"id": signal.id, "agente": signal.agente, "detector": signal.detector, "entidad": {"tipo": signal.entidad_tipo, "id": signal.entidad_id}, "periodo": [str(signal.periodo_inicio), str(signal.periodo_fin)], "severidad": signal.severidad, "impacto_eur": _number(signal.impacto_eur), "confianza": _number(signal.confianza), "valor_actual": _number(signal.valor_actual), "valor_esperado": _number(signal.valor_esperado), "desviacion": _number(signal.desviacion), "estado": signal.estado, "primera_deteccion": str(signal.primera_deteccion), "evidencia": json.loads(signal.evidencia or "{}")})
    return {"fuente": "agent_signals", "agente": agent, "regla": "Las cifras y los hallazgos son deterministas; no se permiten calculos nuevos.", "senales": payload,
            "limitaciones": ["El histórico de inventario comienza el 2026-08-06: no se infieren tendencias ni XYZ fiables hasta acumular más observaciones."]}
