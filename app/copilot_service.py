import os
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException

# Inicia el cliente de OpenAI. Por defecto buscará OPENAI_API_KEY en el entorno
client = OpenAI()

SCHEMA_PROMPT = """
Eres un experto en bases de datos y logística. 
Tu trabajo es responder a la pregunta del usuario generando EXCLUSIVAMENTE una consulta SQL válida para SQLite.
No incluyas explicaciones, ni etiquetas de markdown como ```sql. Devuelve únicamente el texto de la consulta SQL.

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
- familia (VARCHAR): Ej. 'Portátiles', 'Móviles', 'Tarjetas Gráficas'
- marca (VARCHAR): Ej. 'Apple', 'NVIDIA', 'ASUS'

Tabla `inventario`:
- producto_id (INTEGER, Primary Key, Foreign Key a productos.id)
- stock_disponible (INTEGER)

Tabla `ventas_historicas`:
- id (INTEGER, Primary Key)
- producto_id (INTEGER, Foreign Key a productos.id)
- fecha_venta (DATE)
- cantidad_vendida (INTEGER)
- ingreso_total (FLOAT)

Ejemplo 1:
Usuario: "¿Cuántos portátiles tenemos en stock en total?"
SELECT SUM(i.stock_disponible) FROM productos p JOIN inventario i ON p.id = i.producto_id WHERE p.familia = 'Portátiles';

Ejemplo 2:
Usuario: "¿Cuál es el valor total del inventario de Apple?"
SELECT SUM(i.stock_disponible * p.costo_unitario) FROM productos p JOIN inventario i ON p.id = i.producto_id WHERE p.marca = 'Apple';
"""

def generate_sql(pregunta: str, empresa_id: int) -> str:
    prompt = SCHEMA_PROMPT + f"\n\n¡REGLA DE SEGURIDAD CRÍTICA! TODAS tus consultas deben filtrar usando `p.empresa_id = {empresa_id}` (o un JOIN a productos si usas otras tablas) para evitar ver datos de otros clientes."
    
    response = client.chat.completions.create(
        model="gpt-4o",  # o gpt-3.5-turbo si la cuenta no soporta 4o
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": pregunta}
        ],
        temperature=0.0
    )
    
    sql_query = response.choices[0].message.content.strip()
    
    # Limpiar markdown si el modelo se niega a obedecer
    if sql_query.startswith("```sql"):
        sql_query = sql_query[6:]
    if sql_query.endswith("```"):
        sql_query = sql_query[:-3]
        
    return sql_query.strip()

def is_safe_query(sql_query: str) -> bool:
    dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE']
    query_upper = sql_query.upper()
    for kw in dangerous_keywords:
        # Check if keyword is in the query (simple safety check)
        # We add spaces to avoid matching substrings like "UPDATE" inside a string, 
        # but for a basic check, just checking keywords is a start.
        if f" {kw} " in f" {query_upper} ":
            return False
    return True

def execute_sql(db: Session, sql_query: str):
    if not is_safe_query(sql_query):
        raise HTTPException(status_code=400, detail="La consulta generada contiene operaciones no permitidas de modificación de datos.")
    
    try:
        result = db.execute(text(sql_query))
        rows = result.fetchall()
        # Convertir a una lista de diccionarios (o string representativo)
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in rows]
        return data
    except Exception as e:
        return {"error": str(e)}

def interpret_results(history: list, sql_query: str, raw_data: any) -> str:
    INTERPRET_PROMPT = f"""
Eres SupplyChain AI, un analista de operaciones y logística de nivel directivo (estilo McKinsey/BCG). Tu objetivo es ayudar al usuario a optimizar su inventario y reducir roturas de stock o capital inmovilizado.
Reglas de respuesta:
- NUNCA respondas con una sola línea. Tu respuesta debe ser un mini-informe.
- Usa formato Markdown: incluye títulos, viñetas (bullet points) y texto en negrita para resaltar los KPIs y el impacto financiero (€/$).
- Si la base de datos te devuelve datos, analízalos: ¿Es esto bueno o malo? ¿Qué recomendación de acción sugieres? (Ej: 'Sugiero pedir envío express').
- Actúa de forma proactiva. Si el usuario hace una pregunta abierta, ofrécele métricas adicionales relevantes.

Contexto Técnico Interno:
Consulta SQL ejecutada: {sql_query}
Resultado bruto de BD: {raw_data}
    """
    
    messages = [{"role": "system", "content": INTERPRET_PROMPT}]
    messages.extend(history)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.4,
        max_tokens=1500
    )
    
    return response.choices[0].message.content.strip()

def process_copilot_chat(db: Session, history: list, empresa_id: int) -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # 1. Generar SQL
    sql_query = generate_sql(user_message, empresa_id)
    
    # 2. Ejecutar y validar SQL
    raw_data = execute_sql(db, sql_query)
    
    # 3. Interpretar
    final_response = interpret_results(history, sql_query, raw_data)
    
    return final_response
