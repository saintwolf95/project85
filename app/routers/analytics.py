from datetime import date

from fastapi import APIRouter, Depends, Query
import pandas as pd
from typing import Optional, List
from pydantic import BaseModel
from sqlalchemy import Date, bindparam, text
from sqlalchemy.orm import Session
from ..database import get_db
from .. import schemas, services
from ..dashboard_service import build_executive_dashboard
from ..models import Usuario
from ..api.deps import get_current_user

router = APIRouter(prefix="/analytics", tags=["Analytics"])
MAX_INVENTORY_ANALYTICS_LIMIT = 20_000
MAX_SALES_EXPLORER_LIMIT = 200

SALES_EXPLORER_WHERE = """
    p.empresa_id = :empresa_id
    AND (:fecha_desde IS NULL OR v.fecha_venta >= :fecha_desde)
    AND (:fecha_hasta IS NULL OR v.fecha_venta <= :fecha_hasta)
    AND (:busqueda IS NULL OR (
        LOWER(COALESCE(p.sku, '')) LIKE :busqueda
        OR LOWER(COALESCE(p.nombre, '')) LIKE :busqueda
        OR LOWER(COALESCE(c.cliente_pk, '')) LIKE :busqueda
        OR LOWER(COALESCE(c.nombre, '')) LIKE :busqueda
    ))
    AND (:familia IS NULL OR LOWER(COALESCE(p.familia, '')) = LOWER(:familia))
    AND (:marca IS NULL OR LOWER(COALESCE(p.marca, '')) = LOWER(:marca))
    AND (:seccion IS NULL OR LOWER(COALESCE(p.seccion, '')) = LOWER(:seccion))
    AND (:product_manager IS NULL OR LOWER(COALESCE(p.product_manager, '')) = LOWER(:product_manager))
    AND (:tipo_cliente IS NULL OR LOWER(COALESCE(c.tipo_cliente, '')) = LOWER(:tipo_cliente))
    AND (:kd IS NULL OR LOWER(COALESCE(v.kd, '')) = LOWER(:kd))
    AND (:comercial_cliente IS NULL OR LOWER(COALESCE(c.comercial_cliente, '')) = LOWER(:comercial_cliente))
    AND (:comercial_factura IS NULL OR LOWER(COALESCE(v.comercial_factura, '')) = LOWER(:comercial_factura))
"""

SALES_EXPLORER_DATE_BINDS = (
    bindparam("fecha_desde", type_=Date),
    bindparam("fecha_hasta", type_=Date),
)


def _sales_explorer_query(query: str):
    """Conserva el tipo DATE incluso cuando un filtro llega vacío en PostgreSQL."""
    return text(query).bindparams(*SALES_EXPLORER_DATE_BINDS)


def _clean_filter(value: Optional[str]) -> Optional[str]:
    return value.strip() if value and value.strip() else None


def _sales_explorer_params(empresa_id: int, fecha_desde: Optional[date], fecha_hasta: Optional[date],
                           busqueda: Optional[str], familia: Optional[str], marca: Optional[str],
                           seccion: Optional[str], product_manager: Optional[str], tipo_cliente: Optional[str],
                           kd: Optional[str], comercial_cliente: Optional[str], comercial_factura: Optional[str]) -> dict:
    search = _clean_filter(busqueda)
    return {
        "empresa_id": empresa_id,
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "busqueda": f"%{search.casefold()}%" if search else None,
        "familia": _clean_filter(familia), "marca": _clean_filter(marca), "seccion": _clean_filter(seccion),
        "product_manager": _clean_filter(product_manager), "tipo_cliente": _clean_filter(tipo_cliente),
        "kd": _clean_filter(kd), "comercial_cliente": _clean_filter(comercial_cliente),
        "comercial_factura": _clean_filter(comercial_factura),
    }


@router.get("/sales-explorer")
def get_sales_explorer(
    page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=MAX_SALES_EXPLORER_LIMIT),
    fecha_desde: Optional[date] = Query(None), fecha_hasta: Optional[date] = Query(None),
    busqueda: Optional[str] = Query(None), familia: Optional[str] = Query(None), marca: Optional[str] = Query(None),
    seccion: Optional[str] = Query(None), product_manager: Optional[str] = Query(None),
    tipo_cliente: Optional[str] = Query(None), kd: Optional[str] = Query(None),
    comercial_cliente: Optional[str] = Query(None), comercial_factura: Optional[str] = Query(None),
    sort: str = Query("fecha_desc", pattern="^(fecha_desc|ventas_desc|margen_desc)$"),
    current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Detalle de ventas agrupado por fecha, producto y cliente para exploración operativa."""
    params = _sales_explorer_params(current_user.empresa_id, fecha_desde, fecha_hasta, busqueda, familia, marca,
                                    seccion, product_manager, tipo_cliente, kd, comercial_cliente, comercial_factura)
    joins = "FROM ventas_historicas v JOIN productos p ON p.id = v.producto_id LEFT JOIN clientes c ON c.id = v.cliente_id"
    totals = db.execute(_sales_explorer_query(f"""
        SELECT COALESCE(SUM(v.ingreso_total), 0) ventas_eur, COALESCE(SUM(v.cantidad_vendida), 0) unidades,
               COALESCE(SUM(v.margen_bruto_eur), 0) margen_eur, COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur,
               COUNT(DISTINCT v.producto_id) skus, COUNT(DISTINCT v.cliente_id) clientes
        {joins} WHERE {SALES_EXPLORER_WHERE}
    """), params).mappings().one()
    group_by = """v.fecha_venta, p.sku, p.nombre, p.familia, p.marca, p.seccion, p.product_manager,
                  c.cliente_pk, c.nombre, c.tipo_cliente, c.comercial_cliente, v.kd, v.comercial_factura"""
    total_records = db.execute(_sales_explorer_query(f"""
        SELECT COUNT(*) FROM (SELECT 1 {joins} WHERE {SALES_EXPLORER_WHERE} GROUP BY {group_by}) lineas
    """), params).scalar_one()
    order_by = {
        "ventas_desc": "ventas_eur DESC, fecha DESC",
        "margen_desc": "margen_eur DESC, fecha DESC",
        "fecha_desc": "fecha DESC, ventas_eur DESC",
    }[sort]
    rows = db.execute(_sales_explorer_query(f"""
        SELECT v.fecha_venta fecha, COALESCE(p.sku, 'SIN_SKU') sku, COALESCE(p.nombre, 'SIN_NOMBRE_ARTICULO') articulo,
               COALESCE(p.familia, 'Sin familia') familia, COALESCE(p.marca, 'Sin marca') marca,
               COALESCE(p.seccion, 'Sin sección') seccion, COALESCE(p.product_manager, 'Sin PM') product_manager,
               COALESCE(c.cliente_pk, 'SIN-CLIENTE') cliente_pk, COALESCE(c.nombre, 'Sin nombre cliente') cliente,
               COALESCE(c.tipo_cliente, 'Sin tipo') tipo_cliente, COALESCE(c.comercial_cliente, 'Sin comercial') comercial_cliente,
               COALESCE(v.kd, 'Sin KD') kd, COALESCE(v.comercial_factura, 'Sin comercial') comercial_factura,
               COALESCE(SUM(v.ingreso_total), 0) ventas_eur, COALESCE(SUM(v.cantidad_vendida), 0) unidades,
               COALESCE(SUM(v.margen_bruto_eur), 0) margen_eur, COALESCE(SUM(v.margen_destino_eur), 0) mgd_eur
        {joins} WHERE {SALES_EXPLORER_WHERE}
        GROUP BY {group_by} ORDER BY {order_by} LIMIT :limit OFFSET :offset
    """), {**params, "limit": limit, "offset": (page - 1) * limit}).mappings().all()

    def number(value) -> float:
        return float(value or 0)

    sales, margin, mgd = number(totals["ventas_eur"]), number(totals["margen_eur"]), number(totals["mgd_eur"])
    return {
        "rows": [{**dict(row), "fecha": str(row["fecha"]), "ventas_eur": number(row["ventas_eur"]),
                  "margen_eur": number(row["margen_eur"]), "mgd_eur": number(row["mgd_eur"]),
                  "unidades": int(row["unidades"] or 0)} for row in rows],
        "total_records": int(total_records), "page": page, "total_pages": max(1, (int(total_records) + limit - 1) // limit),
        "totals": {"ventas_eur": sales, "unidades": int(totals["unidades"] or 0), "margen_eur": margin,
                   "margen_pct": round(margin / sales * 100, 2) if sales else None, "mgd_eur": mgd,
                   "mgd_pct": round(mgd / abs(sales) * 100, 2) if sales else 0, "skus": int(totals["skus"] or 0),
                   "clientes": int(totals["clientes"] or 0)},
    }


@router.get("/sales-explorer/options")
def get_sales_explorer_options(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)):
    """Opciones de filtros de baja cardinalidad; artículo y cliente se buscan por texto."""
    options = {}
    dimensions = {
        "familias": "p.familia", "marcas": "p.marca", "secciones": "p.seccion", "product_managers": "p.product_manager",
        "tipos_cliente": "c.tipo_cliente", "kd": "v.kd", "comerciales_cliente": "c.comercial_cliente",
        "comerciales_factura": "v.comercial_factura",
    }
    for key, column in dimensions.items():
        options[key] = [row[0] for row in db.execute(text(f"""
            SELECT DISTINCT TRIM({column}) FROM ventas_historicas v
            JOIN productos p ON p.id = v.producto_id LEFT JOIN clientes c ON c.id = v.cliente_id
            WHERE p.empresa_id = :empresa_id AND NULLIF(TRIM({column}), '') IS NOT NULL ORDER BY TRIM({column})
        """), {"empresa_id": current_user.empresa_id}).all()]
    coverage = db.execute(text("""
        SELECT MIN(v.fecha_venta) fecha_min, MAX(v.fecha_venta) fecha_max FROM ventas_historicas v
        JOIN productos p ON p.id = v.producto_id WHERE p.empresa_id = :empresa_id
    """), {"empresa_id": current_user.empresa_id}).mappings().one()
    return {**options, "fecha_min": str(coverage["fecha_min"]) if coverage["fecha_min"] else None,
            "fecha_max": str(coverage["fecha_max"]) if coverage["fecha_max"] else None}


@router.get("/dashboard-executive")
def get_executive_dashboard(
    period: str = Query("fytd", pattern="^(fytd|90d|30d)$"),
    familia: Optional[str] = Query(None),
    marca: Optional[str] = Query(None),
    familia_marca: Optional[str] = Query(None),
    seccion: Optional[str] = Query(None),
    breakdown: str = Query("comercial", pattern="^(comercial|cliente|familia|marca|seccion)$"),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_executive_dashboard(
        db, current_user.empresa_id, period, familia, marca, familia_marca, seccion, breakdown
    )

@router.get("/inventory-abc", response_model=schemas.InventoryAnalyticsResponse)
def get_inventory_abc(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=MAX_INVENTORY_ANALYTICS_LIMIT),
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

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
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
    fecha_60d = datetime.now(ZoneInfo("Europe/Madrid")).date() - timedelta(days=60)
    
    ventas = db.query(VentaHistorica).filter(
        VentaHistorica.producto_id == producto_id,
        VentaHistorica.fecha_venta >= fecha_60d
    ).order_by(VentaHistorica.fecha_venta.asc()).limit(1000).all()

    historico = []
    for v in ventas:
        inventario_eur = (
            v.stock_disponible * producto.costo_unitario
            if producto.inventario is not None
            else None
        )
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
