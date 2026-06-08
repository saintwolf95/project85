import pandas as pd
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import app.services as services
import app.models as models

engine = create_engine('sqlite:///supplychain.db')
Session = sessionmaker(bind=engine)
db = Session()

# 1. Obtener métricas y encontrar un SKU 'AX'
metrics = services.calculate_inventory_metrics(db, 1)
df = pd.DataFrame(metrics)

# Filtrar por clase AX
ax_items = df[df['matriz_abc'] == 'AX']

if ax_items.empty:
    print("No se encontró ningún SKU 'AX'. Seleccionando el mejor candidato 'A' o el primero.")
    # Fallback si no hay AX estricto debido a la aleatoriedad, buscar A algo
    ax_items = df[df['matriz_abc'].str.startswith('A')]
    
ax_item = ax_items.iloc[0]
producto_id = int(ax_item['producto_id'])
sku = ax_item['cod_art']
lead_time = int(ax_item.get('lead_time_dias', 30)) # Si no está en df, buscar en bd

# Obtener lead_time real de DB
prod_db = db.query(models.Producto).filter(models.Producto.id == producto_id).first()
lead_time = prod_db.lead_time_dias

print(f"--- FASE 4: Traza de Reposición para SKU: {sku} (Clase {ax_item['matriz_abc']}) ---")
print(f"Lead Time original: {lead_time} días")

# 2. Forzar rotura de stock
inv = db.query(models.InventarioSnapshot).filter(models.InventarioSnapshot.producto_id == producto_id).first()
stock_anterior = inv.stock_disponible
inv.stock_disponible = 0
db.commit()
print(f"[1] Stock forzado a 0 (Anterior: {stock_anterior}).")

# 3. Calcular Algoritmo de Reposición
# Demanda Media Diaria (Dm) = Ventas totales últimos 90 días / 90
ventas = db.query(models.VentaHistorica).filter(models.VentaHistorica.producto_id == producto_id).all()
ventas_90 = sum(v.cantidad_vendida for v in ventas)
dm = ventas_90 / 90.0

# Stock de Seguridad (SS) = Dm * (LeadTime * 0.5)
ss = dm * (lead_time * 0.5)

# Punto de Pedido (ROP) = (Dm * LeadTime) + SS
rop = (dm * lead_time) + ss

# Cantidad Sugerida (Qs) = ROP - Stock_actual - Stock_transito
stock_transito = 0 # MVP
qs = rop - inv.stock_disponible - stock_transito
qs_final = max(0, int(round(qs)))

print(f"[2] Lógica Algorítmica Calculada:")
print(f"    - Ventas totales (90d): {ventas_90}")
print(f"    - Dm: {dm:.2f}")
print(f"    - SS: {ss:.2f}")
print(f"    - ROP: {rop:.2f}")
print(f"    - Qs (Cantidad Sugerida Algorítmica): {qs_final}")

# 4. Override del Usuario
override_usuario = qs_final + 50
motivo = "El fabricante ha subido precios, adelanto compras"

print(f"[3] Intervención Humana:")
print(f"    - Nueva Cantidad Aprobada: {override_usuario}")
print(f"    - Motivo: {motivo}")

# 5. Insertar en Registro_PO
nueva_po = models.Registro_PO(
    producto_id=producto_id,
    fecha_orden=date.today(),
    cantidad_sugerida_algoritmo=qs_final,
    cantidad_aprobada_usuario=override_usuario,
    motivo_modificacion=motivo,
    estado="Aprobado"
)
db.add(nueva_po)
db.commit()
db.refresh(nueva_po)

print("\n--- VALIDACIÓN FINAL EN BASE DE DATOS ---")
po_bd = db.query(models.Registro_PO).filter(models.Registro_PO.id == nueva_po.id).first()

output = pd.DataFrame([{
    "registro_po_id": po_bd.id,
    "sku": prod_db.sku,
    "cantidad_sugerida_algoritmo": po_bd.cantidad_sugerida_algoritmo,
    "cantidad_aprobada_usuario": po_bd.cantidad_aprobada_usuario,
    "motivo_modificacion": po_bd.motivo_modificacion,
    "estado": po_bd.estado
}])

print(output.to_string(index=False))
