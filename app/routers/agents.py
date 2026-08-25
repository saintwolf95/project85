from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import logging
from ..database import get_db
from ..models import Usuario, AgentSettings, AgentInsights
from ..api.deps import get_current_user, get_current_active_admin
from ..schemas import AgentInsightResponse, AgentInvestigationRequest
from ..agents_service import ensure_daily_agent_insight, execute_agents_workflow, get_daily_agent_insight
from ..agent_metrics import build_agent_dossier, build_agent_followups, build_company_data_readiness
from ..agent_studies import ALLOWED_STUDY_AGENTS, ensure_agent_study_snapshot
from ..core.rate_limit import limiter
from ..agent_investigations import run_investigation

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
    reply = process_agent_chat(db, current_user.empresa_id, agent_name, history_dicts, dossier=dossier)

    assistant_msg = AgentMessage(chat_id=chat.id, rol="assistant", contenido=reply)
    db.add(assistant_msg)
    db.commit()

    return {"reply": reply, "suggestions": build_agent_followups(dossier, agent_name)}
