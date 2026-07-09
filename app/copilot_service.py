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

def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        return OpenAI(api_key=api_key)
    except Exception:
        return None
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

def generate_sql(pregunta: str, empresa_id: int, model_preference: str = "fast") -> str:
    prompt = SCHEMA_PROMPT + f"\n\n¡REGLA DE SEGURIDAD CRÍTICA! TODAS tus consultas deben filtrar usando `p.empresa_id = {empresa_id}` (o un JOIN a productos si usas otras tablas) para evitar ver datos de otros clientes."
    
    client = get_openai_client()
    if not client:
        return "SELECT 'Error: API Key de OpenAI no configurada' AS error"
        
    if model_preference == "thinking":
        model_name = "o1-mini"
        messages = [
            {"role": "user", "content": f"Instrucciones del sistema:\n{prompt}\n\nPregunta del usuario:\n{pregunta}"}
        ]
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages
            )
        except Exception as e:
            error_msg = str(e)
            if "model_not_found" in error_msg or "does not exist" in error_msg:
                return "SELECT '⚠️ Tu clave de OpenAI no tiene nivel (Tier) suficiente para usar los modelos o1 (Thinking). Por favor, cambia a modo Fast (gpt-4o).' AS error"
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Generación SQL Thinking): {error_msg}", exc_info=True)
            return "SELECT 'Error de comunicación con el motor de IA. Inténtalo de nuevo más tarde.' AS error"
    else:
        model_name = "gpt-4o"
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": pregunta}
        ]
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.0
            )
        except Exception as e:
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Generación SQL): {str(e)}", exc_info=True)
            return "SELECT 'Error de comunicación con el motor de IA. Inténtalo de nuevo más tarde.' AS error"
    
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
    
    # C1: SQL Injection Protection - ONLY allow SELECT
    sql_upper = sql_query.upper().strip()
    if not sql_upper.startswith("SELECT"):
        logger.error("[AUDIT SQL] Abortado: La query no comienza con SELECT")
        return None, "Error de seguridad: Solo se permiten operaciones de lectura (SELECT)."
    
    # Reject dangerous keywords even if it starts with SELECT
    dangerous_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE", "EXEC", "CALL"]
    for word in dangerous_keywords:
        if f" {word} " in f" {sql_upper} ":
            logger.error(f"[AUDIT SQL] Abortado: Palabra prohibida detectada ({word})")
            return None, "Error de seguridad: La consulta contiene palabras reservadas no permitidas."

    try:
        # Añadir un timeout simple a nivel de base de datos si es postgres (opcional pero recomendado)
        # SQLite no soporta set_statement_timeout fácilmente desde sqlalchemy text(), pero protegemos contra inyección destructiva.
        result = db.execute(text(sql_query))
        rows = result.fetchall()
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in rows]
        return data, None
    except Exception as e:
        logger.error(f"[AUDIT SQL] Fallo de ejecución: {str(e)}")
        # M2: Do not expose raw exception string to the client
        return None, "La consulta SQL no pudo ejecutarse. Verifica que los nombres de las tablas y columnas sean correctos."

def interpret_results(history: list, sql_query: str, raw_data: any, error: str = None, model_preference: str = "fast") -> str:
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
    
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada en el servidor."

    if model_preference == "thinking":
        model_name = "o1-preview"
        # Para o1-preview transformamos el system prompt en el primer mensaje de usuario
        messages = [{"role": "user", "content": INTERPRET_PROMPT}]
        
        # history viene con formato {"role": "...", "content": "..."}
        # o1-preview no soporta "system", asumimos que todo history es user/assistant
        for msg in history:
            role = msg["role"]
            if role == "system":
                role = "user"
            messages.append({"role": role, "content": msg["content"]})
            
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages
            )
        except Exception as e:
            error_msg = str(e)
            if "model_not_found" in error_msg or "does not exist" in error_msg:
                return "⚠️ **Nivel de API Insuficiente:** Tu clave de OpenAI no tiene permisos para acceder a los modelos avanzados de razonamiento (`o1-preview` o `o1-mini`). Por favor, cambia al modo **Fast (gpt-4o)** en la barra inferior."
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Interpretación Thinking): {error_msg}", exc_info=True)
            return "⚠️ **Error de comunicación:** No se pudo obtener la interpretación de la IA en este momento."
    else:
        model_name = "gpt-4o"
        messages = [{"role": "system", "content": INTERPRET_PROMPT}]
        messages.extend(history)
        
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=1000
            )
        except Exception as e:
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Interpretación): {str(e)}", exc_info=True)
            return "⚠️ **Error de comunicación:** No se pudo obtener la interpretación de la IA en este momento."
    
    return response.choices[0].message.content.strip()

def process_copilot_chat(db: Session, history: list, empresa_id: int, model_preference: str = "fast") -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # 1. Generar SQL
    sql_query = generate_sql(user_message, empresa_id, model_preference)
    
    # 2. Ejecutar SQL en la conexión RO
    raw_data, error = execute_sql(db, sql_query)
    
    # 3. Interpretar
    final_response = interpret_results(history, sql_query, raw_data, error, model_preference)
    
    return final_response
