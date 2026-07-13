import json
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import AgentInsights
from app.copilot_service import get_openai_client

logger = logging.getLogger(__name__)

def run_maria_agent(db: Session, empresa_id: int):
    """
    Agente de Inventario (María) con 3 niveles de gravedad (ABC/XYZ).
    """
    alertas = []
    
    # NIVEL 3: GRAVEDAD CRÍTICA 🔴
    # 3.1 Quiebre Inminente en Clase A
    sql_n3_quiebre = """
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura <= 5
        AND i.stock_disponible > 0
        AND pm.abc = 'A'
        LIMIT 10
    """
    for row in db.execute(text(sql_n3_quiebre), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] María (Inventario): ¡ALERTA CRÍTICA! El producto estrella '{row[0]}' (Clase A) se quedará sin stock en {row[1]} días. Quedan solo {row[2]} unidades.")

    # 3.2 Rotura Activa (Ventas perdidas hoy)
    sql_rotura_activa = """
        SELECT p.nombre, pm.ventas_60d, pm.abc
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND i.stock_disponible = 0
        AND pm.ventas_60d > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_rotura_activa), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] María (Inventario): [PÉRDIDA] Producto '{row[0]}' (Clase {row[2]}) tiene stock cero pero demanda activa ({row[1]:.1f} ventas/60d). Estamos perdiendo ventas.")

    # 3.3 Capital Muerto Severo
    sql_n3_sobrestock = """
        SELECT p.nombre, pm.dias_cobertura, (i.stock_disponible * p.costo_unitario) as valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 180
        AND pm.xyz = 'Z'
        AND (i.stock_disponible * p.costo_unitario) > 1000
        LIMIT 10
    """
    for row in db.execute(text(sql_n3_sobrestock), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] María (Inventario): ¡CAPITAL MUERTO! Producto '{row[0]}' (Clase Z) inmovilizado {row[1]} días, reteniendo ${row[2]:.2f}.")

    # NIVEL 2: ADVERTENCIA 🟡
    # 2.1 Quiebre Inminente en Clase B
    sql_n2_quiebre_b = """
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura <= 5
        AND i.stock_disponible > 0
        AND pm.abc = 'B'
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_quiebre_b), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] María (Inventario): Advertencia de quiebre. Producto '{row[0]}' (Clase B) sin stock en {row[1]} días ({row[2]} unds).")

    # 2.2 Riesgo Cercano en Clase A
    sql_n2_riesgo_a = """
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 5 AND pm.dias_cobertura <= 15
        AND i.stock_disponible > 0
        AND pm.abc = 'A'
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_riesgo_a), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] María (Inventario): Riesgo cercano. Producto clave '{row[0]}' (Clase A) bajando a {row[1]} días de cobertura.")

    # 2.3 Sobre-stock Moderado
    sql_n2_sobrestock = """
        SELECT p.nombre, pm.dias_cobertura, (i.stock_disponible * p.costo_unitario) as valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 120 AND pm.dias_cobertura <= 180
        AND (i.stock_disponible * p.costo_unitario) > 500
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_sobrestock), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] María (Inventario): Sobre-stock moderado. Producto '{row[0]}' con {row[1]} días de inventario (${row[2]:.2f}).")

    # NIVEL 1: OPORTUNIDAD 🟢
    # 1.1 Exceso en Productos Dinámicos (A/B)
    sql_n1_exceso = """
        SELECT p.nombre, pm.abc, pm.dias_cobertura, (i.stock_disponible * p.costo_unitario) as valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc IN ('A', 'B')
        AND pm.dias_cobertura > 90 AND pm.dias_cobertura <= 120
        LIMIT 10
    """
    for row in db.execute(text(sql_n1_exceso), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] María (Inventario): Oportunidad de optimización. Producto '{row[0]}' (Clase {row[1]}) sano pero con demasiado stock ({row[2]} días).")

    # 1.2 Quiebre en Clase C
    sql_n1_quiebre_c = """
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura <= 5
        AND i.stock_disponible > 0
        AND pm.abc = 'C'
        LIMIT 10
    """
    for row in db.execute(text(sql_n1_quiebre_c), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] María (Inventario): Producto secundario '{row[0]}' (Clase C) próximo a quiebre en {row[1]} días.")

    return alertas

def run_lucia_agent(db: Session, empresa_id: int):
    """
    Agente de Ventas (Lucía) con 3 niveles de gravedad (ABC/XYZ).
    """
    alertas = []
    
    # NIVEL 3: GRAVEDAD CRÍTICA 🔴
    # 3.1 Estrellas Estancadas
    sql_n3_estancadas = """
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'A'
        AND pm.dias_cobertura > 60
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n3_estancadas), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] Lucía (Ventas): ¡ALERTA COMERCIAL! Producto estrella '{row[0]}' (Clase A) estancado con {row[1]} días de cobertura. Urge promoción.")

    # 3.2 Ventas Perdidas HOY
    sql_n3_stockout = """
        SELECT p.nombre, p.marca
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'A'
        AND i.stock_disponible = 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n3_stockout), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] Lucía (Ventas): ¡VENTAS PERDIDAS! Producto estrella '{row[0]}' ({row[1]}) está en CERO. Estamos perdiendo dinero hoy.")

    # NIVEL 2: ADVERTENCIA 🟡
    # 2.1 Potencial Desperdiciado
    sql_n2_potencial = """
        SELECT p.nombre, p.precio_venta, p.costo_unitario
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'B'
        AND pm.xyz = 'Z'
        AND p.precio_venta > (p.costo_unitario * 1.5)
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_potencial), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] Lucía (Ventas): Potencial desperdiciado. '{row[0]}' (Clase B) tiene demanda errática pero deja excelente margen (${row[1]} vs ${row[2]}). ¡Hagamos publicidad!")

    # 2.2 Acumulación Silenciosa
    sql_n2_acumulacion = """
        SELECT p.nombre, pm.dias_cobertura
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'B'
        AND pm.dias_cobertura > 90
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_acumulacion), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] Lucía (Ventas): Acumulación. Producto '{row[0]}' (Clase B) cayendo en ventas ({row[1]} días de stock). Sugiero leve descuento.")

    # NIVEL 1: OPORTUNIDAD 🟢
    # 1.1 Gemas Ocultas
    sql_n1_gemas = """
        SELECT p.nombre, pm.dias_cobertura
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'C'
        AND pm.dias_cobertura < 15
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n1_gemas), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] Lucía (Ventas): ¡Gema Oculta! Producto '{row[0]}' (Clase C) rotando muy rápido ({row[1]} días). Destácalo en la tienda.")

    # 1.2 Estrella Naciente
    sql_estrella = """
        SELECT p.nombre, pm.ventas_60d, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'C'
        AND pm.xyz = 'X'
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_estrella), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] Lucía (Ventas): [ESTRELLA] Producto '{row[0]}' era Clase C, pero ahora tiene demanda constante (XYZ=X, Ventas={row[1]:.1f}). Vigilar stock.")

    # 1.3 Candidatos para Combos
    sql_n1_combos = """
        SELECT p.nombre, pm.dias_cobertura
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 150
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n1_combos), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] Lucía (Ventas): Oportunidad de Cross-Selling. Arma un combo con '{row[0]}' para liberar sus {row[1]} días de stock.")

    return alertas

def run_mattia_agent(db: Session, empresa_id: int):
    """
    Agente de Finanzas (Mattia)
    Busca:
    1. Fuga de capital (precio <= costo)
    2. Capital estancado severo (Valor Inv > 1000 y Clase Z)
    """
    alertas = []
    
    # 1. Margen negativo
    sql_margen = """
        SELECT p.nombre, p.precio_venta, p.costo_unitario
        FROM productos p
        WHERE p.empresa_id = :empresa_id 
        AND p.precio_venta <= p.costo_unitario
        LIMIT 10
    """
    result_margen = db.execute(text(sql_margen), {"empresa_id": empresa_id}).fetchall()
    for row in result_margen:
        alertas.append(f"Mattia (Finanzas): ¡Pérdida detectada! Producto '{row[0]}' se vende a ${row[1]} pero cuesta ${row[2]}.")
        
    # 2. Margen estrecho en productos VIP
    sql_margen_estrecho = """
        SELECT p.nombre, p.precio_venta, p.costo_unitario
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'A'
        AND p.precio_venta < (p.costo_unitario * 1.10)
        AND p.precio_venta > p.costo_unitario
        LIMIT 10
    """
    result_margen_estrecho = db.execute(text(sql_margen_estrecho), {"empresa_id": empresa_id}).fetchall()
    for row in result_margen_estrecho:
        margen_pct = ((row[1] - row[2]) / row[1]) * 100
        alertas.append(f"Mattia (Finanzas): [ALERTA MARGEN] Producto Estrella '{row[0]}' tiene un margen muy estrecho ({margen_pct:.1f}%). Precio: ${row[1]}, Costo: ${row[2]}.")

    # 3. Capital estancado
    sql_estancado = """
        SELECT p.nombre, (i.stock_disponible * p.costo_unitario) as valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.xyz = 'Z'
        AND (i.stock_disponible * p.costo_unitario) > 1000
        LIMIT 10
    """
    result_estancado = db.execute(text(sql_estancado), {"empresa_id": empresa_id}).fetchall()
    for row in result_estancado:
        alertas.append(f"Mattia (Finanzas): [ESTANCADO] Tienes ${row[1]:.2f} bloqueados en el producto '{row[0]}' (Clase Z) que no se vende.")
        
    return alertas

def run_ceo_agent(alertas_fase1: list) -> str:
    """
    CEO IA (Consolidador)
    Recibe las alertas crudas y redacta un Executive Summary.
    """
    if not alertas_fase1:
        return "El sistema no detectó alertas críticas hoy."
        
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada para el CEO."
        
    prompt = f"""
    Eres el CEO IA (Director de Operaciones) de una empresa de retail/logística.
    Tus tres agentes (María de Inventario, Lucía de Ventas y Mattia de Finanzas) acaban de enviarte estas alertas crudas:
    
    {json.dumps(alertas_fase1, indent=2)}
    
    Tu tarea es sintetizar esto en un único "Executive Summary" (en Markdown).
    - Agrupa los problemas si están relacionados.
    - Destaca las 3 cosas más urgentes que el equipo humano debe resolver hoy.
    - No repitas los mensajes como robot, redáctalo como un líder estratégico.
    - Se directo, profesional y claro.
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "developer", "content": "Eres un CEO IA estratégico experto en Supply Chain."}, 
                      {"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Error en CEO IA: {e}")
        return "⚠️ Error al generar síntesis IA."

def execute_agents_workflow(db: Session, empresa_id: int, run_fase1: bool, run_fase2: bool):
    """
    Ejecuta el flujo completo dependiendo de los switches encendidos.
    """
    alertas_fase1 = []
    
    if run_fase1:
        alertas_fase1.extend(run_maria_agent(db, empresa_id))
        alertas_fase1.extend(run_lucia_agent(db, empresa_id))
        alertas_fase1.extend(run_mattia_agent(db, empresa_id))
        
    ceo_summary = None
    if run_fase2 and run_fase1: # Solo tiene sentido si la Fase 1 corrió para darle datos
        ceo_summary = run_ceo_agent(alertas_fase1)
    elif run_fase2 and not run_fase1:
        ceo_summary = "⚠️ El CEO IA está encendido, pero los agentes de Fase 1 están apagados. No hay datos para analizar."
        
    # Guardar insight
    insight = AgentInsights(
        empresa_id=empresa_id,
        fase1_raw_json=json.dumps(alertas_fase1) if alertas_fase1 else None,
        fase2_ceo_markdown=ceo_summary
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight
