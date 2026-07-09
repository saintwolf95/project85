import pandas as pd
from sqlalchemy.orm import Session
from datetime import date, timedelta
from cachetools import cached, TTLCache
from .models import Producto, InventarioSnapshot, VentaHistorica

# Caché de 5 minutos (300 segundos) para almacenar métricas por empresa
metrics_cache = TTLCache(maxsize=10, ttl=300)

def metrics_cache_key(db: Session, empresa_id: int):
    return hash(empresa_id)

@cached(metrics_cache, key=metrics_cache_key)
def calculate_inventory_metrics(db: Session, empresa_id: int):
    # Obtener productos e inventario
    productos = db.query(Producto, InventarioSnapshot).join(
        InventarioSnapshot, Producto.id == InventarioSnapshot.producto_id
    ).filter(Producto.empresa_id == empresa_id).all()

    if not productos:
        return []

    # Fechas para los filtros (90 días)
    hoy = date.today()
    fecha_90_dias = hoy - timedelta(days=90)
    fecha_30_dias = hoy - timedelta(days=30)

    # Obtener ventas históricas usando solo las columnas necesarias (evita OOM)
    producto_ids = [p.Producto.id for p in productos]
    ventas = db.query(
        VentaHistorica.producto_id,
        VentaHistorica.ingreso_total,
        VentaHistorica.cantidad_vendida,
        VentaHistorica.fecha_venta
    ).filter(
        VentaHistorica.producto_id.in_(producto_ids),
        VentaHistorica.fecha_venta >= fecha_90_dias
    ).all()

    # DataFrames
    df_prod = pd.DataFrame([{
        "producto_id": p.Producto.id,
        "sku": p.Producto.sku,
        "nombre": p.Producto.nombre,
        "costo_unitario": p.Producto.costo_unitario,
        "precio_venta": p.Producto.precio_venta,
        "lead_time_dias": p.Producto.lead_time_dias,
        "part_number": p.Producto.part_number or "",
        "ean": p.Producto.ean or "",
        "peso": p.Producto.peso or 0.0,
        "familia": p.Producto.familia or "",
        "marca": p.Producto.marca or "",
        "product_manager": p.Producto.product_manager or "",
        "seccion": p.Producto.seccion or "",
        "stock_disponible": p.InventarioSnapshot.stock_disponible
    } for p in productos])

    if ventas:
        df_ventas = pd.DataFrame(ventas, columns=["producto_id", "ingreso_total", "cantidad_vendida", "fecha_venta"])
    else:
        df_ventas = pd.DataFrame(columns=["producto_id", "ingreso_total", "cantidad_vendida", "fecha_venta"])

    # 1. Ventas totales y Unidades vendidas últimos 60 días
    if not df_ventas.empty:
        ventas_60 = df_ventas.groupby("producto_id").agg({
            "ingreso_total": "sum",
            "cantidad_vendida": "sum"
        }).reset_index()
        ventas_60 = ventas_60.rename(columns={
            "ingreso_total": "ventas_60d",
            "cantidad_vendida": "unidades_venta_60d"
        })
    else:
        ventas_60 = pd.DataFrame({
            "producto_id": df_prod["producto_id"], 
            "ventas_60d": 0.0, 
            "unidades_venta_60d": 0
        })

    df = pd.merge(df_prod, ventas_60, on="producto_id", how="left")
    df["ventas_60d"] = df["ventas_60d"].fillna(0.0)
    df["unidades_venta_60d"] = df["unidades_venta_60d"].fillna(0)

    # 2. Eje ABC (Valor de Inventario)
    df["valor_inv"] = df["costo_unitario"] * df["stock_disponible"]
    df = df.sort_values(by="valor_inv", ascending=False).reset_index(drop=True)
    df["porcentaje_inv"] = df["valor_inv"] / df["valor_inv"].sum() if df["valor_inv"].sum() > 0 else 0
    df["acum_inv"] = df["porcentaje_inv"].cumsum()

    def clasificar_abc(acumulado):
        if acumulado <= 0.80: return "A"
        if acumulado <= 0.95: return "B"
        return "C"

    df["abc"] = df["acum_inv"].apply(clasificar_abc)
    if df["valor_inv"].sum() == 0:
        df["abc"] = "C"

    # 3. Eje XYZ (Volatilidad de la Demanda)
    import numpy as np

    if not df_ventas.empty:
        # Agrupar por producto y fecha para tener la demanda diaria exacta
        ventas_diarias = df_ventas.groupby(["producto_id", "fecha_venta"])["cantidad_vendida"].sum().reset_index()
        
        # Generar un grid de los 90 días para todos los productos con ventas
        dias_completos = pd.date_range(start=fecha_90_dias, end=hoy, freq='D')
        
        def calcular_cv(prod_id):
            vd = ventas_diarias[ventas_diarias["producto_id"] == prod_id]
            venta_total = vd["cantidad_vendida"].sum()
            
            if venta_total == 0:
                return pd.Series({"cv": np.nan, "xyz": "Z", "ads": 0.0})
                
            # Rellenar ceros para los días sin venta
            vd_completo = vd.set_index("fecha_venta").reindex(dias_completos, fill_value=0)
            
            mean = vd_completo["cantidad_vendida"].mean()
            std = vd_completo["cantidad_vendida"].std(ddof=0)
            
            if mean == 0: # Salvaguarda
                return pd.Series({"cv": np.nan, "xyz": "Z", "ads": 0.0})
                
            cv = std / mean
            if cv <= 0.2:
                xyz = "X"
            elif cv <= 0.6:
                xyz = "Y"
            else:
                xyz = "Z"
                
            return pd.Series({"cv": cv, "xyz": xyz, "ads": mean})
            
        xyz_metrics = df["producto_id"].apply(calcular_cv)
        df = pd.concat([df, xyz_metrics], axis=1)
    else:
        df["cv"] = np.nan
        df["xyz"] = "Z"
        df["ads"] = 0.0

    df["matriz_abc"] = df["abc"] + df["xyz"]

    # 4 & 5. Días de Cobertura y Riesgos Categorizados
    def calcular_riesgos(row):
        stock = row["stock_disponible"]
        ads = row["ads"]
        lead_time = row["lead_time_dias"]
        riesgos = []

        if stock <= 1:
            dias_cobertura = 0.0 if stock == 0 else (stock / ads if ads > 0 else 999.0)
            riesgos.append("Alerta Rotura")
        elif ads == 0:
            dias_cobertura = 999.0
            riesgos.append("Riesgo Comercial")
            if stock > 0:
                riesgos.append("Riesgo Financiero") # Si no vende y hay stock
        else:
            dias_cobertura = stock / ads
            if dias_cobertura <= lead_time:
                riesgos.append("Riesgo Rotura")
            if dias_cobertura > 120:
                riesgos.append("Riesgo Financiero")

        return pd.Series({"dias_cobertura": float(dias_cobertura), "riesgos_categorizados": riesgos})

    riesgos_df = df.apply(calcular_riesgos, axis=1)
    df = pd.concat([df, riesgos_df], axis=1)

    # Transformar a las columnas finales esperadas por el esquema (Dataset 14 Columnas)
    df["fecha"] = hoy.strftime("%Y-%m-%d")
    df["nombre_art"] = df["nombre"]
    df["cod_art"] = df["sku"]
    df["pn"] = df["part_number"].astype(str)
    df["ean"] = df["ean"].astype(str)
    df["costo_unit"] = df["costo_unitario"]
    df["peso"] = df["peso"]
    df["familia"] = df["familia"]
    df["marca"] = df["marca"]
    df["precio_unit"] = df["precio_venta"]
    df["unidades"] = df["stock_disponible"]
    df["valor_inv"] = df["costo_unitario"] * df["stock_disponible"]
    
    df["product_manager"] = df["product_manager"]
    df["seccion"] = df["seccion"]
    
    # Preparar el resultado como diccionarios
    columnas_finales = [
        "producto_id", "fecha", "nombre_art", "cod_art", "pn", "ean", "costo_unit", "peso", 
        "familia", "marca", "product_manager", "seccion", "precio_unit", "unidades", "valor_inv", "unidades_venta_60d", "ventas_60d",
        "abc", "xyz", "cv", "matriz_abc", "ads", "dias_cobertura", "riesgos_categorizados"
    ]
    df_final = df[columnas_finales]
    resultados = df_final.to_dict(orient="records")
    return resultados

def get_dashboard_kpis(metrics: list) -> dict:
    df = pd.DataFrame(metrics)
    if df.empty:
        return {
            "valor_total_inventario": 0.0,
            "total_alertas_criticas": 0,
            "salud_stock_clase_a": 0
        }

    valor_total = df["valor_inv"].sum()
    
    # Calcular alertas totales basándose en si existe 'Riesgo Rotura' o 'Alerta Rotura'
    def has_rotura(riesgos):
        return "Riesgo Rotura" in riesgos or "Alerta Rotura" in riesgos
        
    df["has_rotura"] = df["riesgos_categorizados"].apply(has_rotura)
    alertas_totales = int(df["has_rotura"].sum())
    
    clase_a = df[df["abc"] == "A"]
    alertas_clase_a = int(clase_a["has_rotura"].sum()) if not clase_a.empty else 0

    return {
        "valor_total_inventario": float(valor_total),
        "total_alertas_criticas": alertas_totales,
        "salud_stock_clase_a": alertas_clase_a
    }
