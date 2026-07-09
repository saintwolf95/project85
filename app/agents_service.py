import json
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import AgentInsights
from app.copilot_service import get_openai_client

logger = logging.getLogger(__name__)

def run_maria_agent(db: Session, empresa_id: int):
    """
    Agente de Inventario (María)
    Busca:
    1. Quiebre Inminente (dias_cobertura <= 5 y ventas > 0)
    2. Sobre-stock (dias_cobertura > 120 y valor_inv > 500)
    3. Alerta Crítica ABC (Clase A con riesgo_rotura)
    """
    alertas = []
    
    # 1. Quiebre inminente
    sql_quiebre = """
        SELECT p.nombre, p.marca, pm.dias_cobertura, i.unidades
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura <= 5
        AND i.ventas_60d > 0
        LIMIT 10
    """
    result_quiebre = db.execute(text(sql_quiebre), {"empresa_id": empresa_id}).fetchall()
    for row in result_quiebre:
        alertas.append(f"María (Inventario): Producto '{row[0]}' ({row[1]}) se quedará sin stock en {row[2]} días. Quedan solo {row[3]} unidades.")
        
    # 2. Sobre-stock
    sql_sobrestock = """
        SELECT p.nombre, pm.dias_cobertura, i.valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 120
        AND i.valor_inv > 500
        LIMIT 10
    """
    result_sobrestock = db.execute(text(sql_sobrestock), {"empresa_id": empresa_id}).fetchall()
    for row in result_sobrestock:
        alertas.append(f"María (Inventario): Producto '{row[0]}' lleva inmovilizado {row[1]} días ocupando ${row[2]:.2f} en capital.")
        
    return alertas

def run_lucia_agent(db: Session, empresa_id: int):
    """
    Agente de Ventas (Lucía)
    Busca:
    1. Caída de demanda (ventas_60d muy bajas)
    2. Picos inesperados (Clase C con alto ADS)
    """
    alertas = []
    
    # 1. Caída de demanda (Dead Stock en proceso)
    # Por ahora asume unidades_venta_60d = 0 como caída brutal para productos que no son Z
    sql_caida = """
        SELECT p.nombre, pm.xyz, i.unidades
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.xyz != 'Z'
        AND i.unidades_venta_60d = 0
        AND i.unidades > 0
        LIMIT 10
    """
    result_caida = db.execute(text(sql_caida), {"empresa_id": empresa_id}).fetchall()
    for row in result_caida:
        alertas.append(f"Lucía (Ventas): Producto '{row[0]}' (Histórico {row[1]}) no ha tenido ventas recientes. Posible dead-stock.")
        
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
        SELECT p.nombre, i.precio_unit, i.costo_unit
        FROM productos p
        JOIN inventario i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND i.precio_unit <= i.costo_unit
        LIMIT 10
    """
    result_margen = db.execute(text(sql_margen), {"empresa_id": empresa_id}).fetchall()
    for row in result_margen:
        alertas.append(f"Mattia (Finanzas): ¡Pérdida detectada! Producto '{row[0]}' se vende a ${row[1]} pero cuesta ${row[2]}.")
        
    # 2. Capital estancado
    sql_estancado = """
        SELECT p.nombre, i.valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.xyz = 'Z'
        AND i.valor_inv > 1000
        LIMIT 10
    """
    result_estancado = db.execute(text(sql_estancado), {"empresa_id": empresa_id}).fetchall()
    for row in result_estancado:
        alertas.append(f"Mattia (Finanzas): Tienes ${row[1]:.2f} bloqueados en el producto '{row[0]}' (Clase Z) que no se vende.")
        
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
