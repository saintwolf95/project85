import random
import os
from datetime import date, timedelta
from sqlalchemy.orm import Session
from .models import Empresa, Producto, InventarioSnapshot, VentaHistorica, Usuario, Registro_PO

# ─────────────────────────────────────────────
# Catálogos de referencia (hardware B2B)
# ─────────────────────────────────────────────
FAMILIAS = [
    "Monitores", "Tarjetas Gráficas", "Cables/Adaptadores",
    "Portátiles", "Procesadores", "Memorias RAM",
    "Almacenamiento SSD", "Periféricos", "Redes/Switches", "Refrigeración"
]

MARCAS = {
    "Monitores":           ["LG", "Samsung", "Dell", "ASUS", "BenQ", "AOC", "Philips"],
    "Tarjetas Gráficas":   ["NVIDIA", "AMD", "ASUS", "MSI", "Gigabyte", "Sapphire", "XFX"],
    "Cables/Adaptadores":  ["Belkin", "Anker", "AmazonBasics", "Ugreen", "StarTech", "Club 3D"],
    "Portátiles":          ["HP", "Lenovo", "Dell", "ASUS", "Acer", "MSI", "Apple"],
    "Procesadores":        ["Intel", "AMD", "Qualcomm"],
    "Memorias RAM":        ["Kingston", "Crucial", "Corsair", "G.Skill", "Samsung"],
    "Almacenamiento SSD":  ["Samsung", "Western Digital", "Seagate", "Kingston", "Crucial", "Sabrent"],
    "Periféricos":         ["Logitech", "Razer", "SteelSeries", "Corsair", "HyperX", "Trust"],
    "Redes/Switches":      ["TP-Link", "Cisco", "Netgear", "D-Link", "Ubiquiti", "Zyxel"],
    "Refrigeración":       ["Noctua", "be quiet!", "Corsair", "Cooler Master", "Arctic", "NZXT"]
}

PRODUCT_MANAGERS = ["Carlos M.", "Laura G.", "Andrés T.", "Sofía R.", "Miguel V."]
SECCIONES       = ["Hardware", "Conectividad", "Periféricos", "Almacenamiento", "Networking"]

# Perfil de rotación por familia (ventas base diarias min/max)
ROTACION = {
    "Monitores":          (2, 8,   30, 45, 200.0, 900.0),
    "Tarjetas Gráficas":  (1, 5,   30, 45, 300.0, 1500.0),
    "Cables/Adaptadores": (15, 50,  7, 15,   5.0,  30.0),
    "Portátiles":         (1, 4,   21, 35, 500.0, 2500.0),
    "Procesadores":       (2, 7,   14, 30, 100.0,  700.0),
    "Memorias RAM":       (5, 20,  10, 20,  20.0,  200.0),
    "Almacenamiento SSD": (4, 15,  10, 21,  30.0,  250.0),
    "Periféricos":        (3, 12,   7, 14,  15.0,  150.0),
    "Redes/Switches":     (1, 6,   14, 28,  30.0,  400.0),
    "Refrigeración":      (2, 8,   10, 20,  20.0,  120.0),
}

def generar_ean():
    return str(random.randint(1000000000000, 9999999999999))

def generar_pn(marca, familia):
    prefijo = marca[:3].upper()
    return f"{prefijo}-{random.randint(1000, 99999)}-{familia[:3].upper()}"

def crear_datos_demo(db: Session):
    import calendar

    # ─── 1. Infraestructura Auth / Multi-Tenant (idempotente) ───
    empresa_demo = db.query(Empresa).filter(Empresa.nombre == "Logística Global Solutions (DEMO)").first()
    if not empresa_demo:
        empresa_demo = Empresa(nombre="Logística Global Solutions (DEMO)")
        db.add(empresa_demo)
        db.commit()
        db.refresh(empresa_demo)

    admin_user = db.query(Usuario).filter(Usuario.email == "admin@demo.com").first()
    uid_env = os.getenv("ADMIN_SUPABASE_UID", "34cf496c-0ca3-41db-bb63-b39078963a24")
    if not admin_user:
        admin_user = Usuario(
            empresa_id=empresa_demo.id,
            email="admin@demo.com",
            nombre="Administrador",
            supabase_uid=uid_env,
            rol="admin"
        )
        db.add(admin_user)
        db.commit()
    elif admin_user.supabase_uid != uid_env:
        admin_user.supabase_uid = uid_env
        db.commit()

    # ─── 2. Limpiar Supply Chain previo (preserva auth) ───
    db.query(Registro_PO).delete()
    db.query(VentaHistorica).delete()
    db.query(InventarioSnapshot).delete()
    db.query(Producto).filter(Producto.empresa_id == empresa_demo.id).delete()
    db.commit()

    # ─── 3. Generar 1000 SKUs ───
    TOTAL_SKUS = 6000
    familia_lista = list(FAMILIAS)

    # Inyección AZ: ~5% de GPUs/Portátiles con sobrestock tóxico
    az_count = max(8, int(TOTAL_SKUS * 0.05))
    az_targets = set(random.sample(range(TOTAL_SKUS), az_count))

    print(f"[seed] Generando {TOTAL_SKUS} SKUs...")
    productos_info = []  # lista de dicts para bulk logic posterior

    for i in range(TOTAL_SKUS):
        # Distribuir familias proporcionalmente entre los 1000 SKUs
        familia = familia_lista[i % len(familia_lista)]
        marca = random.choice(MARCAS[familia])
        vmin, vmax, lt_min, lt_max, c_min, c_max = ROTACION[familia]

        lead_time = random.randint(lt_min, lt_max)
        costo     = round(random.uniform(c_min, c_max), 2)

        # AZ: alto coste forzado
        if i in az_targets and familia in ("Tarjetas Gráficas", "Portátiles", "Procesadores"):
            costo = round(random.uniform(c_max * 0.8, c_max * 1.3), 2)

        precio = round(costo * random.uniform(1.25, 1.65), 2)

        prod = Producto(
            empresa_id=empresa_demo.id,
            sku=f"SKU-{10000 + i}",
            nombre=f"{familia} {marca} M-{i:04d}",
            costo_unitario=costo,
            precio_venta=precio,
            lead_time_dias=lead_time,
            part_number=generar_pn(marca, familia),
            ean=generar_ean(),
            peso=round(random.uniform(0.05, 8.0), 2),
            familia=familia,
            marca=marca,
            product_manager=random.choice(PRODUCT_MANAGERS),
            seccion=random.choice(SECCIONES),
        )
        db.add(prod)
        
        # Asignar perfil XYZ forzado para balancear (30% X, 40% Y, 30% Z)
        rand_xyz = random.random()
        if rand_xyz < 0.3:
            xyz_profile = 'X'
        elif rand_xyz < 0.7:
            xyz_profile = 'Y'
        else:
            xyz_profile = 'Z'
            
        productos_info.append({
            "idx": i,
            "orm": prod,
            "familia": familia,
            "is_az": i in az_targets,
            "xyz_profile": xyz_profile,
            "precio_base": precio,
            "costo": costo,
            "lead_time": lead_time,
            "vmin": vmin,
            "vmax": vmax,
        })

    db.commit()
    print(f"[seed] {TOTAL_SKUS} productos insertados.")

    # ─── 4. Histórico 90 días + Snapshot + PO ───
    DIAS = 90
    fecha_fin   = date.today()
    fecha_inicio = fecha_fin - timedelta(days=DIAS)

    ventas_bulk = []
    snapshot_bulk = []
    po_bulk = []

    print("[seed] Generando histórico de ventas (bulk)...")

    total_raw_sales = 0.0

    # Prmera pasada: Generar datos crudos (en tuplas ligeras para no ahogar la RAM)
    for p_info in productos_info:
        prod       = p_info["orm"]
        familia    = p_info["familia"]
        is_az      = p_info["is_az"]
        precio_act = p_info["precio_base"]
        vmin       = p_info["vmin"]
        vmax       = p_info["vmax"]
        lead_time  = p_info["lead_time"]
        xyz_profile = p_info["xyz_profile"]

        total_ud_90d = 0
        p_info["ventas_diarias"] = []

        for dia in range(DIAS):
            fecha_actual = fecha_inicio + timedelta(days=dia)

            # Erosión de precio GPUs/Portátiles (0.2% diario)
            if familia in ("Tarjetas Gráficas", "Portátiles"):
                precio_act = precio_act * 0.998

            # Peak fin de mes
            ultimo_dia = calendar.monthrange(fecha_actual.year, fecha_actual.month)[1]
            es_fin_mes = (ultimo_dia - fecha_actual.day) < 4

            # AZ: sin ventas los últimos 30 días
            if is_az and dia >= (DIAS - 30):
                cantidad = 0 if random.random() < 0.88 else 1
            else:
                if xyz_profile == 'X':
                    prob_sale = 0.98
                    base_qty = max(1, (vmin + vmax) // 2)
                    varianza = max(1, int(base_qty * 0.1))
                elif xyz_profile == 'Y':
                    prob_sale = 0.70
                    base_qty = max(1, (vmin + vmax) // 2)
                    varianza = max(1, int(base_qty * 0.4))
                else:
                    prob_sale = 0.25
                    base_qty = vmax
                    varianza = vmax

                if random.random() < prob_sale:
                    cantidad = random.randint(max(1, base_qty - varianza), base_qty + varianza)
                    if es_fin_mes and xyz_profile != 'X':
                        cantidad = int(cantidad * random.uniform(1.3, 1.8))
                else:
                    cantidad = 0

            total_ud_90d += cantidad

            if cantidad > 0:
                p_info["ventas_diarias"].append((dia, cantidad, precio_act))
                total_raw_sales += cantidad * precio_act

        # ─── Snapshot de inventario (raw) ───
        ads = total_ud_90d / DIAS
        if is_az:
            stock_final = random.randint(300, 800)
        else:
            safety = random.randint(5, 30)
            stock_final = max(0, int(ads * lead_time) + safety)

        p_info["stock_final_raw"] = stock_final

    # === ESCALADO FINANCIERO ===
    print("[seed] Aplicando escalado financiero para cumplir con los límites de 29M-30M/mes y <20M inventario...")
    
    # 1. Escalar Ventas
    if total_raw_sales > 0:
        target_sales_90d = random.uniform(87000000, 90000000)
        sales_factor = target_sales_90d / total_raw_sales
    else:
        sales_factor = 1.0

    total_inv_escalado = 0
    # Aplicar factor de ventas y calcular coste escalado para el inventario
    for p_info in productos_info:
        prod = p_info["orm"]
        prod.precio_venta = round(prod.precio_venta * sales_factor, 2)
        prod.costo_unitario = round(prod.costo_unitario * sales_factor, 2)
        p_info["costo_escalado"] = prod.costo_unitario
        total_inv_escalado += p_info["stock_final_raw"] * prod.costo_unitario

    # 2. Escalar Inventario
    if total_inv_escalado > 19999000:
        inv_factor = 19999000 / total_inv_escalado
    else:
        inv_factor = 1.0

    print("[seed] Generando dicts finales e insertando en lotes (batch)...")
    
    total_ventas_insertadas = 0

    # 3. Generar dicts finales y aplicar Bulk Insert por Lotes
    for p_info in productos_info:
        prod = p_info["orm"]
        stock_final = max(0, int(p_info["stock_final_raw"] * inv_factor))
        
        snapshot_bulk.append({
            "producto_id": prod.id,
            "stock_disponible": stock_final,
        })
        
        # Registro PO
        qs = max(1, stock_final // 2)
        delta = random.randint(-max(1, qs // 10), max(1, qs // 10))
        po_bulk.append({
            "producto_id":                prod.id,
            "fecha_orden":                fecha_fin - timedelta(days=random.randint(3, 15)),
            "cantidad_sugerida_algoritmo": qs,
            "cantidad_aprobada_usuario":   max(1, qs + delta),
            "motivo_modificacion":         None,
            "estado":                      "Aprobado",
        })

        for dia, cantidad, precio_act in p_info["ventas_diarias"]:
            fecha_actual = fecha_inicio + timedelta(days=dia)
            precio_unit_esc = round(precio_act * sales_factor, 2)
            
            ventas_bulk.append({
                "producto_id":     prod.id,
                "fecha_venta":     fecha_actual,
                "cantidad_vendida": cantidad,
                "precio_unitario": precio_unit_esc,
                "ingreso_total":   round(cantidad * precio_unit_esc, 2),
                "stock_disponible": 0,
            })
            
        # Bulk Insert VentaHistorica por lotes para no saturar la RAM (OOM)
        if len(ventas_bulk) >= 50000:
            db.bulk_insert_mappings(VentaHistorica, ventas_bulk)
            total_ventas_insertadas += len(ventas_bulk)
            ventas_bulk.clear()

    # Insertar el resto de ventas
    if ventas_bulk:
        db.bulk_insert_mappings(VentaHistorica, ventas_bulk)
        total_ventas_insertadas += len(ventas_bulk)
        ventas_bulk.clear()

    print(f"[seed] Insertando {len(snapshot_bulk):,} snapshots de inventario...")
    db.bulk_insert_mappings(InventarioSnapshot, snapshot_bulk)

    print(f"[seed] Insertando {len(po_bulk):,} registros PO...")
    db.bulk_insert_mappings(Registro_PO, po_bulk)

    db.commit()
    print(f"[seed] OK Completado: {TOTAL_SKUS} SKUs | {total_ventas_insertadas:,} ventas | {len(snapshot_bulk):,} snapshots | {len(po_bulk):,} POs")


if __name__ == "__main__":
    from .database import SessionLocal, engine
    from . import models
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        crear_datos_demo(db)
    finally:
        db.close()
