import json
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocalRO
from app.models import AgentInsights
from app.copilot_service import get_openai_client, validate_read_only_sql

logger = logging.getLogger(__name__)

def ejecutar_consulta_sql(db: Session, query: str, empresa_id: int) -> str:
    """Ejecuta una consulta SQL segura (sólo SELECT)."""
    safe_query, params, validation_error = validate_read_only_sql(query, empresa_id)
    if validation_error:
        return validation_error
    
    db_ro = SessionLocalRO()
    try:
        result = db_ro.execute(text(safe_query), params).fetchall()
        
        # Convert to JSON string, limit to 20 rows
        data = []
        for row in result[:20]:
            try:
                data.append(dict(row._mapping))
            except:
                data.append(str(row))
        return json.dumps(data)
    except Exception as e:
        return f"Error en la consulta: {str(e)}"
    finally:
        db_ro.close()

def run_cognitive_agent(db: Session, empresa_id: int, agent_name: str, system_prompt: str, alertas: list) -> str:
    """Ejecuta un agente cognitivo con GPT-4o y Tool Calling."""
    if not alertas:
        return f"No hay alertas matemáticas críticas para {agent_name} hoy."
        
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada."

    tools = [
        {
            "type": "function",
            "function": {
                "name": "ejecutar_consulta_sql",
                "description": "Ejecuta una consulta SQL SELECT en la base de datos para obtener más contexto sobre un producto o alerta. Tablas: productos, producto_metricas, inventario_snapshot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": f"Consulta SQL (solo SELECT). DEBES incluir 'WHERE empresa_id = {empresa_id}' (o un JOIN adecuado con productos.empresa_id = {empresa_id}) para no ver datos de otras empresas."
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    ]

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Estas son las alertas matemáticas generadas por el sistema base:\n\n{json.dumps(alertas, indent=2)}\n\nAnaliza estos datos, usa la herramienta SQL si necesitas contexto extra de algún producto (por ejemplo su precio, su stock histórico, etc.), y redacta tu informe departamental en Markdown."}
    ]

    try:
        max_iterations = 5
        iteration = 0
        
        while iteration < max_iterations:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=tools,
                temperature=0.2
            )
            message = response.choices[0].message
            
            if not message.tool_calls:
                return message.content
                
            messages.append(message)
            for tool_call in message.tool_calls:
                if tool_call.function.name == "ejecutar_consulta_sql":
                    args = json.loads(tool_call.function.arguments)
                    query = args.get("query", "")
                    sql_result = ejecutar_consulta_sql(db, query, empresa_id)
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_call.function.name,
                        "content": sql_result
                    })
            iteration += 1
            
        return messages[-1].get("content", "Error: Se alcanzó el límite de iteraciones del agente.")

    except Exception as e:
        logger.error(f"Error en agente cognitivo {agent_name}: {e}")
        return f"⚠️ Error al generar informe de {agent_name}."

def run_maria_agent(db: Session, empresa_id: int):
    alertas = []
    
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

    # 3.2 Rotura Activa
    sql_rotura_activa = """
        SELECT p.nombre, pm.abc
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND i.stock_disponible = 0
        AND pm.abc IN ('A', 'B')
        LIMIT 10
    """
    for row in db.execute(text(sql_rotura_activa), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] María (Inventario): [PÉRDIDA] Producto '{row[0]}' (Clase {row[1]}) tiene stock cero y pertenece a una clase relevante de ventas. Estamos perdiendo ventas.")

    # 3.3 Capital Muerto Severo
    sql_n3_sobrestock = """
        SELECT p.nombre, pm.dias_cobertura, (i.stock_disponible * p.costo_unitario) as valor_inv
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.dias_cobertura > 180
        AND (i.stock_disponible * p.costo_unitario) > 1000
        LIMIT 10
    """
    for row in db.execute(text(sql_n3_sobrestock), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🔴 Nivel 3] María (Inventario): ¡CAPITAL MUERTO! Producto '{row[0]}' inmovilizado {row[1]} días, reteniendo ${row[2]:.2f}.")

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

    sys_prompt = """Eres María, Gestora de Inventario Senior. Eres pragmática, obsesionada con la disponibilidad y detestas el capital inmovilizado.
Se te entregará un JSON con datos de inventario problemático. 
Tu tarea es analizar los datos y generar un reporte operativo directo. No uses saludos.

Formato obligatorio de salida (Markdown):
### 📦 Análisis Operativo - [Fecha]
**Diagnóstico Rápido:** [1 oración contundente sobre la salud del stock]
**Fugas Críticas:**
- [SKU] - [Razón del riesgo de rotura o exceso] - **Acción:** [Qué hacer hoy]
**Capital Muerto:** [Análisis breve de productos Z inmovilizados]"""
    md_report = run_cognitive_agent(db, empresa_id, "María", sys_prompt, alertas)
    
    return alertas, md_report

def run_lucia_agent(db: Session, empresa_id: int):
    alertas = []
    
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

    # 2.1 Potencial Desperdiciado
    sql_n2_potencial = """
        SELECT p.nombre, p.precio_venta, p.costo_unitario
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'B'
        AND p.precio_venta > (p.costo_unitario * 1.5)
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_n2_potencial), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟡 Nivel 2] Lucía (Ventas): Potencial desperdiciado. '{row[0]}' (Clase B) tiene inventario disponible y deja excelente margen (${row[1]} vs ${row[2]}). ¡Hagamos publicidad!")

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
        SELECT p.nombre, pm.dias_cobertura, i.stock_disponible
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND pm.abc = 'C'
        AND i.stock_disponible > 0
        LIMIT 10
    """
    for row in db.execute(text(sql_estrella), {"empresa_id": empresa_id}).fetchall():
        alertas.append(f"[🟢 Nivel 1] Lucía (Ventas): [ESTRELLA] Producto '{row[0]}' era Clase C y mantiene inventario disponible ({row[1]} días de cobertura). Vigilar su evolución.")

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

    sys_prompt = """Eres Lucía, Directora de Ventas. Tu enfoque es maximizar ingresos, rotación y detectar oportunidades ocultas (cross-selling, tendencias).
Analiza el JSON proporcionado que contiene alertas comerciales. Eres agresiva comercialmente y vas al grano. No uses saludos.

Formato obligatorio de salida (Markdown):
### 📈 Inteligencia Comercial - [Fecha]
**Termómetro de Ventas:** [1 oración sobre el momentum actual]
**Estrellas en Riesgo:** 
- [SKU Clase A] - [Impacto de no tener stock o estar estancado]
**Oportunidades Inmediatas:**
- [SKU Clase C con tracción o producto B estancado] - **Estrategia:** [Promoción, liquidación, bundle]"""
    md_report = run_cognitive_agent(db, empresa_id, "Lucía", sys_prompt, alertas)
    
    return alertas, md_report

def run_mattia_agent(db: Session, empresa_id: int):
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
        AND pm.dias_cobertura > 180
        AND (i.stock_disponible * p.costo_unitario) > 1000
        LIMIT 10
    """
    result_estancado = db.execute(text(sql_estancado), {"empresa_id": empresa_id}).fetchall()
    for row in result_estancado:
        alertas.append(f"Mattia (Finanzas): [ESTANCADO] Tienes ${row[1]:.2f} bloqueados en el producto '{row[0]}' con cobertura excesiva.")
        
    # 4. Gemas de Margen (Alta Rentabilidad)
    sql_alta_rentabilidad = """
        SELECT p.nombre, p.precio_venta, p.costo_unitario
        FROM producto_metricas pm
        JOIN productos p ON p.id = pm.producto_id
        JOIN inventario_snapshot i ON i.producto_id = p.id
        WHERE p.empresa_id = :empresa_id 
        AND p.precio_venta > (p.costo_unitario * 2)
        AND i.stock_disponible > 0
        LIMIT 10
    """
    result_alta_rentabilidad = db.execute(text(sql_alta_rentabilidad), {"empresa_id": empresa_id}).fetchall()
    for row in result_alta_rentabilidad:
        margen_pct = ((row[1] - row[2]) / row[1]) * 100
        alertas.append(f"Mattia (Finanzas): [OPORTUNIDAD] El producto '{row[0]}' concentra inventario y tiene un margen altísimo del {margen_pct:.1f}%. Revisar inversión y rotación.")

    sys_prompt = """Eres Mattia, CFO. Eres analítico, conservador y mides todo en ROI, márgenes y flujo de caja.
Analiza el JSON de métricas financieras. Busca márgenes negativos y capital atrapado. No uses saludos.

Formato obligatorio de salida (Markdown):
### 💶 Auditoría Financiera - [Fecha]
**Estado del Capital:** [1 oración sobre la eficiencia del gasto en inventario]
**Hemorragias de Margen:**
- [SKU] - [Diferencia costo/precio] - **Decisión:** [Ajustar precio o descatalogar]
**Eficiencia (ABC/XYZ):** [Breve evaluación de ventas ABC y concentración de inventario XYZ]"""
    md_report = run_cognitive_agent(db, empresa_id, "Mattia", sys_prompt, alertas)
    
    return alertas, md_report

def run_ceo_agent(maria_md: str, lucia_md: str, mattia_md: str) -> str:
    """
    CEO IA (Consolidador) usando el modelo o1-preview.
    """
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada para el CEO."
        
    prompt = f"""
Eres el CEO de la compañía. Has recibido tres reportes de tus directores (María, Lucía, Mattia).
Tu trabajo es sintetizar esta información, resolver conflictos entre sus enfoques (ej. Lucía quiere vender, Mattia exige margen) y dictar las 3 prioridades absolutas para la empresa hoy.

=== REPORTE INVENTARIO (MARÍA) ===
{maria_md if maria_md else 'Sin datos.'}

=== REPORTE VENTAS (LUCÍA) ===
{lucia_md if lucia_md else 'Sin datos.'}

=== REPORTE FINANZAS (MATTIA) ===
{mattia_md if mattia_md else 'Sin datos.'}

Formato obligatorio de salida (Markdown):
## 🏛️ Executive Summary

**Visión Global:** [Síntesis de 2 líneas]

**🔥 Top 3 Acciones Inmediatas (Prioridad Ejecutiva):**
1. **[Área]**: [Acción específica] (Basado en el reporte de [Agente])
2. **[Área]**: [Acción específica] (Basado en el reporte de [Agente])
3. **[Área]**: [Acción específica] (Basado en el reporte de [Agente])

---
*Reportes adjuntos del Gabinete (mantén el formato Markdown original de cada agente debajo de esta línea):*

{maria_md if maria_md else ''}

{lucia_md if lucia_md else ''}

{mattia_md if mattia_md else ''}
"""
    
    try:
        try:
            # Intentar primero con la familia o1
            response = client.chat.completions.create(
                model="o1",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
        except Exception as e:
            if "does not exist" in str(e) or "access" in str(e) or "model_not_found" in str(e):
                logger.warning(f"Modelo o1 no accesible. Cayendo a gpt-4o. Detalle: {e}")
                fallback_response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "Eres el Director de Operaciones IA. Actúa de forma analítica y profunda."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3
                )
                return fallback_response.choices[0].message.content
            raise e
        
    except Exception as e:
        logger.error(f"Error en CEO IA: {e}")
        return f"⚠️ Error al generar síntesis IA con CEO: {e}"

def execute_agents_workflow(db: Session, empresa_id: int, run_fase1: bool, run_fase2: bool):
    """
    Ejecuta el flujo completo dependiendo de los switches encendidos.
    """
    alertas_fase1 = []
    maria_md, lucia_md, mattia_md = None, None, None
    
    if run_fase1:
        a_maria, maria_md = run_maria_agent(db, empresa_id)
        a_lucia, lucia_md = run_lucia_agent(db, empresa_id)
        a_mattia, mattia_md = run_mattia_agent(db, empresa_id)
        alertas_fase1 = a_maria + a_lucia + a_mattia
        
    ceo_summary = None
    if run_fase2 and run_fase1:
        ceo_summary = run_ceo_agent(maria_md, lucia_md, mattia_md)
    elif run_fase2 and not run_fase1:
        ceo_summary = "⚠️ El CEO IA está encendido, pero los agentes departamentales están apagados. No hay reportes para sintetizar."
        
    insight = AgentInsights(
        empresa_id=empresa_id,
        fase1_raw_json=json.dumps(alertas_fase1) if alertas_fase1 else None,
        fase1_maria_md=maria_md,
        fase1_lucia_md=lucia_md,
        fase1_mattia_md=mattia_md,
        fase2_ceo_markdown=ceo_summary
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight

def process_agent_chat(db: Session, empresa_id: int, agent_name: str, history: list) -> str:
    """Procesa el chat conversacional con un agente específico, inyectando su memoria de 7 días."""
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada."

    # 1. Recuperar últimos 7 días de insights
    insights = db.query(AgentInsights).filter(
        AgentInsights.empresa_id == empresa_id
    ).order_by(AgentInsights.fecha.desc()).limit(7).all()

    # 2. Extraer memoria específica del agente
    memoria_md = ""
    for insight in reversed(insights):
        fecha_str = insight.fecha.strftime("%Y-%m-%d %H:%M")
        if agent_name.lower() == "maría" and insight.fase1_maria_md:
            memoria_md += f"\n--- Reporte del {fecha_str} ---\n{insight.fase1_maria_md}\n"
        elif agent_name.lower() == "lucía" and insight.fase1_lucia_md:
            memoria_md += f"\n--- Reporte del {fecha_str} ---\n{insight.fase1_lucia_md}\n"
        elif agent_name.lower() == "mattia" and insight.fase1_mattia_md:
            memoria_md += f"\n--- Reporte del {fecha_str} ---\n{insight.fase1_mattia_md}\n"
        elif agent_name.lower() == "ceo" and insight.fase2_ceo_markdown:
            memoria_md += f"\n--- Reporte del {fecha_str} ---\n{insight.fase2_ceo_markdown}\n"

    if not memoria_md.strip():
        memoria_md = "No tienes reportes generados en los últimos días."

    # 3. Construir System Prompt blindado
    if agent_name.lower() == "maría":
        sys_prompt = f"Eres María, Analista Experta de Inventario de la empresa. Habla siempre en primera persona como María. Tu único objetivo es analizar el inventario, quiebres de stock, excesos y días de cobertura. Si te preguntan sobre finanzas o ventas, debes decir educadamente que ese no es tu rol y derivarlos a Mattia o Lucía. Basa tus respuestas en tu memoria de los últimos 7 días:\n{memoria_md}"
    elif agent_name.lower() == "lucía":
        sys_prompt = f"Eres Lucía, Analista Experta de Ventas de la empresa. Habla siempre en primera persona como Lucía. Tu único objetivo es analizar ventas, rotación de productos, oportunidades de promoción y demanda estancada. Si te preguntan sobre inventario o finanzas profundas, debes decir educadamente que ese no es tu rol y derivarlos a María o Mattia. Basa tus respuestas en tu memoria de los últimos 7 días:\n{memoria_md}"
    elif agent_name.lower() == "mattia":
        sys_prompt = f"Eres Mattia, Analista Experto Financiero de la empresa. Habla siempre en primera persona como Mattia. Tu único objetivo es analizar rentabilidad, márgenes, capital inmovilizado y costos. Si te preguntan sobre logística o ventas, debes decir educadamente que ese no es tu rol y derivarlos a María o Lucía. Basa tus respuestas en tu memoria de los últimos 7 días:\n{memoria_md}"
    elif agent_name.lower() == "ceo":
        sys_prompt = f"Eres el CEO IA (Director de Operaciones). Habla siempre en primera persona como el CEO. Tu objetivo es dar visión estratégica global basada en los reportes de tus directores. Basa tus respuestas en tu memoria de los últimos 7 días:\n{memoria_md}"
    else:
        sys_prompt = f"Eres un asistente analítico basado en estos reportes:\n{memoria_md}"

    messages = [{"role": "system", "content": sys_prompt}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    tools = [
        {
            "type": "function",
            "function": {
                "name": "ejecutar_consulta_sql",
                "description": "Ejecuta una consulta SQL SELECT en la base de datos para responder a las preguntas del usuario. ABC usa ventas EUR de los últimos 90 días y XYZ usa inventario EUR actual. Tablas: productos (id, nombre, empresa_id, precio_venta, costo_unitario, marca, familia), producto_metricas (producto_id, dias_cobertura, abc, xyz, riesgo_rotura), inventario_snapshot (producto_id, stock_disponible), ventas_historicas (fecha_venta, cantidad_vendida, ingreso_total).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": f"Consulta SQL (solo SELECT). DEBES incluir 'WHERE empresa_id = {empresa_id}' o un JOIN con productos donde p.empresa_id = {empresa_id}."
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    ]

    try:
        max_iterations = 5
        iteration = 0
        
        while iteration < max_iterations:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=tools,
                temperature=0.3
            )
            message = response.choices[0].message
            
            if not message.tool_calls:
                return message.content
                
            messages.append(message)
            for tool_call in message.tool_calls:
                if tool_call.function.name == "ejecutar_consulta_sql":
                    args = json.loads(tool_call.function.arguments)
                    query = args.get("query", "")
                    sql_result = ejecutar_consulta_sql(db, query, empresa_id)
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_call.function.name,
                        "content": sql_result
                    })
            iteration += 1
            
        return messages[-1].get("content", "Error: Se alcanzó el límite de iteraciones buscando datos.")
    except Exception as e:
        logger.error(f"Error en chat con {agent_name}: {e}")
        return f"⚠️ Error al chatear con {agent_name}."
