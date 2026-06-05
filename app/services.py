import pandas as pd
from sqlalchemy.orm import Session
from datetime import date, timedelta
from cachetools import cached, TTLCache
from .models import Producto, Inventario, VentaHistorica

# Caché de 5 minutos (300 segundos) para almacenar métricas por empresa
metrics_cache = TTLCache(maxsize=10, ttl=300)

def metrics_cache_key(db: Session, empresa_id: int):
    return hash(empresa_id)

@cached(metrics_cache, key=metrics_cache_key)
def calculate_inventory_metrics(db: Session, empresa_id: int):
    # Obtener productos e inventario
    productos = db.query(Producto, Inventario).join(
        Inventario, Producto.id == Inventario.producto_id
    ).filter(Producto.empresa_id == empresa_id).all()

    if not productos:
        return []

    # Fechas para los filtros (60 y 30 días)
    hoy = date.today()
    fecha_60_dias = hoy - timedelta(days=60)
    fecha_30_dias = hoy - timedelta(days=30)

    # Obtener ventas históricas
    producto_ids = [p.Producto.id for p in productos]
    ventas = db.query(VentaHistorica).filter(
        VentaHistorica.producto_id.in_(producto_ids),
        VentaHistorica.fecha_venta >= fecha_60_dias
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
        "stock_disponible": p.Inventario.stock_disponible
    } for p in productos])

    df_ventas = pd.DataFrame([{
        "producto_id": v.producto_id,
        "ingreso_total": v.ingreso_total,
        "cantidad_vendida": v.cantidad_vendida,
        "fecha_venta": v.fecha_venta
    } for v in ventas]) if ventas else pd.DataFrame(columns=["producto_id", "ingreso_total", "cantidad_vendida", "fecha_venta"])

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

    # 2. Clasificación ABC Doble
    def clasificar_abc(acumulado):
        if acumulado <= 0.80: return "A"
        if acumulado <= 0.95: return "B"
        return "C"

    # ABC Ventas
    df = df.sort_values(by="ventas_60d", ascending=False).reset_index(drop=True)
    df["porcentaje_ventas"] = df["ventas_60d"] / df["ventas_60d"].sum() if df["ventas_60d"].sum() > 0 else 0
    df["acum_ventas"] = df["porcentaje_ventas"].cumsum()
    df["abc_ventas"] = df["acum_ventas"].apply(clasificar_abc)
    if df["ventas_60d"].sum() == 0:
        df["abc_ventas"] = "C"

    # ABC Inventario
    df["valor_inv"] = df["costo_unitario"] * df["stock_disponible"]
    df = df.sort_values(by="valor_inv", ascending=False).reset_index(drop=True)
    df["porcentaje_inv"] = df["valor_inv"] / df["valor_inv"].sum() if df["valor_inv"].sum() > 0 else 0
    df["acum_inv"] = df["porcentaje_inv"].cumsum()
    df["abc_inventario"] = df["acum_inv"].apply(clasificar_abc)
    if df["valor_inv"].sum() == 0:
        df["abc_inventario"] = "C"

    df["matriz_abc"] = df["abc_ventas"] + df["abc_inventario"]

    # 3. Promedio Diario de Ventas (ADS) últimos 30 días
    if not df_ventas.empty:
        df_30 = df_ventas[df_ventas["fecha_venta"] >= fecha_30_dias]
        ventas_30 = df_30.groupby("producto_id")["cantidad_vendida"].sum().reset_index()
        # Se divide entre 30 días exactos para el promedio diario
        ventas_30["ads"] = ventas_30["cantidad_vendida"] / 30.0
    else:
        ventas_30 = pd.DataFrame({"producto_id": df_prod["producto_id"], "ads": 0.0})

    df = pd.merge(df, ventas_30[["producto_id", "ads"]], on="producto_id", how="left")
    df["ads"] = df["ads"].fillna(0.0)

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
        "abc_ventas", "abc_inventario", "matriz_abc", "ads", "dias_cobertura", "riesgos_categorizados"
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
    
    clase_a = df[df["abc_ventas"] == "A"]
    alertas_clase_a = int(clase_a["has_rotura"].sum()) if not clase_a.empty else 0

    return {
        "valor_total_inventario": float(valor_total),
        "total_alertas_criticas": alertas_totales,
        "salud_stock_clase_a": alertas_clase_a
    }
