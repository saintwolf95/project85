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

def cleanup_old_chats(db: Session, usuario_id: int):
    from datetime import datetime, timedelta
    from .models import CopilotChat
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    try:
        db.query(CopilotChat).filter(
            CopilotChat.usuario_id == usuario_id,
            CopilotChat.actualizado_en < thirty_days_ago
        ).delete()
        db.commit()
    except Exception as e:
        logger.error(f"Error limpiando chats antiguos: {e}")
        db.rollback()
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

Tabla `producto_metricas`:
- producto_id (INTEGER, Primary Key, Foreign Key a productos.id)
- abc (VARCHAR) -- Clasificación Pareto por Ventas (A, B, C)
- xyz (VARCHAR) -- Clasificación Pareto por Inventario (X, Y, Z)
- matriz_abc (VARCHAR) -- Cuadrante de Doble Análisis (ej: AX, BY, CZ)
- dias_cobertura (FLOAT)
- riesgo_rotura (BOOLEAN)
"""

def generate_sql(pregunta: str, empresa_id: int, model_preference: str = "fast", contexto: str = "") -> str:
    prompt = SCHEMA_PROMPT + f"\n\n¡REGLA DE SEGURIDAD CRÍTICA! TODAS tus consultas deben filtrar usando `p.empresa_id = {empresa_id}` (o un JOIN a productos si usas otras tablas) para evitar ver datos de otros clientes."
    if contexto:
        prompt += f"\n\nContexto y Reglas de Negocio de la Empresa:\n{contexto}"
    
    client = get_openai_client()
    if not client:
        return "SELECT 'Error: API Key de OpenAI no configurada' AS error"
        
    if model_preference in ["thinking", "ultra_thinking"]:
        model_name = "o3-mini" if model_preference == "thinking" else "o1"
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

def interpret_results(history: list, sql_query: str, raw_data: any, error: str = None, model_preference: str = "fast", contexto: str = "") -> str:
    if error:
        return "⚠️ **Fallo en la consulta de datos.**\n\nLa consulta generada por el asistente intentó acceder a datos o columnas inexistentes. Por seguridad, la operación fue abortada y no se reintentará automáticamente para no consumir recursos.\n\nPor favor, reformula tu pregunta utilizando términos exactos del negocio."

    INTERPRET_PROMPT = f"""
Eres SupplyChain AI, un **Analista de Negocio y Datos Senior** experto en operaciones, inventario y finanzas.
Tu objetivo ya no es solo responder con datos, sino **aportar valor estratégico** utilizando los datos del "Resultado bruto de BD" y el "Contexto del Negocio".

REGLAS ESTRICTAS:
1. **Analiza y Recomienda:** No te limites a exponer los datos. Ofrece breves conclusiones y propone soluciones o recomendaciones accionables basadas en el Contexto del Negocio.
2. **Natural y Ejecutivo:** Responde de forma natural, estructurada y muy clara (usa markdown, negritas y viñetas).
3. **Lenguaje SQL Prohibido:** NUNCA muestres sintaxis SQL, nombres de tablas ni columnas técnicas (ej: inv.stock_disponible).
4. **Fidelidad de Datos:** NUNCA inventes números que no estén en el resultado bruto.
5. **Contexto:** Usa el "Contexto del Negocio" proporcionado por la empresa para alinear tus recomendaciones con sus reglas, políticas y objetivos.

Contexto Técnico Interno (OCULTO AL USUARIO):
Consulta SQL ejecutada: {sql_query}
Resultado bruto de BD: {raw_data}
Contexto del Negocio: {contexto}
    """
    
    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada en el servidor."

    if model_preference in ["thinking", "ultra_thinking"]:
        model_name = "o3-mini" if model_preference == "thinking" else "o1"
        # Para o3-mini/o1 transformamos el system prompt en el primer mensaje de usuario
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

def process_copilot_chat(db: Session, history: list, empresa_id: int, model_preference: str = "fast", contexto: str = "") -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # 1. Generar SQL
    sql_query = generate_sql(user_message, empresa_id, model_preference, contexto)
    
    # 2. Ejecutar SQL en la conexión RO
    raw_data, error = execute_sql(db, sql_query)
    
    # 3. Interpretar
    final_response = interpret_results(history, sql_query, raw_data, error, model_preference, contexto)
    
    return final_response
