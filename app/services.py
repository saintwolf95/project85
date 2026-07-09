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

    # Obtener ventas históricas usando read_sql (extremadamente eficiente en memoria vs ORM)
    producto_ids = [p.Producto.id for p in productos]
    
    # Construir la query sin ejecutarla
    query = db.query(
        VentaHistorica.producto_id,
        VentaHistorica.ingreso_total,
        VentaHistorica.cantidad_vendida,
        VentaHistorica.fecha_venta
    ).filter(
        VentaHistorica.producto_id.in_(producto_ids),
        VentaHistorica.fecha_venta >= fecha_90_dias
    ).statement
    
    # Leer directamente de la BBDD a C/Numpy evitando objetos de Python
    df_ventas = pd.read_sql(query, db.bind)
    
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
    
    if df_ventas.empty:
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
        
        # Crear tabla pivote: filas = producto_id, columnas = fecha_venta
        vd_pivot = ventas_diarias.pivot(index='producto_id', columns='fecha_venta', values='cantidad_vendida').fillna(0)
        
        # Asegurar que todos los 90 días estén en las columnas
        dias_completos = pd.date_range(start=fecha_90_dias, end=hoy, freq='D')
        # Filter dias_completos to only those with dtype datetime64[ns]
        vd_pivot.columns = pd.to_datetime(vd_pivot.columns)
        vd_pivot = vd_pivot.reindex(columns=dias_completos, fill_value=0)
        
        # Calcular media y desviación estándar de forma vectorizada (muy rápido, nada de OOM)
        means = vd_pivot.mean(axis=1)
        stds = vd_pivot.std(axis=1, ddof=0)
        
        # Ignorar warning de división por cero
        with np.errstate(divide='ignore', invalid='ignore'):
            cvs = stds / means
        
        xyz_df = pd.DataFrame({
            "producto_id": vd_pivot.index,
            "cv": cvs.values,
            "ads": means.values
        })
        
        def assign_xyz(cv):
            if pd.isna(cv) or cv == np.inf: return "Z"
            if cv <= 0.2: return "X"
            elif cv <= 0.6: return "Y"
            else: return "Z"
            
        xyz_df["xyz"] = xyz_df["cv"].apply(assign_xyz)
        
        df = pd.merge(df, xyz_df, on="producto_id", how="left")
        df["xyz"] = df["xyz"].fillna("Z")
        df["ads"] = df["ads"].fillna(0.0)
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

def sync_metrics_to_db(db: Session, empresa_id: int):
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Iniciando sincronización de métricas ABC/XYZ a la base de datos...")
    try:
        from .models import ProductoMetricas
        metrics = calculate_inventory_metrics(db, empresa_id)
        
        # Limpiar métricas anteriores
        db.query(ProductoMetricas).delete()
        
        # Insertar nuevas métricas
        records = []
        for m in metrics:
            riesgos = m.get("riesgos_categorizados", [])
            riesgo_rotura = "Riesgo Rotura" in riesgos or "Alerta Rotura" in riesgos
            
            pm = ProductoMetricas(
                producto_id=m["producto_id"],
                abc=m["abc"],
                xyz=m["xyz"],
                matriz_abc=m["matriz_abc"],
                dias_cobertura=m["dias_cobertura"],
                riesgo_rotura=riesgo_rotura
            )
            records.append(pm)
        
        db.bulk_save_objects(records)
        
        # Calcular y guardar Estadísticas de Dashboard
        from .models import EmpresaEstadisticas
        import json
        
        total_skus = len(metrics)
        volumen_total = sum([m.get("unidades", 0) for m in metrics])
        costo_promedio = sum([m.get("costo_unit", 0) for m in metrics]) / total_skus if total_skus > 0 else 0
        
        fam_map = {}
        for m in metrics:
            fam_map[m.get("familia", "")] = fam_map.get(m.get("familia", ""), 0) + m.get("valor_inv", 0)
        familia_top = sorted(fam_map.keys(), key=lambda k: fam_map[k], reverse=True)[0] if fam_map else ""
        
        kpis = get_dashboard_kpis(metrics)
        
        abc_map = {"A": 0, "B": 0, "C": 0}
        for m in metrics:
            if m.get("abc") in abc_map:
                abc_map[m.get("abc")] += 1
        abc_data = [{"name": k, "value": v} for k, v in abc_map.items()]
        
        family_data = [{"name": k, "value": v} for k, v in fam_map.items()]
        family_data = sorted(family_data, key=lambda x: x["value"], reverse=True)
        
        stats = db.query(EmpresaEstadisticas).filter(EmpresaEstadisticas.empresa_id == empresa_id).first()
        if not stats:
            stats = EmpresaEstadisticas(empresa_id=empresa_id)
            db.add(stats)
            
        stats.total_skus = total_skus
        stats.volumen_total = volumen_total
        stats.costo_promedio = costo_promedio
        stats.familia_top = familia_top
        stats.valor_total_inventario = kpis["valor_total_inventario"]
        stats.total_alertas_criticas = kpis["total_alertas_criticas"]
        stats.salud_stock_clase_a = kpis["salud_stock_clase_a"]
        stats.abc_data = json.dumps(abc_data)
        stats.family_data = json.dumps(family_data)
        
        db.commit()
        logger.info(f"Sincronización completada. {len(records)} productos actualizados y estadísticas guardadas.")
    except Exception as e:
        logger.error(f"Error sincronizando métricas: {e}")
        db.rollback()
