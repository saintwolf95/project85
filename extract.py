from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd
import app.models as models

engine = create_engine('sqlite:///supplychain.db')
Session = sessionmaker(bind=engine)
db = Session()

# 1. Ventas historicas de una GPU
gpu = db.query(models.Producto).filter(models.Producto.familia == 'Tarjetas Gráficas').first()
ventas = pd.read_sql(db.query(models.VentaHistorica).filter(models.VentaHistorica.producto_id == gpu.id).order_by(models.VentaHistorica.fecha_venta).limit(5).statement, engine)
print('**Erosión de Precio (Primeros 5 días de una Tarjeta Gráfica)**')
print(ventas[['fecha_venta', 'cantidad_vendida', 'precio_unitario', 'ingreso_total']].to_string(index=False))
print('\n')

# 2. Clase AZ
az_skus = pd.read_sql(db.query(models.Producto.sku, models.Producto.familia, models.Producto.costo_unitario, models.InventarioSnapshot.stock_disponible).join(models.InventarioSnapshot).filter(models.InventarioSnapshot.stock_disponible > 200).limit(5).statement, engine)
print('**SKUs Falsos Positivos (Clase AZ)**')
print(az_skus.to_string(index=False))
