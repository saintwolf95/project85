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
Eres un experto en bases de datos y logística de supply chain.
Tu trabajo es responder a la pregunta del usuario generando EXCLUSIVAMENTE una consulta SQL válida para PostgreSQL.
No incluyas explicaciones, ni etiquetas de markdown. Devuelve únicamente el texto de la consulta SQL.

El esquema de la base de datos es el siguiente:

Tabla `productos` (alias recomendado: p):
- id (INTEGER, Primary Key)
- empresa_id (INTEGER) -- OBLIGATORIO filtrar siempre por este campo
- sku (VARCHAR) -- código único del producto
- nombre (VARCHAR) -- nombre descriptivo del artículo
- costo_unitario (FLOAT) -- coste de compra al proveedor
- precio_venta (FLOAT) -- precio de venta al cliente
- lead_time_dias (INTEGER) -- días de plazo de entrega del proveedor
- familia (VARCHAR) -- categoría de producto (ej: 'Portátiles', 'Procesadores')
- marca (VARCHAR) -- marca del producto
- product_manager (VARCHAR) -- responsable del producto
- seccion (VARCHAR) -- sección o subcategoría

Tabla `inventario_snapshot` (alias recomendado: inv):
- producto_id (INTEGER, FK a productos.id)
- stock_disponible (INTEGER) -- unidades físicas actuales en almacén

Tabla `ventas_historicas` (alias recomendado: vh):
- id (INTEGER, Primary Key)
- producto_id (INTEGER, FK a productos.id)
- fecha_venta (DATE) -- fecha de la venta (formato YYYY-MM-DD)
- cantidad_vendida (INTEGER) -- unidades vendidas
- precio_unitario (FLOAT)
- ingreso_total (FLOAT) -- ingresos en euros de esa línea de venta

Tabla `registro_po` (alias recomendado: po):
- id (INTEGER, Primary Key)
- producto_id (INTEGER, FK a productos.id)
- fecha_orden (DATE)
- cantidad_sugerida_algoritmo (INTEGER)
- cantidad_aprobada_usuario (INTEGER)
- estado (VARCHAR) -- 'Pendiente', 'Aprobado', 'Rechazado'

Tabla `producto_metricas` (alias recomendado: pm):
- producto_id (INTEGER, FK a productos.id)
- abc (VARCHAR) -- Clasificación ABC por valor de ventas: 'A' (top 80%), 'B' (siguiente 15%), 'C' (restante 5%)
- xyz (VARCHAR) -- Clasificación XYZ por volatilidad de demanda: 'X' (estable), 'Y' (variable), 'Z' (errática)
- matriz_abc (VARCHAR) -- Cuadrante combinado: 'AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'
- dias_cobertura (FLOAT) -- días que durará el stock actual al ritmo de ventas actual
- riesgo_rotura (BOOLEAN) -- TRUE si hay riesgo inminente de quedarse sin stock
- ventas_60d (FLOAT) -- ingresos totales en euros de los últimos 60 días
- ventas_90d (FLOAT) -- ingresos totales en euros de los últimos 90 días
- valor_inv (FLOAT) -- valor económico del inventario actual (stock * coste unitario)
- ads (FLOAT) -- Average Daily Sales: ventas diarias promedio en unidades
- unidades_venta_60d (INTEGER) -- unidades vendidas en los últimos 60 días
- precio_unit (FLOAT) -- precio de venta unitario
- unidades (INTEGER) -- stock disponible actual (igual que inventario_snapshot.stock_disponible)

EJEMPLOS DE QUERIES ÚTILES:
-- Top productos por valor de inventario:
SELECT p.nombre, pm.valor_inv, pm.matriz_abc FROM productos p JOIN producto_metricas pm ON p.id = pm.producto_id WHERE p.empresa_id = 1 ORDER BY pm.valor_inv DESC LIMIT 10;
-- Productos con riesgo de rotura clase A:
SELECT p.nombre, pm.dias_cobertura, pm.ventas_90d FROM productos p JOIN producto_metricas pm ON p.id = pm.producto_id WHERE p.empresa_id = 1 AND pm.abc = 'A' AND pm.riesgo_rotura = TRUE ORDER BY pm.dias_cobertura ASC;
"""

CONVERSATIONAL_KEYWORDS = [
    'hola', 'buenos días', 'buenas tardes', 'buenas noches', 'cómo estás', 'como estas',
    'gracias', 'de nada', 'ok', 'perfecto', 'entendido', 'ayuda', 'help',
    'qué puedes hacer', 'que puedes hacer', 'para qué sirves', 'para que sirves'
]

def is_conversational(message: str) -> bool:
    """Detecta si el mensaje es conversacional y no requiere SQL."""
    msg_lower = message.lower().strip()
    # Mensaje muy corto sin palabras clave de negocio
    if len(msg_lower) < 15:
        business_keywords = ['producto', 'stock', 'inventario', 'venta', 'sku', 'familia', 'clase', 'abc', 'riesgo', 'cobertura', 'precio', 'margen', 'proveedor']
        if not any(kw in msg_lower for kw in business_keywords):
            return True
    # Saludo explícito
    if any(kw in msg_lower for kw in CONVERSATIONAL_KEYWORDS):
        return True
    return False

def handle_conversational(message: str, contexto: str = "") -> str:
    """Responde a preguntas conversacionales sin generar SQL."""
    client = get_openai_client()
    if not client:
        return "¡Hola! Soy tu AI Copilot de Supply Chain. Puedes preguntarme sobre tu inventario, ventas, productos, alertas de stock, y mucho más."
    
    system = f"""Eres SupplyChain AI, un asistente experto en logística y gestión de inventario.
Responde de forma amigable, concisa y en español. Menciona brevemente qué tipo de preguntas puedes responder (inventario, ventas, stock, clasificación ABC/XYZ, etc.).
Contexto de la empresa: {contexto or 'No disponible'}"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": message}],
            max_tokens=300,
            temperature=0.7
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return "¡Hola! Soy tu AI Copilot. Puedo analizar tu inventario, ventas, y métricas ABC/XYZ. ¿Qué necesitas saber?"

def generate_sql(history: list, empresa_id: int, model_preference: str = "fast", contexto: str = "") -> str:
    prompt = SCHEMA_PROMPT + f"\n\n¡REGLA DE SEGURIDAD CRÍTICA! TODAS tus consultas deben filtrar usando `p.empresa_id = {empresa_id}` (o un JOIN a productos si usas otras tablas) para evitar ver datos de otros clientes."
    if contexto:
        prompt += f"\n\nContexto y Reglas de Negocio de la Empresa:\n{contexto}"
    
    client = get_openai_client()
    if not client:
        return "SELECT 'Error: API Key de OpenAI no configurada' AS error"
        
    if model_preference in ["thinking", "ultra_thinking"]:
        model_name = "o3-mini" if model_preference == "thinking" else "o1"
        messages = [{"role": "developer", "content": prompt}]
        messages.extend(history)
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
        messages = [{"role": "system", "content": prompt}]
        messages.extend(history)
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.0
            )
        except Exception as e:
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Generación SQL): {str(e)}", exc_info=True)
            return f"SELECT 'Error de comunicación con el motor de IA. Detalle: {str(e)}' AS error"
    
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

    total_records = len(raw_data) if isinstance(raw_data, list) else 0
    raw_data_truncated = raw_data[:50] if isinstance(raw_data, list) else raw_data
    
    truncation_warning = ""
    if total_records > 50:
        truncation_warning = f"\n⚠️ ADVERTENCIA CRÍTICA: La base de datos devolvió {total_records} registros, pero por límites de memoria solo se te han proporcionado los primeros 50. DEBES informar al usuario de que se encontraron {total_records} registros en total y que estás basando tu resumen en una muestra."

    client = get_openai_client()
    if not client:
        return "⚠️ Error: API Key de OpenAI no configurada en el servidor."

    if model_preference in ["thinking", "ultra_thinking"]:
        INTERPRET_PROMPT = f"""
Eres SupplyChain AI, un **Analista de Negocio y Científico de Datos Senior** experto en operaciones, cadena de suministro y finanzas corporativas.
Como estás operando con un modelo de razonamiento avanzado, tu objetivo es realizar un análisis **profundo, exhaustivo y altamente inteligente**.

REGLAS ESTRICTAS PARA MODO AVANZADO:
1. **Análisis Profundo y Verborrea Analítica:** Usa un lenguaje profesional y detallado. Explora los datos a fondo, haz cruces de variables, identifica patrones ocultos, correlaciones y anomalías. Tómate la libertad de escribir más palabras para explicar la situación de forma magistral.
2. **Gestión de Riesgos y Oportunidades:** Enumera proactivamente riesgos (ej: roturas de stock inminentes, sobre-stock financiero, dependencias) y aporta oportunidades de optimización y planes de acción claros.
3. **Consultoría y Predicción:** Aporta recomendaciones estratégicas y proyecciones. Justifica matemáticamente tus conclusiones basándote estrictamente en los datos devueltos.
4. **Gráficos Dinámicos:** TIENES LA CAPACIDAD DE RENDERIZAR GRÁFICOS REALES. Si el usuario pide un gráfico o si el contexto analítico lo pide, INYECTA al final de tu mensaje un bloque de código estrictamente JSON con la siguiente estructura (elige entre 'bar', 'line', 'pie'):
```json
{{
  "chartConfig": {{
    "type": "bar",
    "title": "Título del Gráfico",
    "data": [{{"name": "A", "value": 10}}, {{"name": "B", "value": 20}}],
    "xKey": "name",
    "yKey": "value",
    "color": "#0ea5e9"
  }}
}}
```
5. **Lenguaje SQL Prohibido:** NUNCA muestres código SQL ni nombres de tablas/columnas técnicas al usuario.
6. **Fidelidad de Datos:** NUNCA inventes números que no estén en el resultado bruto.{truncation_warning}
7. **Contexto Corporativo:** Usa el "Contexto del Negocio" para adaptar tus consejos a la realidad de la empresa.
8. **Idioma:** Responde SIEMPRE en español, independientemente del idioma de la pregunta.
9. **Moneda:** Usa siempre el formato europeo para importes: €1.234,56 con punto como separador de miles y coma como decimal.
10. **Tablas:** Cuando los datos sean una lista de artículos o comparativa, formatea la respuesta como tabla Markdown.

Contexto Técnico Interno (OCULTO AL USUARIO):
Consulta SQL ejecutada: {sql_query}
Resultado bruto de BD: {raw_data_truncated}
Contexto del Negocio: {contexto}
"""
        model_name = "o3-mini" if model_preference == "thinking" else "o1"
        messages = [{"role": "developer", "content": INTERPRET_PROMPT}]
        messages.extend(history)
        
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages
            )
        except Exception as e:
            error_msg = str(e)
            if "model_not_found" in error_msg or "does not exist" in error_msg:
                return "⚠️ **Nivel de API Insuficiente:** Tu clave de OpenAI no tiene permisos para acceder a los modelos avanzados de razonamiento (`o1` u `o3-mini`). Por favor, cambia al modo **Fast (gpt-4o)** en la barra inferior."
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Interpretación Thinking): {error_msg}", exc_info=True)
            return "⚠️ **Error de comunicación:** No se pudo obtener la interpretación de la IA en este momento."
    else:
        INTERPRET_PROMPT = f"""
Eres SupplyChain AI, un **Analista de Negocio y Datos Senior** experto en operaciones, inventario y finanzas.
Tu objetivo es responder de forma rápida, ágil y al grano.

REGLAS ESTRICTAS PARA MODO RÁPIDO:
1. **Concisión Extrema:** Responde de forma MUY DIRECTA. Si aportas conclusiones, deben ser viñetas breves (1 o 2 puntos clave). NO escribas informes gigantes ni exageres.
2. **Formato Compacto:** REDUCE AL MÁXIMO LOS SALTOS DE LÍNEA. No dejes líneas en blanco innecesarias.
3. **Gráficos Dinámicos:** TIENES LA CAPACIDAD DE RENDERIZAR GRÁFICOS. Si la pregunta requiere visualizar tendencias o comparativas, añade al final de tu respuesta un bloque de código JSON con este formato exacto:
```json
{{
  "chartConfig": {{ "type": "bar", "title": "...", "data": [{{"name": "A", "value": 10}}], "xKey": "name", "yKey": "value", "color": "#0ea5e9" }}
}}
```
4. **Lenguaje SQL Prohibido:** NUNCA muestres sintaxis SQL ni nombres de tablas/columnas técnicas.
5. **Fidelidad de Datos:** NUNCA inventes números que no estén en el resultado bruto.{truncation_warning}
6. **Contexto:** Usa el "Contexto del Negocio".
7. **Idioma:** Responde SIEMPRE en español, independientemente del idioma de la pregunta.
8. **Moneda:** Usa siempre el formato europeo para importes: €1.234,56 con punto como separador de miles y coma como decimal.
9. **Tablas:** Cuando los datos sean una lista de artículos o comparativa, formatea la respuesta como tabla Markdown (| col1 | col2 |).

Contexto Técnico Interno (OCULTO AL USUARIO):
Consulta SQL ejecutada: {sql_query}
Resultado bruto de BD: {raw_data_truncated}
Contexto del Negocio: {contexto}
"""
        model_name = "gpt-4o"
        messages = [{"role": "system", "content": INTERPRET_PROMPT}]
        messages.extend(history)
        
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.1,
                max_tokens=2000
            )
        except Exception as e:
            logger.error(f"[AUDIT SQL] Error en API OpenAI (Interpretación): {str(e)}", exc_info=True)
            return f"⚠️ **Error de comunicación:** {str(e)}"
    
    reply = response.choices[0].message.content.strip()
    # Adjuntamos el SQL oculto para el feature de CSV Export
    if isinstance(raw_data, list) and len(raw_data) > 0:
        import base64
        sql_b64 = base64.b64encode(sql_query.encode('utf-8')).decode('utf-8')
        reply += f"\n\n<!-- sql_query_b64: {sql_b64} -->"
        
    return reply

def process_copilot_chat(db: Session, history: list, empresa_id: int, model_preference: str = "fast", contexto: str = "") -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # Detectar si es una pregunta conversacional (no requiere SQL)
    if is_conversational(user_message):
        return handle_conversational(user_message, contexto)
    
    # Loop de reintento: si la SQL falla, se le dice a GPT qué falló para que corrija
    max_retries = 2
    retry_history = list(history)  # Copia para no mutar el original
    
    for attempt in range(max_retries + 1):
        # 1. Generar SQL
        sql_query = generate_sql(retry_history, empresa_id, model_preference, contexto)
        
        # 2. Ejecutar SQL en la conexión RO
        raw_data, error = execute_sql(db, sql_query)
        
        # 3. Si hay error y quedan reintentos, pedirle a GPT que corrija
        if error and attempt < max_retries:
            logger.warning(f"[AUDIT SQL] Reintento {attempt + 1}/{max_retries}. SQL fallida: {sql_query}")
            # Acumular el error en retry_history (NO resetear) para que GPT vea todos los intentos fallidos
            retry_history.append({
                "role": "assistant",
                "content": sql_query
            })
            retry_history.append({
                "role": "user",
                "content": f"La consulta SQL anterior falló con este error: '{error}'. Por favor, genera una consulta SQL corregida. Recuerda que solo existen estas tablas: productos, inventario_snapshot, ventas_historicas, registro_po, producto_metricas. Revisa los nombres de columnas del esquema."
            })
            continue
        
        # 4. Interpretar (ya sea con datos o con error final)
        final_response = interpret_results(history, sql_query, raw_data, error, model_preference, contexto)
        return final_response
    
    return """⚠️ **No pude obtener datos para responder tu pregunta** tras varios intentos.

Esto puede ocurrir si la pregunta usa términos muy genéricos o combinaciones inusuales. Prueba a ser más específico:
- ✅ *¿Cuál es el valor del inventario de la familia 'Portátiles'?*
- ✅ *¿Qué productos clase A tienen riesgo de rotura?*
- ✅ *Top 10 productos por ventas 90 días*
- ✅ *¿Cuántos artículos hay en cada cuadrante de la matriz ABC/XYZ?*"""

