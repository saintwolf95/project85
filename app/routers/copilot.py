from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
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

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat", response_model=ChatResponse)
def copilot_chat(request: ChatRequest, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    history_dicts = [{"role": m.role, "content": m.content} for m in request.history]
    reply = process_copilot_chat(db, history_dicts, current_user.empresa_id)
    return ChatResponse(reply=reply)
