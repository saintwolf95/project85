from fastapi import APIRouter, Depends, Query
import pandas as pd
from typing import Optional, List
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from .. import schemas, services
from ..models import Usuario
from ..api.deps import get_current_user

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/inventory-abc", response_model=schemas.InventoryAnalyticsResponse)
def get_inventory_abc(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1),
    search: Optional[str] = Query(None),
    matriz_abc: Optional[str] = Query(None),
    stock_out_risk: Optional[bool] = Query(None),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    metrics = services.calculate_inventory_metrics(db, current_user.empresa_id)
    
    if search:
        s = search.lower()
        metrics = [m for m in metrics if s in str(m.get("nombre_art", "")).lower() or s in str(m.get("cod_art", "")).lower() or s in str(m.get("familia", "")).lower()]
    
    if matriz_abc:
        metrics = [m for m in metrics if str(m.get("matriz_abc", "")).upper() == matriz_abc.upper()]
        
    if stock_out_risk is not None:
        if stock_out_risk:
            metrics = [m for m in metrics if "Riesgo Rotura" in m.get("riesgos_categorizados", [])]
        else:
            metrics = [m for m in metrics if "Riesgo Rotura" not in m.get("riesgos_categorizados", [])]

    total_records = len(metrics)
    total_pages = (total_records + limit - 1) // limit if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_data = metrics[start_idx:end_idx]
    
    return {
        "data": paginated_data,
        "total_records": total_records,
        "total_pages": total_pages,
        "current_page": page
    }

class AIInsight(BaseModel):
    icono: str
    titulo: str
    sugerencia: str
    tipo: str

@router.get("/insights", response_model=List[AIInsight])
def get_ai_insights(
    abc_class: Optional[str] = Query(None),
    familia: Optional[str] = Query(None),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    metrics = services.calculate_inventory_metrics(db, current_user.empresa_id)
    
    # Aplicar filtros si existen
    if abc_class and abc_class != "all":
        metrics = [m for m in metrics if m.get("matriz_abc", "").startswith(abc_class) or m.get("matriz_abc", "").endswith(abc_class)]
    if familia and familia != "all":
        metrics = [m for m in metrics if str(m.get("familia", "")).upper() == familia.upper()]

    df = pd.DataFrame(metrics)
    insights = []
    
    if df.empty:
        return insights

    # Insight 1: Riesgo Financiero
    riesgo_fin = df[df['riesgos_categorizados'].apply(lambda x: "Riesgo Financiero" in x)]
    if not riesgo_fin.empty:
        valor_riesgo = (riesgo_fin['costo_unit'] * riesgo_fin['unidades']).sum()
        insights.append({
            "icono": "alert",
            "titulo": "Riesgo Financiero Detectado",
            "sugerencia": f"Se detectaron {len(riesgo_fin)} productos con exceso de stock. Valor inmovilizado: {valor_riesgo:,.0f} €. Acción: Promocionar.",
            "tipo": "warning"
        })

    # Insight 2: Riesgo de Rotura
    riesgo_rotura = df[df['riesgos_categorizados'].apply(lambda x: "Riesgo Rotura" in x)]
    if not riesgo_rotura.empty:
        insights.append({
            "icono": "package-x",
            "titulo": "Alerta de Rotura Inminente",
            "sugerencia": f"{len(riesgo_rotura)} productos críticos sin stock suficiente. Acción: Emitir Orden de Compra Urgente.",
            "tipo": "error"
        })

    # Insight 3: Buen rendimiento
    clase_a = df[df['abc'] == 'A']
    if not clase_a.empty and len(riesgo_rotura) == 0:
        insights.append({
            "icono": "trending-up",
            "titulo": "Inventario Optimizado",
            "sugerencia": "La demanda de Clase A está perfectamente cubierta. Buen nivel de servicio.",
            "tipo": "success"
        })
    elif not clase_a.empty:
        insights.append({
            "icono": "trending-up",
            "titulo": "Alta Demanda en Clase A",
            "sugerencia": f"Hay {len(clase_a)} productos de clase A rotando. Mantener stock de seguridad.",
            "tipo": "success"
        })

    return insights[:3]

@router.get("/dashboard-kpis", response_model=schemas.DashboardKPIsResponse)
def get_dashboard_kpis(
    abc_class: Optional[str] = Query(None),
    familia: Optional[str] = Query(None),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from ..models import EmpresaEstadisticas
    import json
    
    is_filtered = False
    if abc_class and abc_class != "all":
        is_filtered = True
    if familia and familia != "all":
        is_filtered = True

    # Si NO hay filtros, devolvemos las estadísticas precalculadas (O(1))
    if not is_filtered:
        stats = db.query(EmpresaEstadisticas).filter(EmpresaEstadisticas.empresa_id == current_user.empresa_id).first()
        if stats:
            return {
                "total_skus": stats.total_skus,
                "volumen_total": stats.volumen_total,
                "costo_promedio": stats.costo_promedio,
                "familia_top": stats.familia_top,
                "valor_total_inventario": stats.valor_total_inventario,
                "total_alertas_criticas": stats.total_alertas_criticas,
                "salud_stock_clase_a": stats.salud_stock_clase_a,
                "abc_data": json.loads(stats.abc_data or "[]"),
                "family_data": json.loads(stats.family_data or "[]")
            }

    # Si hay filtros (o no hay stats aún), calculamos al vuelo en el backend
    metrics = services.calculate_inventory_metrics(db, current_user.empresa_id)
    
    if abc_class and abc_class != "all":
        metrics = [m for m in metrics if m.get("matriz_abc", "").startswith(abc_class) or m.get("matriz_abc", "").endswith(abc_class)]
    
    if familia and familia != "all":
        metrics = [m for m in metrics if str(m.get("familia", "")).upper() == familia.upper()]

    kpis = services.get_dashboard_kpis(metrics)
    
    total_skus = len(metrics)
    volumen_total = sum([m.get("unidades", 0) for m in metrics])
    costo_promedio = sum([m.get("costo_unit", 0) for m in metrics]) / total_skus if total_skus > 0 else 0
    
    fam_map = {}
    abc_map = {"A": 0, "B": 0, "C": 0}
    for m in metrics:
        fam_map[m.get("familia", "")] = fam_map.get(m.get("familia", ""), 0) + m.get("valor_inv", 0)
        if m.get("abc") in abc_map:
            abc_map[m.get("abc")] += 1
            
    familia_top = sorted(fam_map.keys(), key=lambda k: fam_map[k], reverse=True)[0] if fam_map else ""
    abc_data = [{"name": k, "value": v} for k, v in abc_map.items()]
    family_data = [{"name": k, "value": v} for k, v in fam_map.items()]
    family_data = sorted(family_data, key=lambda x: x["value"], reverse=True)

    return {
        "total_skus": total_skus,
        "volumen_total": volumen_total,
        "costo_promedio": costo_promedio,
        "familia_top": familia_top,
        "valor_total_inventario": kpis["valor_total_inventario"],
        "total_alertas_criticas": kpis["total_alertas_criticas"],
        "salud_stock_clase_a": kpis["salud_stock_clase_a"],
        "abc_data": abc_data,
        "family_data": family_data
    }

from datetime import date, timedelta
from ..models import Producto, VentaHistorica
from fastapi import HTTPException

@router.get("/product-history/{producto_id}", response_model=schemas.ProductHistoryResponse)
def get_product_history(
    producto_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify product belongs to user's company
    producto = db.query(Producto).filter(
        Producto.id == producto_id, 
        Producto.empresa_id == current_user.empresa_id
    ).first()
    
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Get last 60 days
    fecha_60d = date.today() - timedelta(days=60)
    
    ventas = db.query(VentaHistorica).filter(
        VentaHistorica.producto_id == producto_id,
        VentaHistorica.fecha_venta >= fecha_60d
    ).order_by(VentaHistorica.fecha_venta.asc()).all()

    historico = []
    for v in ventas:
        inventario_eur = v.stock_disponible * producto.costo_unitario
        historico.append({
            "fecha": v.fecha_venta.isoformat(),
            "ventas_eur": v.ingreso_total,
            "inventario_eur": inventario_eur
        })

    return {
        "producto_id": producto.id,
        "nombre": producto.nombre,
        "historico": historico
    }
