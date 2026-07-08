from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db, get_db_ro
from ..copilot_service import process_copilot_chat
from ..models import Usuario
from ..api.deps import get_current_user
from typing import List

router = APIRouter(prefix="/copilot", tags=["copilot"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    history: List[ChatMessage]
    model_preference: str = "fast"

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
def copilot_chat(request: ChatRequest, db: Session = Depends(get_db_ro), current_user: Usuario = Depends(get_current_user)):
    try:
        history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
        reply = process_copilot_chat(
            db=db, 
            history=history_dicts, 
            empresa_id=current_user.empresa_id,
            model_preference=request.model_preference
        )
        return ChatResponse(reply=reply)
    except Exception as e:
        return ChatResponse(reply=f"Error en el servidor: {str(e)}")
