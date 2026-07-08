import os
import logging
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

# Configuración de Logger de Auditoría
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
# Añadir un stream handler si no lo tiene para forzar la salida por consola
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

client = OpenAI()

SCHEMA_PROMPT = """
Eres un experto en bases de datos y logística. 
Tu trabajo es responder a la pregunta del usuario generando EXCLUSIVAMENTE una consulta SQL válida para SQLite.
No incluyas explicaciones, ni etiquetas de markdown. Devuelve únicamente el texto de la consulta SQL.

El esquema de la base de datos es el siguiente:

Tabla `productos`:
- id (INTEGER, Primary Key)
- empresa_id (INTEGER)
- sku (VARCHAR)
- nombre (VARCHAR)
- costo_unitario (FLOAT)
- precio_venta (FLOAT)
- lead_time_dias (INTEGER)
- part_number (VARCHAR)
- ean (VARCHAR)
- peso (FLOAT)
- familia (VARCHAR)
- marca (VARCHAR)

Tabla `inventario_snapshot`:
- producto_id (INTEGER, Primary Key, Foreign Key a productos.id)
- stock_disponible (INTEGER)

Tabla `ventas_historicas`:
- id (INTEGER, Primary Key)
- producto_id (INTEGER, Foreign Key a productos.id)
- fecha_venta (DATE)
- cantidad_vendida (INTEGER)
- precio_unitario (FLOAT)
- ingreso_total (FLOAT)
- stock_disponible (INTEGER)

Tabla `registro_po`:
- id (INTEGER, Primary Key)
- producto_id (INTEGER, Foreign Key a productos.id)
- fecha_orden (DATE)
- cantidad_sugerida_algoritmo (INTEGER)
- cantidad_aprobada_usuario (INTEGER)
- motivo_modificacion (VARCHAR)
- estado (VARCHAR)
"""

def generate_sql(pregunta: str, empresa_id: int) -> str:
    prompt = SCHEMA_PROMPT + f"\n\n¡REGLA DE SEGURIDAD CRÍTICA! TODAS tus consultas deben filtrar usando `p.empresa_id = {empresa_id}` (o un JOIN a productos si usas otras tablas) para evitar ver datos de otros clientes."
    
    client = get_openai_client()
    if not client:
        return "SELECT 'Error: API Key de OpenAI no configurada' AS error"
        
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": pregunta}
        ],
        temperature=0.0
    )
    
    sql_query = response.choices[0].message.content.strip()
    
    if sql_query.startswith("```sql"):
        sql_query = sql_query[6:]
    if sql_query.startswith("```"):
        sql_query = sql_query[3:]
    if sql_query.endswith("```"):
        sql_query = sql_query[:-3]
        
    return sql_query.strip()

def execute_sql(db: Session, sql_query: str):
    logger.info(f"[AUDIT SQL] Query generada interceptada: {sql_query}")
    try:
        result = db.execute(text(sql_query))
        rows = result.fetchall()
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in rows]
        return data, None
    except Exception as e:
        logger.error(f"[AUDIT SQL] Fallo de ejecución: {str(e)}")
        return None, str(e)

def interpret_results(history: list, sql_query: str, raw_data: any, error: str = None) -> str:
    if error:
        return "⚠️ **Fallo en la consulta de datos.**\n\nLa consulta generada por el asistente intentó acceder a datos o columnas inexistentes. Por seguridad, la operación fue abortada y no se reintentará automáticamente para no consumir recursos.\n\nPor favor, reformula tu pregunta utilizando términos exactos del negocio."

    INTERPRET_PROMPT = f"""
Eres SupplyChain AI, un analista de operaciones y logística de nivel directivo. 
Tu objetivo es ayudar al usuario a optimizar su inventario y responder exactamente lo que preguntó basado EN LOS DATOS EXACTOS proporcionados.
Reglas:
- NUNCA inventes o deduzcas datos numéricos que no estén en "Resultado bruto de BD".
- Usa formato Markdown: incluye viñetas y negritas para métricas.

Contexto Técnico Interno (No muestres el SQL al usuario, solo los insights):
Consulta SQL ejecutada: {sql_query}
Resultado bruto de BD: {raw_data}
    """
    
    messages = [{"role": "system", "content": INTERPRET_PROMPT}]
    messages.extend(history)

    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada en el servidor."

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.2,
        max_tokens=1000
    )
    
    return response.choices[0].message.content.strip()

def process_copilot_chat(db: Session, history: list, empresa_id: int) -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # 1. Generar SQL
    sql_query = generate_sql(user_message, empresa_id)
    
    # 2. Ejecutar SQL en la conexión RO
    raw_data, error = execute_sql(db, sql_query)
    
    # 3. Interpretar
    final_response = interpret_results(history, sql_query, raw_data, error)
    
    return final_response
