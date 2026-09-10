from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..api.deps import get_current_user
from ..core.rate_limit import limiter
from ..database import get_db
from ..margin_service import bridge, concentration, entity_series, margin_detail, overview
from ..models import AgentEpisode, AgentInsights, AgentSignal, Usuario


router = APIRouter(prefix="/margin", tags=["Marginalidad"])
MARGIN_DETECTORS = {"erosion_mgd_familia", "erosion_mgd_cliente", "erosion_mgd_comercial", "venta_bajo_coste", "margen_bajo_objetivo", "concentracion_margen", "dispersion_precio_sku", "precio_volumen_familia"}


def _error(callable_):
    try:
        return callable_()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/overview")
@limiter.limit("30/minute")
def get_overview(request: Request, ventana: str = Query("90d", pattern="^(30d|90d|12m|custom)$"), inicio: date | None = None, fin: date | None = None, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return _error(lambda: overview(db, current_user.empresa_id, ventana, inicio, fin))


@router.get("/concentration")
@limiter.limit("30/minute")
def get_concentration(request: Request, metrica: str = Query("mgd", pattern="^(mg|mgd)$"), unidad: str = Query("eur", pattern="^(eur|pct)$"), ventana: str = Query("90d", pattern="^(30d|90d|12m|custom)$"), inicio: date | None = None, fin: date | None = None, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _error(lambda: concentration(db, current_user.empresa_id, metrica, ventana, inicio, fin))
    payload["unidad"] = "eur"
    payload["unidad_bloqueada"] = unidad != "eur"
    payload["nota_unidad"] = "La concentración se calcula sobre euros; los porcentajes de margen son informativos por SKU."
    return payload


@router.get("/detail")
@limiter.limit("30/minute")
def get_detail(request: Request, dimension: str = Query("sku", pattern="^(sku|familia|cliente|comercial|product_manager)$"), metrica: str = Query("mgd", pattern="^(mg|mgd)$"), unidad: str = Query("eur", pattern="^(eur|pct)$"), ventana: str = Query("90d", pattern="^(30d|90d|12m|custom)$"), inicio: date | None = None, fin: date | None = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=500), order: str = Query("mgd_eur"), direction: str = Query("desc", pattern="^(asc|desc)$"), search: str | None = None, familia: str | None = None, product_manager: str | None = None, solo_negativo: bool = False, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _error(lambda: margin_detail(db, current_user.empresa_id, dimension, metrica, ventana, page, limit, order, direction, search, familia, product_manager, solo_negativo, inicio, fin))
    payload["unidad_destacada"] = unidad
    return payload


@router.get("/bridge")
@limiter.limit("30/minute")
def get_bridge(request: Request, metrica: str = Query("mgd", pattern="^(mg|mgd)$"), ventana: str = Query("90d", pattern="^(30d|90d|12m|custom)$"), inicio: date | None = None, fin: date | None = None, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    return _error(lambda: bridge(db, current_user.empresa_id, metrica, ventana, inicio, fin))


@router.get("/entity/{tipo}/{entity_id}")
@limiter.limit("30/minute")
def get_entity(tipo: str, entity_id: str, request: Request, ventana: str = Query("12m", pattern="^(30d|90d|12m|custom)$"), inicio: date | None = None, fin: date | None = None, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _error(lambda: entity_series(db, current_user.empresa_id, tipo, entity_id, ventana, inicio, fin))
    signals = db.query(AgentSignal).filter(AgentSignal.empresa_id == current_user.empresa_id, AgentSignal.entidad_tipo == tipo, AgentSignal.entidad_id == entity_id, AgentSignal.estado.in_(("nueva", "persistente"))).order_by(AgentSignal.impacto_ponderado_eur.desc()).all()
    payload["senales_activas"] = [{"id": row.id, "detector": row.detector, "severidad": row.severidad, "impacto_ponderado_eur": row.impacto_ponderado_eur} for row in signals]
    return payload


@router.get("/signals")
@limiter.limit("30/minute")
def get_margin_signals(request: Request, current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    signals = db.query(AgentSignal).filter(AgentSignal.empresa_id == current_user.empresa_id, AgentSignal.estado.in_(("nueva", "persistente")), AgentSignal.detector.in_(MARGIN_DETECTORS)).order_by(AgentSignal.impacto_ponderado_eur.desc()).all()
    episodes = {episode.id: episode for episode in db.query(AgentEpisode).filter(AgentEpisode.empresa_id == current_user.empresa_id, AgentEpisode.estado == "abierto").all()}
    mattia = db.query(AgentInsights).filter(AgentInsights.empresa_id == current_user.empresa_id).order_by(AgentInsights.fecha.desc()).first()
    return {"senales": [{"id": row.id, "detector": row.detector, "entidad_tipo": row.entidad_tipo, "entidad_id": row.entidad_id, "severidad": row.severidad, "impacto_eur": row.impacto_eur, "impacto_tipo": row.impacto_tipo, "impacto_ponderado_eur": row.impacto_ponderado_eur, "episodio_id": row.episodio_id, "episodio_titulo": episodes[row.episodio_id].titulo if row.episodio_id in episodes else None} for row in signals], "mattia_markdown": mattia.fase1_mattia_md if mattia else None}
