import json
from datetime import datetime, timedelta
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
import logging
from ..database import get_db
from ..models import AgentDecision, AgentEpisode, AgentSettings, AgentInsights, AgentSignal, AgentSignalFeedback, AgentSignalLink, Usuario
from ..api.deps import get_current_user, get_current_active_admin
from ..schemas import AgentDecisionCreateRequest, AgentDecisionUpdateRequest, AgentDiscardRequest, AgentInsightResponse, AgentInvestigationRequest, AgentSignalFeedbackRequest
from ..agents_service import ensure_daily_agent_insight, execute_agents_workflow, get_daily_agent_insight
from ..agent_metrics import build_agent_dossier, build_agent_followups, build_company_data_readiness
from ..agent_studies import ALLOWED_STUDY_AGENTS, ensure_agent_study_snapshot
from ..core.rate_limit import limiter
from ..agent_investigations import run_investigation
from ..agent_correlation import serialize_episode

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_AGENT_INSIGHTS_HISTORY = 100
MAX_AGENT_CHAT_MESSAGES = 100
MAX_AGENT_MODEL_MESSAGES = 20
ALLOWED_AGENT_NAMES = {"maria", "maría", "lucia", "lucía", "mattia", "ceo"}

def validate_agent_name(agent_name: str) -> str:
    normalized = agent_name.lower()
    if normalized not in ALLOWED_AGENT_NAMES:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return normalized


def _signal_or_404(db: Session, empresa_id: int, signal_id: int) -> AgentSignal:
    signal = db.query(AgentSignal).filter(AgentSignal.id == signal_id, AgentSignal.empresa_id == empresa_id).first()
    if not signal:
        raise HTTPException(status_code=404, detail="Señal no encontrada")
    return signal


def _decision_or_404(db: Session, empresa_id: int, decision_id: int) -> AgentDecision:
    decision = db.query(AgentDecision).filter(AgentDecision.id == decision_id, AgentDecision.empresa_id == empresa_id).first()
    if not decision:
        raise HTTPException(status_code=404, detail="Decisión no encontrada")
    return decision


def _serialize_signal(db: Session, signal: AgentSignal) -> dict:
    links = db.query(AgentSignalLink).filter(
        AgentSignalLink.empresa_id == signal.empresa_id,
        or_(AgentSignalLink.signal_origen_id == signal.id, AgentSignalLink.signal_destino_id == signal.id),
    ).all()
    feedback = db.query(AgentSignalFeedback).filter(
        AgentSignalFeedback.empresa_id == signal.empresa_id,
        AgentSignalFeedback.signal_id == signal.id,
    ).order_by(AgentSignalFeedback.created_at.desc()).all()
    return {
        "id": signal.id, "agente": signal.agente, "detector": signal.detector,
        "entidad_tipo": signal.entidad_tipo, "entidad_id": signal.entidad_id,
        "periodo_inicio": str(signal.periodo_inicio), "periodo_fin": str(signal.periodo_fin),
        "severidad": signal.severidad, "impacto_eur": signal.impacto_eur,
        "impacto_tipo": signal.impacto_tipo, "impacto_ponderado_eur": signal.impacto_ponderado_eur,
        "confianza": signal.confianza, "valor_actual": signal.valor_actual,
        "valor_esperado": signal.valor_esperado, "desviacion": signal.desviacion,
        "evidencia": signal.evidencia, "estado": signal.estado, "episodio_id": signal.episodio_id,
        "primera_deteccion": signal.primera_deteccion, "ultima_deteccion": signal.ultima_deteccion,
        "descartada_por": signal.descartada_por, "descartada_motivo": signal.descartada_motivo,
        "descartada_en": signal.descartada_en,
        "enlaces": [{"id": link.id, "origen_id": link.signal_origen_id, "destino_id": link.signal_destino_id, "tipo_relacion": link.tipo_relacion, "regla": link.regla, "solape_dias": link.solape_dias, "detalle": link.detalle} for link in links],
        "feedback": [{"id": row.id, "usuario_id": row.usuario_id, "veredicto": row.veredicto, "motivo": row.motivo, "created_at": row.created_at} for row in feedback],
    }


def _serialize_decision(decision: AgentDecision) -> dict:
    return {
        "id": decision.id, "episodio_id": decision.episodio_id, "signal_id": decision.signal_id,
        "titulo": decision.titulo, "descripcion": decision.descripcion, "responsable": decision.responsable,
        "metrica_objetivo": decision.metrica_objetivo, "valor_objetivo": decision.valor_objetivo,
        "horizonte_fecha": str(decision.horizonte_fecha), "origen": decision.origen,
        "estado": decision.estado, "resultado_texto": decision.resultado_texto,
        "creada_por": decision.creada_por, "created_at": decision.created_at,
        "updated_at": decision.updated_at, "cerrada_en": decision.cerrada_en,
    }


def _episode_diff_since_previous_execution(db: Session, empresa_id: int) -> dict:
    history = db.query(AgentInsights).filter(AgentInsights.empresa_id == empresa_id).order_by(AgentInsights.fecha.desc()).limit(2).all()
    if len(history) < 2:
        return {"nuevos": 0, "empeoran": 0, "resueltos": 0, "disponible": False}
    def episodes(row: AgentInsights) -> dict[int, float]:
        try:
            items = json.loads(row.fase1_raw_json or "[]")
        except json.JSONDecodeError:
            return {}
        result: dict[int, float] = {}
        for item in items:
            episode_id = item.get("episodio_id")
            if not episode_id:
                continue
            value = item.get("episodio_impacto_ponderado_eur")
            if value is not None:
                result[int(episode_id)] = float(value)
            else:
                # Históricos anteriores a episodios: conserva una aproximación sin duplicar facetas.
                result[int(episode_id)] = max(result.get(int(episode_id), 0), float(item.get("impacto_ponderado_eur") or 0))
        return result
    current, previous = episodes(history[0]), episodes(history[1])
    return {
        "nuevos": len(set(current) - set(previous)),
        "empeoran": sum(current[key] > previous[key] for key in set(current) & set(previous)),
        "resueltos": len(set(previous) - set(current)),
        "disponible": True,
    }

@router.post("/agents/run")
@limiter.limit("2/minute")
def run_agents(request: Request, current_user: Usuario = Depends(get_current_active_admin), db: Session = Depends(get_db)):
    try:
        settings = db.query(AgentSettings).filter(AgentSettings.empresa_id == current_user.empresa_id).first()
        if not settings:
            settings = AgentSettings(empresa_id=current_user.empresa_id, fase1_active=False, fase2_active=False)
            db.add(settings)
            db.commit()
            db.refresh(settings)
            
        insight = execute_agents_workflow(db, current_user.empresa_id, settings.fase1_active, settings.fase2_active)
        return insight
    except Exception as e:
        db.rollback()
        logger.error(f"Error ejecutando agentes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno ejecutando agentes.")

@router.get("/agents/insights", response_model=AgentInsightResponse)
def get_latest_insight(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insight = db.query(AgentInsights).filter(AgentInsights.empresa_id == current_user.empresa_id).order_by(AgentInsights.fecha.desc()).first()
    if not insight:
        raise HTTPException(status_code=404, detail="No hay insights generados aún.")
    return insight

@router.get("/agents/readiness")
def get_agents_readiness(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_company_data_readiness(db, current_user.empresa_id)


@router.get("/agents/signals")
@limiter.limit("30/minute")
def list_signals(
    request: Request,
    agente: str | None = None,
    estado: str | None = None,
    impacto_tipo: str | None = None,
    severidad_minima: int | None = Query(default=None, ge=1, le=5),
    con_episodio: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AgentSignal).filter(AgentSignal.empresa_id == current_user.empresa_id)
    if agente:
        query = query.filter(AgentSignal.agente == validate_agent_name(agente).replace("í", "i"))
    if estado:
        query = query.filter(AgentSignal.estado == estado)
    if impacto_tipo:
        if impacto_tipo not in {"realizado", "en_riesgo", "capital"}:
            raise HTTPException(status_code=422, detail="Tipo de impacto no válido")
        query = query.filter(AgentSignal.impacto_tipo == impacto_tipo)
    if severidad_minima is not None:
        query = query.filter(AgentSignal.severidad >= severidad_minima)
    if con_episodio is True:
        query = query.filter(AgentSignal.episodio_id.isnot(None))
    elif con_episodio is False:
        query = query.filter(AgentSignal.episodio_id.is_(None))
    total = query.count()
    rows = query.order_by(AgentSignal.impacto_ponderado_eur.desc(), AgentSignal.severidad.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"page": page, "page_size": page_size, "total": total, "items": [_serialize_signal(db, row) for row in rows]}


@router.get("/agents/signals/{signal_id}")
def get_signal(signal_id: int, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    signal = _signal_or_404(db, current_user.empresa_id, signal_id)
    payload = _serialize_signal(db, signal)
    if signal.episodio_id:
        episode = db.query(AgentEpisode).filter(AgentEpisode.id == signal.episodio_id, AgentEpisode.empresa_id == current_user.empresa_id).first()
        if episode:
            payload["episodio"] = serialize_episode(db, episode)
    return payload


@router.post("/agents/signals/{signal_id}/feedback")
@limiter.limit("20/minute")
def create_signal_feedback(request: Request, signal_id: int, payload: AgentSignalFeedbackRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.veredicto != "util" and not (payload.motivo or "").strip():
        raise HTTPException(status_code=422, detail="El motivo es obligatorio para este veredicto")
    signal = _signal_or_404(db, current_user.empresa_id, signal_id)
    feedback = AgentSignalFeedback(
        empresa_id=current_user.empresa_id,
        usuario_id=current_user.id,
        signal_id=signal.id,
        veredicto=payload.veredicto,
        motivo=(payload.motivo or "").strip() or None,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return {"id": feedback.id, "veredicto": feedback.veredicto, "motivo": feedback.motivo, "created_at": feedback.created_at}


@router.post("/agents/signals/{signal_id}/discard")
@limiter.limit("20/minute")
def discard_signal(request: Request, signal_id: int, payload: AgentDiscardRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    motivo = payload.motivo.strip()
    if not motivo:
        raise HTTPException(status_code=422, detail="El motivo es obligatorio para descartar una señal")
    signal = _signal_or_404(db, current_user.empresa_id, signal_id)
    signal.estado = "descartada"
    signal.descartada_por = current_user.id
    signal.descartada_motivo = motivo
    signal.descartada_en = datetime.utcnow()
    db.add(AgentSignalFeedback(
        empresa_id=current_user.empresa_id,
        usuario_id=current_user.id,
        signal_id=signal.id,
        veredicto=payload.veredicto,
        motivo=motivo,
    ))
    db.commit()
    return _serialize_signal(db, signal)


@router.get("/agents/episodes")
@limiter.limit("30/minute")
def list_episodes(
    request: Request,
    estado: str = "abierto",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AgentEpisode).filter(AgentEpisode.empresa_id == current_user.empresa_id)
    if estado:
        query = query.filter(AgentEpisode.estado == estado)
    total = query.count()
    rows = query.order_by(AgentEpisode.impacto_ponderado_eur.desc(), AgentEpisode.severidad_max.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"page": page, "page_size": page_size, "total": total, "items": [serialize_episode(db, row) for row in rows], "diff_diario": _episode_diff_since_previous_execution(db, current_user.empresa_id)}


@router.get("/agents/episodes/{episode_id}")
def get_episode(episode_id: int, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    episode = db.query(AgentEpisode).filter(AgentEpisode.id == episode_id, AgentEpisode.empresa_id == current_user.empresa_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episodio no encontrado")
    payload = serialize_episode(db, episode)
    decisions = db.query(AgentDecision).filter(AgentDecision.empresa_id == current_user.empresa_id, AgentDecision.episodio_id == episode.id).order_by(AgentDecision.created_at.desc()).all()
    payload["decisiones"] = [_serialize_decision(decision) for decision in decisions]
    return payload


@router.get("/agents/decisions")
@limiter.limit("30/minute")
def list_decisions(
    request: Request,
    estado: str | None = None,
    responsable: str | None = None,
    horizonte_hasta: datetime | None = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AgentDecision).filter(AgentDecision.empresa_id == current_user.empresa_id)
    if estado:
        query = query.filter(AgentDecision.estado == estado)
    if responsable:
        query = query.filter(AgentDecision.responsable.ilike(f"%{responsable.strip()}%"))
    if horizonte_hasta:
        query = query.filter(AgentDecision.horizonte_fecha <= horizonte_hasta.date())
    rows = query.order_by(AgentDecision.horizonte_fecha.asc(), AgentDecision.updated_at.desc()).all()
    return {"items": [_serialize_decision(decision) for decision in rows]}


@router.post("/agents/decisions")
@limiter.limit("10/minute")
def create_decision(request: Request, payload: AgentDecisionCreateRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.episodio_id is None and payload.signal_id is None:
        raise HTTPException(status_code=422, detail="Una decisión debe estar vinculada a una señal o episodio")
    if payload.episodio_id is not None and not db.query(AgentEpisode.id).filter(AgentEpisode.id == payload.episodio_id, AgentEpisode.empresa_id == current_user.empresa_id).first():
        raise HTTPException(status_code=404, detail="Episodio no encontrado")
    if payload.signal_id is not None:
        _signal_or_404(db, current_user.empresa_id, payload.signal_id)
    decision = AgentDecision(
        empresa_id=current_user.empresa_id, episodio_id=payload.episodio_id, signal_id=payload.signal_id,
        titulo=payload.titulo.strip(), descripcion=payload.descripcion.strip(), responsable=payload.responsable.strip() or "Sin asignar",
        metrica_objetivo=payload.metrica_objetivo.strip() or "Sin métrica definida", valor_objetivo=payload.valor_objetivo,
        horizonte_fecha=payload.horizonte_fecha, origen="usuario", estado="propuesta", creada_por=current_user.id,
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return _serialize_decision(decision)


@router.patch("/agents/decisions/{decision_id}")
@limiter.limit("20/minute")
def update_decision(request: Request, decision_id: int, payload: AgentDecisionUpdateRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    decision = _decision_or_404(db, current_user.empresa_id, decision_id)
    for field in ("estado", "responsable", "metrica_objetivo", "valor_objetivo", "horizonte_fecha", "resultado_texto"):
        value = getattr(payload, field)
        if value is not None:
            setattr(decision, field, value.strip() if isinstance(value, str) else value)
    if decision.estado in {"completada", "descartada"}:
        decision.cerrada_en = datetime.utcnow()
    db.commit()
    db.refresh(decision)
    return _serialize_decision(decision)


@router.get("/agents/quality")
@limiter.limit("10/minute")
def get_quality(request: Request, dias: int = Query(default=90, ge=7, le=365), current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=dias)
    signals = db.query(AgentSignal).filter(AgentSignal.empresa_id == current_user.empresa_id, AgentSignal.primera_deteccion >= since).all()
    feedback_rows = db.query(AgentSignalFeedback).filter(AgentSignalFeedback.empresa_id == current_user.empresa_id, AgentSignalFeedback.created_at >= since).all()
    feedback_by_signal: dict[int, list[AgentSignalFeedback]] = {}
    for feedback in feedback_rows:
        feedback_by_signal.setdefault(feedback.signal_id, []).append(feedback)
    decisions = db.query(AgentDecision).filter(AgentDecision.empresa_id == current_user.empresa_id, AgentDecision.created_at >= since).all()
    output = []
    for detector in sorted({signal.detector for signal in signals}):
        scoped = [signal for signal in signals if signal.detector == detector]
        scoped_feedback = [feedback for signal in scoped for feedback in feedback_by_signal.get(signal.id, [])]
        first_feedback_days = [
            (min(row.created_at for row in feedback_by_signal[signal.id]) - signal.primera_deteccion).total_seconds() / 86400
            for signal in scoped if feedback_by_signal.get(signal.id)
        ]
        covered = sum(signal.impacto_eur or 0 for signal in scoped if any(
            decision.signal_id == signal.id or decision.episodio_id == signal.episodio_id for decision in decisions
        ))
        by_type = {impact_type: sum((signal.impacto_eur or 0) for signal in scoped if signal.impacto_tipo == impact_type) for impact_type in ("realizado", "en_riesgo", "capital")}
        total_feedback = len(scoped_feedback)
        output.append({
            "detector": detector, "senales_emitidas": len(scoped),
            "activas": sum(signal.estado in {"nueva", "persistente"} for signal in scoped),
            "resueltas": sum(signal.estado == "resuelta" for signal in scoped),
            "descartadas": sum(signal.estado == "descartada" for signal in scoped),
            "feedback_registros": total_feedback,
            "conclusivo": total_feedback >= 5,
            "tasa_falso_positivo": (sum(row.veredicto == "falso_positivo" for row in scoped_feedback) / total_feedback) if total_feedback else None,
            "tasa_feedback": (len({row.signal_id for row in scoped_feedback}) / len(scoped)) if scoped else None,
            "dias_medianos_primer_feedback": median(first_feedback_days) if first_feedback_days else None,
            "euros_senalados": by_type, "euros_cubiertos_decision": covered,
        })
    return {"desde": since.date().isoformat(), "hasta": datetime.utcnow().date().isoformat(), "dias": dias, "por_detector": output}

@router.get("/agents/daily", response_model=AgentInsightResponse)
def get_daily_report(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insight = get_daily_agent_insight(db, current_user.empresa_id)
    if not insight:
        raise HTTPException(status_code=404, detail="El informe diario todavía no está preparado")
    return insight

@router.post("/agents/daily/ensure", response_model=AgentInsightResponse)
@limiter.limit("2/minute")
def ensure_daily_report(request: Request, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return ensure_daily_agent_insight(db, current_user.empresa_id)
    except Exception:
        logger.exception("Error preparando el informe diario de agentes")
        raise HTTPException(status_code=500, detail="No se pudo preparar el informe diario")

@router.get("/agents/{agent_name}/studies")
@limiter.limit("10/minute")
def get_agent_studies(request: Request, agent_name: str, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    normalized = validate_agent_name(agent_name).replace("í", "i")
    if normalized not in ALLOWED_STUDY_AGENTS:
        raise HTTPException(status_code=404, detail="Centro de estudios no disponible")
    try:
        return ensure_agent_study_snapshot(db, current_user.empresa_id, normalized)
    except Exception:
        logger.exception("Error preparando estudios de %s", normalized)
        raise HTTPException(status_code=500, detail="No se pudieron preparar los estudios analíticos")

@router.post("/agents/{agent_name}/investigations")
@limiter.limit("3/minute")
def investigate_agent(request: Request, agent_name: str, payload: AgentInvestigationRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    normalized = validate_agent_name(agent_name).replace("í", "i")
    if normalized not in ALLOWED_STUDY_AGENTS:
        raise HTTPException(status_code=422, detail="Las investigaciones están disponibles para María, Lucía y Mattia.")
    try:
        result = run_investigation(db, current_user.empresa_id, normalized, payload.question)
        if result["mode"] == "blocked":
            raise HTTPException(status_code=422, detail="La redacción no superó la verificación contra la evidencia.")
        return result
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        logger.exception("Error en investigación contractual de %s", normalized)
        raise HTTPException(status_code=500, detail="No se pudo completar la investigación")

from typing import List
@router.get("/agents/insights/history", response_model=List[AgentInsightResponse])
def get_all_insights(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insights = db.query(AgentInsights).filter(
        AgentInsights.empresa_id == current_user.empresa_id
    ).order_by(AgentInsights.fecha.desc()).limit(MAX_AGENT_INSIGHTS_HISTORY).all()
    return insights

from ..models import AgentChat, AgentMessage
from ..schemas import AgentChatRequest
from ..agents_service import process_agent_chat

@router.get("/agents/{agent_name}/chat")
def get_agent_chat(agent_name: str, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    agent_name = validate_agent_name(agent_name)
    chat = db.query(AgentChat).filter(
        AgentChat.usuario_id == current_user.id,
        AgentChat.agent_name == agent_name
    ).first()
    if not chat:
        return []
    
    mensajes = db.query(AgentMessage).filter(
        AgentMessage.chat_id == chat.id
    ).order_by(AgentMessage.creado_en.desc()).limit(MAX_AGENT_CHAT_MESSAGES).all()
    mensajes.reverse()
    return [{"role": m.rol, "content": m.contenido} for m in mensajes]

@router.post("/agents/{agent_name}/chat")
@limiter.limit("5/minute")
def chat_with_agent(request: Request, agent_name: str, payload: AgentChatRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    agent_name = validate_agent_name(agent_name)
    chat = db.query(AgentChat).filter(
        AgentChat.usuario_id == current_user.id,
        AgentChat.agent_name == agent_name
    ).first()
    
    if not chat:
        chat = AgentChat(usuario_id=current_user.id, agent_name=agent_name)
        db.add(chat)
        db.commit()
        db.refresh(chat)

    nuevo_mensaje = payload.history[-1]
    if nuevo_mensaje.role != "user":
        raise HTTPException(status_code=422, detail="El último mensaje debe ser del usuario")
    
    user_msg = AgentMessage(chat_id=chat.id, rol=nuevo_mensaje.role, contenido=nuevo_mensaje.content)
    db.add(user_msg)
    db.commit()

    mensajes_previos = db.query(AgentMessage).filter(
        AgentMessage.chat_id == chat.id
    ).order_by(AgentMessage.creado_en.desc()).limit(MAX_AGENT_MODEL_MESSAGES).all()
    mensajes_previos.reverse()
    history_dicts = [{"role": m.rol, "content": m.contenido} for m in mensajes_previos]

    dossier = build_agent_dossier(db, current_user.empresa_id, agent_name)
    reply = process_agent_chat(
        db,
        current_user.empresa_id,
        agent_name,
        history_dicts,
        dossier=dossier,
        signal_id=payload.signal_id,
    )

    assistant_msg = AgentMessage(chat_id=chat.id, rol="assistant", contenido=reply)
    db.add(assistant_msg)
    db.commit()

    return {"reply": reply, "suggestions": build_agent_followups(dossier, agent_name)}
