from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Literal
from ..database import get_db, get_db_ro
from ..copilot_service import process_copilot_chat
from ..models import Usuario
from ..api.deps import get_current_user
from ..core.rate_limit import limiter

router = APIRouter(prefix="/copilot", tags=["copilot"])

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)

class ChatRequest(BaseModel):
    history: List[ChatMessage] = Field(..., max_length=20)
    model_preference: Literal["fast", "thinking"] = "fast"

class ChatResponse(BaseModel):
    reply: str

@router.post("/chat")
@limiter.limit("5/minute")
def copilot_chat(request: Request, payload: ChatRequest, db: Session = Depends(get_db_ro), current_user: Usuario = Depends(get_current_user)):
    try:
        history_dicts = [{"role": m.role, "content": m.content} for m in payload.history]
        reply = process_copilot_chat(
            db=db, 
            history=history_dicts, 
            empresa_id=current_user.empresa_id,
            model_preference=payload.model_preference
        )
        return {"reply": reply}
    except Exception as e:
        import traceback
        return {"reply": f"⚠️ Error interno del servidor: {str(e)}\n\n```\n{traceback.format_exc()}\n```"}
