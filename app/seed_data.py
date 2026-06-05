import random
from datetime import date, timedelta
from sqlalchemy.orm import Session
from .models import Empresa, Producto, Inventario, VentaHistorica, Usuario
from .core.security import get_password_hash

# Catálogos reales
FAMILIAS = ["Portátiles", "Móviles", "Ordenadores", "Tarjetas Gráficas", "Reproductores", "Periféricos", "Monitores"]
MARCAS_TEC = {
    "Portátiles": ["Apple", "Dell", "Lenovo", "HP", "Asus", "Acer"],
    "Móviles": ["Apple", "Samsung", "Xiaomi", "Google", "OnePlus", "Motorola"],
    "Ordenadores": ["Apple", "Dell", "HP", "Lenovo", "Corsair"],
    "Tarjetas Gráficas": ["NVIDIA", "AMD", "ASUS", "MSI", "Gigabyte"],
    "Reproductores": ["Sony", "Bose", "JBL", "Sennheiser", "Apple"],
    "Periféricos": ["Logitech", "Razer", "Corsair", "SteelSeries", "HyperX"],
    "Monitores": ["LG", "Samsung", "Dell", "ASUS", "BenQ", "AOC"]
}

def generar_ean():
    return str(random.randint(1000000000000, 9999999999999))

def generar_pn(marca, familia):
    prefijo = marca[:3].upper()
    return f"{prefijo}-{random.randint(100, 9999)}-{familia[:3].upper()}"

def crear_datos_demo(db: Session):
    # 1. Crear Empresa Demo
    empresa_demo = Empresa(nombre="Logística Global Solutions (DEMO)")
    db.add(empresa_demo)
    db.commit()
    db.refresh(empresa_demo)

    admin_user = Usuario(
        empresa_id=empresa_demo.id,
        email="admin@demo.com",
        nombre="Administrador",
        hashed_password=get_password_hash("123456"),
        rol="admin"
    )
    db.add(admin_user)
    db.commit()

    # 2. Generar 1000 Productos en Tiers para distribuir la Matriz 3x3
    productos_creados = []
    
    # Distribución de tiers (Total 1000):
    # Tier 1 (AA): 50 productos. Alta venta, alto inventario
    # Tier 2 (AB, BA): 150 productos. Venta/inv alto-medio
    # Tier 3 (AC, CA): 100 productos. Venta alta/inv bajo, o viceversa
    # Tier 4 (BB): 200 productos. Medio
    # Tier 5 (BC, CB): 250 productos. Medio-bajo
    # Tier 6 (CC): 250 productos. Baja venta, bajo inventario

    def generar_producto(i, tier):
        familia = random.choice(FAMILIAS)
        marca = random.choice(MARCAS_TEC[familia])
        
        # Base ranges per tier
        if tier == 1: # AA
            costo = random.uniform(800.0, 1500.0)
            stock_r = (50, 100)
            prob_venta = 0.95
            cant_venta_r = (5, 15)
        elif tier == 2: # AB, BA
            costo = random.uniform(300.0, 800.0)
            stock_r = (30, 80)
            prob_venta = 0.80
            cant_venta_r = (3, 8)
        elif tier == 3: # AC, CA
            if random.choice([True, False]): # AC
                costo = random.uniform(50.0, 200.0)
                stock_r = (5, 20)
                prob_venta = 0.90
                cant_venta_r = (10, 30)
            else: # CA
                costo = random.uniform(500.0, 1200.0)
                stock_r = (100, 200)
                prob_venta = 0.10
                cant_venta_r = (1, 2)
        elif tier == 4: # BB
            costo = random.uniform(100.0, 400.0)
            stock_r = (40, 100)
            prob_venta = 0.50
            cant_venta_r = (2, 5)
        elif tier == 5: # BC, CB
            costo = random.uniform(50.0, 150.0)
            stock_r = (20, 50)
            prob_venta = 0.30
            cant_venta_r = (1, 3)
        else: # CC
            costo = random.uniform(10.0, 80.0)
            stock_r = (10, 30)
            prob_venta = 0.10
            cant_venta_r = (1, 2)

        peso = random.uniform(0.5, 3.5)
        nombre = f"{familia.upper()} {marca.upper()} MODELO-{i}"
        precio = round(costo * 1.4, 2)
        costo = round(costo, 2)
        peso = round(peso, 2)
        lead_time = random.choice([7, 14, 30])
        # Mapping de PM y Sección
        pm_map = {
            "Portátiles": "JAC", "Monitores": "JAC",
            "Móviles": "AMI",
            "Ordenadores": "LKT",
            "Tarjetas Gráficas": "UCR",
            "Reproductores": "TDS", "Periféricos": "TDS"
        }
        seccion_map = {
            "Portátiles": "Informática", "Monitores": "Informática", "Ordenadores": "Informática",
            "Móviles": "Telefonía",
            "Tarjetas Gráficas": "Componentes",
            "Reproductores": "Audio",
            "Periféricos": "Accesorios"
        }
        
        prod = Producto(
            empresa_id=empresa_demo.id,
            sku=f"SKU-{1000+i}",
            nombre=nombre,
            costo_unitario=costo,
            precio_venta=precio,
            lead_time_dias=lead_time,
            part_number=generar_pn(marca, familia),
            ean=generar_ean(),
            peso=peso,
            familia=familia,
            marca=marca,
            product_manager=pm_map.get(familia, "JAC"),
            seccion=seccion_map.get(familia, "General")
        )
        return prod, stock_r, prob_venta, cant_venta_r

    tiers_distribution = (
        [1] * 50 +
        [2] * 150 +
        [3] * 100 +
        [4] * 200 +
        [5] * 250 +
        [6] * 250
    )
    random.shuffle(tiers_distribution)

    for i, tier in enumerate(tiers_distribution, 1):
        prod, stock_r, prob_venta, cant_venta_r = generar_producto(i, tier)
        db.add(prod)
        productos_creados.append((prod, stock_r, prob_venta, cant_venta_r))
    
    db.commit()

    # 3. Inventario y Ventas (Últimos 90 días)
    fecha_inicio = date.today() - timedelta(days=90)
    for prod, stock_r, prob_venta, cant_venta_r in productos_creados:
        current_stock = random.randint(*stock_r)
        
        for dia in range(90):
            fecha_actual = fecha_inicio + timedelta(days=dia)
            cantidad = 0
            if random.random() < prob_venta:
                cantidad = random.randint(*cant_venta_r)
                
                # Simular venta
                current_stock -= cantidad
                
                # Simular reabastecimiento si quiebra stock
                if current_stock < 0:
                    current_stock += random.randint(*stock_r) + cantidad

                db.add(VentaHistorica(
                    producto_id=prod.id,
                    fecha_venta=fecha_actual,
                    cantidad_vendida=cantidad,
                    ingreso_total=round(cantidad * prod.precio_venta, 2),
                    stock_disponible=current_stock
                ))
            else:
                # Aunque no haya venta, guardamos el registro para tener el histórico de stock coherente cada día
                db.add(VentaHistorica(
                    producto_id=prod.id,
                    fecha_venta=fecha_actual,
                    cantidad_vendida=0,
                    ingreso_total=0.0,
                    stock_disponible=current_stock
                ))
                
        # El inventario actual es el stock del último día
        db.add(Inventario(producto_id=prod.id, stock_disponible=current_stock))

    db.commit()
