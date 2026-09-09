"""Correlación determinista de señales y agrupación en episodios de negocio."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from .agent_signals import ACTIVE_STATES, _number
from .models import AgentEpisode, AgentSignal, AgentSignalLink, Producto


MIN_OVERLAP_DAYS = 7
RELATION_PRIORITY = {"explica": 0, "agrava": 1, "duplica": 2, "contradice": 3}


def overlap_days(left: AgentSignal, right: AgentSignal) -> int:
    """Devuelve el solape inclusivo entre dos ventanas de evidencia."""
    if not left.periodo_inicio or not left.periodo_fin or not right.periodo_inicio or not right.periodo_fin:
        return 0
    start = max(left.periodo_inicio, right.periodo_inicio)
    end = min(left.periodo_fin, right.periodo_fin)
    return max(0, (end - start).days + 1)


def _signal_details(origin: AgentSignal, destination: AgentSignal, rule: str, days: int, family: str | None = None) -> str:
    return json.dumps({
        "regla": rule,
        "origen": {"id": origin.id, "detector": origin.detector, "entidad": origin.entidad_id, "periodo": [str(origin.periodo_inicio), str(origin.periodo_fin)]},
        "destino": {"id": destination.id, "detector": destination.detector, "entidad": destination.entidad_id, "periodo": [str(destination.periodo_inicio), str(destination.periodo_fin)]},
        "familia": family,
        "solape_dias": days,
        "impacto_origen_eur": _number(origin.impacto_eur),
        "impacto_destino_eur": _number(destination.impacto_eur),
    }, ensure_ascii=False)


def _sku_family_map(db: Session, empresa_id: int, signals: list[AgentSignal]) -> dict[str, str]:
    skus = {signal.entidad_id for signal in signals if signal.entidad_tipo == "sku" and signal.entidad_id}
    if not skus:
        return {}
    rows = db.query(Producto.sku, Producto.familia).filter(
        Producto.empresa_id == empresa_id,
        Producto.sku.in_(skus),
    ).all()
    return {str(sku): family or "Sin familia" for sku, family in rows}


def _upsert_link(
    db: Session,
    empresa_id: int,
    origin: AgentSignal,
    destination: AgentSignal,
    relation: str,
    rule: str,
    days: int,
    family: str | None = None,
) -> AgentSignalLink:
    row = db.query(AgentSignalLink).filter(
        AgentSignalLink.empresa_id == empresa_id,
        AgentSignalLink.signal_origen_id == origin.id,
        AgentSignalLink.signal_destino_id == destination.id,
        AgentSignalLink.regla == rule,
    ).first()
    if row is None:
        row = AgentSignalLink(
            empresa_id=empresa_id,
            signal_origen_id=origin.id,
            signal_destino_id=destination.id,
            tipo_relacion=relation,
            regla=rule,
            solape_dias=days,
            detalle=_signal_details(origin, destination, rule, days, family),
        )
        db.add(row)
    else:
        row.tipo_relacion = relation
        row.solape_dias = days
        row.detalle = _signal_details(origin, destination, rule, days, family)
    return row


def refresh_signal_links(db: Session, empresa_id: int) -> list[AgentSignalLink]:
    """Aplica solo reglas declaradas sobre señales activas de una empresa."""
    signals = db.query(AgentSignal).filter(
        AgentSignal.empresa_id == empresa_id,
        AgentSignal.estado.in_(ACTIVE_STATES),
    ).all()
    sku_family = _sku_family_map(db, empresa_id, signals)
    by_detector: dict[str, list[AgentSignal]] = defaultdict(list)
    for signal in signals:
        by_detector[signal.detector].append(signal)

    links: list[AgentSignalLink] = []
    family_drops = by_detector["caida_facturacion_familia"]
    for drop in family_drops:
        family = drop.entidad_id
        for detector, rule in (
            ("rotura_stock_clase_a", "R1_rotura_explica_caida"),
            ("cobertura_vs_lead_time", "R2_cobertura_explica_caida"),
        ):
            for inventory_signal in by_detector[detector]:
                days = overlap_days(inventory_signal, drop)
                if days >= MIN_OVERLAP_DAYS and sku_family.get(inventory_signal.entidad_id) == family:
                    links.append(_upsert_link(db, empresa_id, inventory_signal, drop, "explica", rule, days, family))

        for price_volume in by_detector["precio_volumen_familia"]:
            days = overlap_days(price_volume, drop)
            same_window = (
                price_volume.entidad_id == family
                and price_volume.periodo_inicio == drop.periodo_inicio
                and price_volume.periodo_fin == drop.periodo_fin
            )
            if same_window and days >= MIN_OVERLAP_DAYS:
                links.append(_upsert_link(db, empresa_id, price_volume, drop, "duplica", "R3_faceta_precio_volumen", days, family))

        for erosion in by_detector["erosion_mgd_familia"]:
            days = overlap_days(erosion, drop)
            if erosion.entidad_id == family and days >= MIN_OVERLAP_DAYS:
                links.append(_upsert_link(db, empresa_id, erosion, drop, "agrava", "R4_erosion_agrava_caida", days, family))

        for excess in by_detector["exceso_cobertura"]:
            days = overlap_days(excess, drop)
            if days >= MIN_OVERLAP_DAYS and sku_family.get(excess.entidad_id) == family:
                links.append(_upsert_link(db, empresa_id, excess, drop, "agrava", "R5_exceso_sobre_familia_en_caida", days, family))

    for dead_stock in by_detector["stock_muerto_90d"]:
        for excess in by_detector["exceso_cobertura"]:
            days = overlap_days(dead_stock, excess)
            if dead_stock.entidad_id == excess.entidad_id and days >= MIN_OVERLAP_DAYS:
                links.append(_upsert_link(db, empresa_id, dead_stock, excess, "duplica", "R6_stock_muerto_faceta", days))

    db.flush()
    return links


def _components(signals: list[AgentSignal], links: list[AgentSignalLink]) -> list[list[int]]:
    parent = {signal.id: signal.id for signal in signals}

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    for link in links:
        if link.signal_origen_id in parent and link.signal_destino_id in parent:
            union(link.signal_origen_id, link.signal_destino_id)
    grouped: dict[int, list[int]] = defaultdict(list)
    for signal_id in parent:
        grouped[find(signal_id)].append(signal_id)
    return list(grouped.values())


def _duplicate_representatives(component: list[AgentSignal], links: list[AgentSignalLink]) -> list[AgentSignal]:
    """Elige una única faceta por grupo de enlaces `duplica`."""
    ids = {signal.id for signal in component}
    parent = {signal.id: signal.id for signal in component}

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for link in links:
        if link.tipo_relacion != "duplica" or link.signal_origen_id not in ids or link.signal_destino_id not in ids:
            continue
        left_root, right_root = find(link.signal_origen_id), find(link.signal_destino_id)
        if left_root != right_root:
            parent[right_root] = left_root

    groups: dict[int, list[AgentSignal]] = defaultdict(list)
    for signal in component:
        groups[find(signal.id)].append(signal)
    return [max(group, key=lambda signal: _number(signal.impacto_ponderado_eur)) for group in groups.values()]


def _episode_fingerprint(component: list[AgentSignal]) -> str:
    source = "|".join(sorted(signal.fingerprint for signal in component))
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _episode_title(anchor: AgentSignal, links: list[AgentSignalLink]) -> str:
    relevant = [link for link in links if link.signal_origen_id == anchor.id or link.signal_destino_id == anchor.id]
    dominant = min(relevant, key=lambda link: RELATION_PRIORITY.get(link.tipo_relacion, 99), default=None)
    entity = anchor.entidad_id or "la entidad analizada"
    if dominant and dominant.regla == "R1_rotura_explica_caida":
        return f"Rotura de stock relacionada con caída de ventas en {entity}"
    if dominant and dominant.regla == "R2_cobertura_explica_caida":
        return f"Cobertura crítica relacionada con caída de ventas en {entity}"
    if anchor.detector == "caida_facturacion_familia":
        return f"Caída de facturación en {entity}"
    if anchor.detector == "erosion_mgd_familia":
        return f"Erosión de MGD en {entity}"
    if anchor.entidad_tipo == "sku":
        return f"Riesgo de inventario en SKU {entity}"
    return f"Incidente analítico en {entity}"


def refresh_agent_episodes(db: Session, empresa_id: int) -> list[AgentEpisode]:
    """Construye componentes conexas y mantiene sus episodios sin usar un LLM."""
    refresh_signal_links(db, empresa_id)
    signals = db.query(AgentSignal).filter(
        AgentSignal.empresa_id == empresa_id,
        AgentSignal.estado.in_(ACTIVE_STATES),
    ).all()
    active_ids = {signal.id for signal in signals}
    links = db.query(AgentSignalLink).filter(
        AgentSignalLink.empresa_id == empresa_id,
        AgentSignalLink.signal_origen_id.in_(active_ids) if active_ids else False,
        AgentSignalLink.signal_destino_id.in_(active_ids) if active_ids else False,
    ).all() if active_ids else []
    by_id = {signal.id: signal for signal in signals}
    now = datetime.utcnow()
    episode_ids: set[int] = set()

    for component_ids in _components(signals, links):
        component = [by_id[signal_id] for signal_id in component_ids]
        fingerprint = _episode_fingerprint(component)
        component_links = [link for link in links if link.signal_origen_id in component_ids and link.signal_destino_id in component_ids]
        representatives = _duplicate_representatives(component, component_links)
        anchor = max(representatives, key=lambda signal: _number(signal.impacto_ponderado_eur))
        subtotals = {"realizado": 0.0, "en_riesgo": 0.0, "capital": 0.0}
        for signal in representatives:
            subtotals[signal.impacto_tipo] = subtotals.get(signal.impacto_tipo, 0.0) + _number(signal.impacto_eur)
        weighted = sum(_number(signal.impacto_ponderado_eur) for signal in representatives)
        episode = db.query(AgentEpisode).filter(
            AgentEpisode.empresa_id == empresa_id,
            AgentEpisode.fingerprint == fingerprint,
        ).first()
        if episode is None:
            previous_episode_ids = {signal.episodio_id for signal in component if signal.episodio_id}
            previous_open = db.query(AgentEpisode).filter(
                AgentEpisode.empresa_id == empresa_id,
                AgentEpisode.id.in_(previous_episode_ids),
                AgentEpisode.estado == "abierto",
            ).all() if previous_episode_ids else []
            # Si se añade o desaparece una faceta del mismo incidente, conserva su episodio abierto.
            # Una unión de dos episodios distintos sí crea uno nuevo para no ocultar la consolidación.
            if len(previous_open) == 1:
                episode = previous_open[0]
                episode.fingerprint = fingerprint
        if episode is None:
            episode = AgentEpisode(
                empresa_id=empresa_id,
                fingerprint=fingerprint,
                titulo=_episode_title(anchor, component_links),
                entidad_tipo=anchor.entidad_tipo,
                entidad_id=anchor.entidad_id,
                severidad_max=max(int(signal.severidad or 1) for signal in component),
                impacto_realizado_eur=subtotals["realizado"],
                impacto_en_riesgo_eur=subtotals["en_riesgo"],
                impacto_capital_eur=subtotals["capital"],
                impacto_ponderado_eur=weighted,
                estado="abierto",
                primera_deteccion=min(signal.primera_deteccion for signal in component if signal.primera_deteccion),
                ultima_deteccion=max(signal.ultima_deteccion for signal in component if signal.ultima_deteccion),
            )
            db.add(episode)
            db.flush()
        else:
            episode.titulo = _episode_title(anchor, component_links)
            episode.entidad_tipo = anchor.entidad_tipo
            episode.entidad_id = anchor.entidad_id
            episode.severidad_max = max(int(signal.severidad or 1) for signal in component)
            episode.impacto_realizado_eur = subtotals["realizado"]
            episode.impacto_en_riesgo_eur = subtotals["en_riesgo"]
            episode.impacto_capital_eur = subtotals["capital"]
            episode.impacto_ponderado_eur = weighted
            episode.estado = "abierto"
            episode.ultima_deteccion = max(signal.ultima_deteccion for signal in component if signal.ultima_deteccion)
        for signal in component:
            signal.episodio_id = episode.id
        episode_ids.add(episode.id)

    for episode in db.query(AgentEpisode).filter(
        AgentEpisode.empresa_id == empresa_id,
        AgentEpisode.estado == "abierto",
    ).all():
        if episode.id not in episode_ids:
            still_active = db.query(AgentSignal.id).filter(
                AgentSignal.episodio_id == episode.id,
                AgentSignal.estado.in_(ACTIVE_STATES),
            ).first()
            if not still_active:
                episode.estado = "resuelto"
                episode.ultima_deteccion = now
    db.flush()
    return get_open_episodes(db, empresa_id, limit=100)


def get_open_episodes(db: Session, empresa_id: int, limit: int = 7) -> list[AgentEpisode]:
    return db.query(AgentEpisode).filter(
        AgentEpisode.empresa_id == empresa_id,
        AgentEpisode.estado == "abierto",
    ).order_by(AgentEpisode.impacto_ponderado_eur.desc(), AgentEpisode.severidad_max.desc()).limit(limit).all()


def serialize_episode(db: Session, episode: AgentEpisode) -> dict:
    signals = db.query(AgentSignal).filter(
        AgentSignal.empresa_id == episode.empresa_id,
        AgentSignal.episodio_id == episode.id,
    ).all()
    signal_ids = [signal.id for signal in signals]
    links = db.query(AgentSignalLink).filter(
        AgentSignalLink.empresa_id == episode.empresa_id,
        AgentSignalLink.signal_origen_id.in_(signal_ids) if signal_ids else False,
        AgentSignalLink.signal_destino_id.in_(signal_ids) if signal_ids else False,
    ).all() if signal_ids else []
    return {
        "id": episode.id,
        "titulo": episode.titulo,
        "entidad": {"tipo": episode.entidad_tipo, "id": episode.entidad_id},
        "severidad_max": episode.severidad_max,
        "impactos": {
            "realizado_eur": _number(episode.impacto_realizado_eur),
            "en_riesgo_eur": _number(episode.impacto_en_riesgo_eur),
            "capital_eur": _number(episode.impacto_capital_eur),
            "ponderado_eur": _number(episode.impacto_ponderado_eur),
        },
        "estado": episode.estado,
        "primera_deteccion": str(episode.primera_deteccion),
        "ultima_deteccion": str(episode.ultima_deteccion),
        "senales": [{
            "id": signal.id, "agente": signal.agente, "detector": signal.detector,
            "entidad": {"tipo": signal.entidad_tipo, "id": signal.entidad_id},
            "impacto_eur": _number(signal.impacto_eur), "impacto_tipo": signal.impacto_tipo,
            "impacto_ponderado_eur": _number(signal.impacto_ponderado_eur),
            "severidad": signal.severidad, "confianza": _number(signal.confianza),
            "periodo": [str(signal.periodo_inicio), str(signal.periodo_fin)], "estado": signal.estado,
            "evidencia": json.loads(signal.evidencia or "{}"),
        } for signal in signals],
        "enlaces": [{
            "origen_id": link.signal_origen_id, "destino_id": link.signal_destino_id,
            "tipo_relacion": link.tipo_relacion, "regla": link.regla,
            "solape_dias": link.solape_dias, "detalle": json.loads(link.detalle or "{}"),
        } for link in links],
    }


def build_episode_bundle(db: Session, empresa_id: int, limit: int = 7) -> dict:
    episodes = get_open_episodes(db, empresa_id, limit=limit)
    return {
        "fuente": "agent_episodes",
        "regla": "Los episodios y sus importes son deterministas; no se permiten cálculos nuevos ni sumar tipos de impacto distintos.",
        "episodios": [serialize_episode(db, episode) for episode in episodes],
    }
