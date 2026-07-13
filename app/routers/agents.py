from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Usuario, AgentSettings, AgentInsights
from app.api.deps import get_current_user
from app.schemas import AgentInsightResponse
from app.agents_service import execute_agents_workflow

router = APIRouter()

@router.post("/agents/run")
def run_agents(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
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
        import traceback
        error_msg = str(e) + "\n" + traceback.format_exc()
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"detail": error_msg})

@router.get("/agents/insights", response_model=AgentInsightResponse)
def get_latest_insight(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insight = db.query(AgentInsights).filter(AgentInsights.empresa_id == current_user.empresa_id).order_by(AgentInsights.fecha.desc()).first()
    if not insight:
        raise HTTPException(status_code=404, detail="No hay insights generados aún.")
    return insight

from typing import List
@router.get("/agents/insights/history", response_model=List[AgentInsightResponse])
def get_all_insights(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    insights = db.query(AgentInsights).filter(AgentInsights.empresa_id == current_user.empresa_id).order_by(AgentInsights.fecha.desc()).all()
    return insights

from app.models import AgentChat, AgentMessage
from app.schemas import AgentChatRequest
from app.agents_service import process_agent_chat

@router.get("/agents/{agent_name}/chat")
def get_agent_chat(agent_name: str, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    chat = db.query(AgentChat).filter(
        AgentChat.usuario_id == current_user.id,
        AgentChat.agent_name == agent_name
    ).first()
    if not chat:
        return []
    
    mensajes = db.query(AgentMessage).filter(AgentMessage.chat_id == chat.id).order_by(AgentMessage.creado_en.asc()).all()
    return [{"role": m.rol, "content": m.contenido} for m in mensajes]

@router.post("/agents/{agent_name}/chat")
def chat_with_agent(agent_name: str, payload: AgentChatRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    # Get or create chat
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
    
    # Save user message
    user_msg = AgentMessage(chat_id=chat.id, rol=nuevo_mensaje.role, contenido=nuevo_mensaje.content)
    db.add(user_msg)
    db.commit()

    # Reconstruct history for AI
    mensajes_previos = db.query(AgentMessage).filter(AgentMessage.chat_id == chat.id).order_by(AgentMessage.creado_en.asc()).all()
    history_dicts = [{"role": m.rol, "content": m.contenido} for m in mensajes_previos]

    # Process via AI
    reply = process_agent_chat(db, current_user.empresa_id, agent_name, history_dicts)

    # Save assistant message
    assistant_msg = AgentMessage(chat_id=chat.id, rol="assistant", contenido=reply)
    db.add(assistant_msg)
    db.commit()

    return {"reply": reply}
