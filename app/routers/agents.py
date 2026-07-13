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
