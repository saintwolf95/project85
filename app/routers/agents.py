from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import logging
from ..database import get_db
from ..models import Usuario, AgentSettings, AgentInsights
from ..api.deps import get_current_user
from ..schemas import AgentInsightResponse
from ..agents_service import execute_agents_workflow
from ..core.rate_limit import limiter

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_AGENT_INSIGHTS_HISTORY = 100
MAX_AGENT_CHAT_MESSAGES = 100
ALLOWED_AGENT_NAMES = {"maria", "maría", "lucia", "lucía", "mattia", "ceo"}

def validate_agent_name(agent_name: str) -> str:
    normalized = agent_name.lower()
    if normalized not in ALLOWED_AGENT_NAMES:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return normalized

@router.post("/agents/run")
@limiter.limit("2/minute")
def run_agents(request: Request, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
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
        logger.error(f"Error ejecutando agentes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno ejecutando agentes.")

@router.get("/agents/insights", response_model=AgentInsightResponse)
def get_latest_insight(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insight = db.query(AgentInsights).filter(AgentInsights.empresa_id == current_user.empresa_id).order_by(AgentInsights.fecha.desc()).first()
    if not insight:
        raise HTTPException(status_code=404, detail="No hay insights generados aún.")
    return insight

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
    
    user_msg = AgentMessage(chat_id=chat.id, rol=nuevo_mensaje.role, contenido=nuevo_mensaje.content)
    db.add(user_msg)
    db.commit()

    mensajes_previos = db.query(AgentMessage).filter(
        AgentMessage.chat_id == chat.id
    ).order_by(AgentMessage.creado_en.desc()).limit(MAX_AGENT_CHAT_MESSAGES).all()
    mensajes_previos.reverse()
    history_dicts = [{"role": m.rol, "content": m.contenido} for m in mensajes_previos]

    reply = process_agent_chat(db, current_user.empresa_id, agent_name, history_dicts)

    assistant_msg = AgentMessage(chat_id=chat.id, rol="assistant", contenido=reply)
    db.add(assistant_msg)
    db.commit()

    return {"reply": reply}
