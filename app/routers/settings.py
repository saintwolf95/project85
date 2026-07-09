from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Usuario, AgentSettings
from app.api.deps import get_current_user
from app.schemas import AgentSettingsResponse, AgentSettingsUpdate

router = APIRouter()

@router.get("/agent-settings", response_model=AgentSettingsResponse)
def get_agent_settings(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(AgentSettings).filter(AgentSettings.empresa_id == current_user.empresa_id).first()
    if not settings:
        # Create default
        settings = AgentSettings(empresa_id=current_user.empresa_id, fase1_active=False, fase2_active=False)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.post("/agent-settings", response_model=AgentSettingsResponse)
def update_agent_settings(payload: AgentSettingsUpdate, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    settings = db.query(AgentSettings).filter(AgentSettings.empresa_id == current_user.empresa_id).first()
    if not settings:
        settings = AgentSettings(empresa_id=current_user.empresa_id)
        db.add(settings)
        
    settings.fase1_active = payload.fase1_active
    settings.fase2_active = payload.fase2_active
    db.commit()
    db.refresh(settings)
    return settings
