import os
import logging
import re
import base64
import binascii
import hashlib
import hmac
import json
import time
from numbers import Number
from typing import Any
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException
from .core.security import SUPABASE_JWT_SECRET

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

MAX_CONTEXT_PROMPT_CHARS = 50_000
MAX_SQL_RESULT_ROWS = 1_000
DEFAULT_OPENAI_TIMEOUT_SECONDS = 45.0

EXPORT_MARKER_PATTERN = re.compile(
    r"<!-- sql_export: ([A-Za-z0-9+/=]+)\.([a-f0-9]{64})(?:\.(trusted|untrusted)(?:\.([A-Za-z0-9+/=]+))?)? -->"
)

def _export_signature(sql_b64: str, trusted_query: bool = False, params_b64: str | None = None) -> str:
    scope = "trusted" if trusted_query else "untrusted"
    payload = f"{scope}:{sql_b64}" if params_b64 is None else f"{scope}:{sql_b64}:{params_b64}"
    return hmac.new(
        SUPABASE_JWT_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

def build_sql_export_marker(
    sql_query: str,
    trusted_query: bool = False,
    query_params: dict[str, Any] | None = None,
) -> str:
    sql_b64 = base64.b64encode(sql_query.encode("utf-8")).decode("utf-8")
    scope = "trusted" if trusted_query else "untrusted"
    params_json = json.dumps(query_params or {}, ensure_ascii=False, sort_keys=True, default=str, separators=(",", ":"))
    params_b64 = base64.b64encode(params_json.encode("utf-8")).decode("utf-8")
    return f"<!-- sql_export: {sql_b64}.{_export_signature(sql_b64, trusted_query, params_b64)}.{scope}.{params_b64} -->"


def build_metrics_marker(raw_data: list, sql_query: str = "") -> str:
    """Adjunta KPIs estructurados solo para resultados agregados de una fila."""
    if not isinstance(raw_data, list) or len(raw_data) != 1 or not isinstance(raw_data[0], dict):
        return ""
    numeric_data = {
        clave: float(valor) if isinstance(valor, Number) and not isinstance(valor, bool) else valor
        for clave, valor in raw_data[0].items()
        if isinstance(valor, Number) and not isinstance(valor, bool)
    }
    if not numeric_data:
        return ""
    is_percentage_metric = bool(
        re.search(r"\bAS\s+(?:margen_pct|mgd_pct)\b", sql_query, flags=re.IGNORECASE)
        or "NULLIF(SUM(vh.ingreso_total), 0) * 100" in sql_query
    )
    formato = (
        "porcentaje"
        if is_percentage_metric
        else "unidades"
        if "ventas_unidades" in sql_query
        else "eur"
    )
    encoded = base64.b64encode(json.dumps({"data": numeric_data, "formato": formato}).encode("utf-8")).decode("ascii")
    return f"<!-- copilot_metrics: {encoded} -->"


def build_followups_marker(intento: Any) -> str:
    """Genera acciones de seguimiento basadas en la intención ya resuelta."""
    tipo = getattr(intento, "tipo", "")
    medida = getattr(intento, "medida", "")
    periodo = getattr(intento, "periodo", None)
    agrupacion = getattr(intento, "agrupacion", None)
    periodo_texto = {
        "ayer": "ayer",
        "hoy": "hoy",
        "mes_actual": "este mes",
        "ultimos_7_dias": "los últimos 7 días",
        "ultimos_30_dias": "los últimos 30 días",
        "ultimos_60_dias": "los últimos 60 días",
        "ultimos_90_dias": "los últimos 90 días",
    }.get(periodo, "el mismo periodo")
    acciones: list[dict[str, str]] = []

    if tipo == "ventas":
        if agrupacion != "familia":
            acciones.append({"label": "Desglosar por familia", "prompt": f"Desglosa las ventas de {periodo_texto} por familia"})
        if not getattr(intento, "comparacion", False):
            acciones.append({"label": "Comparar periodo", "prompt": f"Compara las ventas de {periodo_texto} con el periodo anterior"})
        if medida != "ventas_unidades":
            acciones.append({"label": "Ver margen", "prompt": f"Dame el margen y beneficio de {periodo_texto}"})
            acciones.append({"label": "Ver MGD", "prompt": f"Dame el MGD de {periodo_texto}"})
    elif tipo == "inventario":
        if agrupacion != "matriz":
            acciones.append({"label": "Ver matriz ABCXYZ", "prompt": "Desglosa el inventario actual por matriz ABCXYZ"})
        acciones.append({"label": "Revisar sobrestock", "prompt": "¿Qué productos tienen sobrestock y cuánto capital inmovilizan?"})
        acciones.append({"label": "Ver alertas", "prompt": "¿Qué productos tienen riesgo de rotura?"})
    elif tipo == "rentabilidad":
        metrica = "MGD" if medida.startswith("mgd") else "margen"
        if not getattr(intento, "comparacion", False):
            acciones.append({"label": f"Comparar {metrica}", "prompt": f"Compara el {metrica} de {periodo_texto} con el periodo anterior"})
        if not medida.startswith("mgd"):
            acciones.append({"label": "Ver MGD", "prompt": f"Dame el MGD de {periodo_texto}"})
        acciones.append({"label": "Ver oportunidades", "prompt": "¿Qué productos son oportunidades comerciales?"})
    elif tipo == "acciones":
        acciones.append({"label": "Ver oportunidades", "prompt": "¿Qué productos son oportunidades comerciales?"})
    elif tipo == "oportunidades":
        acciones.append({"label": "Ver acciones prioritarias", "prompt": "¿Qué acciones debería priorizar hoy?"})

    if not acciones:
        return ""
    encoded = base64.b64encode(json.dumps({"actions": acciones}, ensure_ascii=False).encode("utf-8")).decode("ascii")
    return f"<!-- copilot_followups: {encoded} -->"


def build_dynamic_followups_marker(dossier: dict[str, Any]) -> str:
    """Adjunta preguntas de seguimiento basadas en los hallazgos del dossier."""
    from .analitica_ventas import crear_acciones_seguimiento

    acciones = crear_acciones_seguimiento(dossier)
    if not acciones:
        return ""
    encoded = base64.b64encode(json.dumps({"actions": acciones}, ensure_ascii=False).encode("utf-8")).decode("ascii")
    return f"<!-- copilot_followups: {encoded} -->"

def extract_signed_sql_export(content: str) -> tuple[str, bool, dict[str, Any]] | None:
    match = EXPORT_MARKER_PATTERN.search(content)
    if not match:
        return None
    sql_b64, signature, scope, params_b64 = match.groups()
    if scope is None:
        # Legacy markers are revalidated as untrusted queries below.
        valid = hmac.compare_digest(signature, hmac.new(
            SUPABASE_JWT_SECRET.encode("utf-8"), sql_b64.encode("utf-8"), hashlib.sha256
        ).hexdigest())
        trusted_query = False
    else:
        trusted_query = scope == "trusted"
        valid = hmac.compare_digest(signature, _export_signature(sql_b64, trusted_query, params_b64))
    if not valid:
        return None
    try:
        sql_query = base64.b64decode(sql_b64, validate=True).decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return None
    if not params_b64:
        return sql_query, trusted_query, {}
    try:
        query_params = json.loads(base64.b64decode(params_b64, validate=True).decode("utf-8"))
    except (binascii.Error, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(query_params, dict) or "empresa_id" in query_params:
        return None
    return sql_query, trusted_query, query_params

def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        try:
            timeout = float(os.environ.get("OPENAI_TIMEOUT_SECONDS", DEFAULT_OPENAI_TIMEOUT_SECONDS))
        except (TypeError, ValueError):
            timeout = DEFAULT_OPENAI_TIMEOUT_SECONDS
        timeout = max(5.0, min(timeout, 120.0))
        return OpenAI(api_key=api_key, timeout=timeout, max_retries=1)
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
- familia_marca (VARCHAR) -- agrupación combinada procedente de Familia/Marca
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
- precio_unitario (FLOAT) -- Ventas / Unidades Venta
- ingreso_total (FLOAT) -- ingresos en euros de esa línea de venta
- margen_bruto_eur (FLOAT) -- columna Margen: margen bruto en euros
- margen_bruto_pct (FLOAT) -- columna % MG
- margen_destino_eur (FLOAT) -- columna MGD: margen puesto en destino en euros
- margen_destino_pct (FLOAT) -- columna % MGD

Tabla `registro_po` (alias recomendado: po):
- id (INTEGER, Primary Key)
- producto_id (INTEGER, FK a productos.id)
- fecha_orden (DATE)
- cantidad_sugerida_algoritmo (INTEGER)
- cantidad_aprobada_usuario (INTEGER)
- estado (VARCHAR) -- 'Pendiente', 'Aprobado', 'Rechazado'

Tabla `producto_metricas` (alias recomendado: pm):
- producto_id (INTEGER, FK a productos.id)
- abc (VARCHAR) -- Copia sincronizada de ABC. El análisis comercial del Copilot calcula ABC dinámicamente con ventas reales para no depender de inventario.
- xyz (VARCHAR) -- Clasificación XYZ por contribución acumulada del inventario actual en euros: 'X' (top 80%), 'Y' (siguiente 15%), 'Z' (restante 5%)
- matriz_abc (VARCHAR) -- Cuadrante combinado: 'AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'
- dias_cobertura (INTEGER) -- días que durará el stock actual al ritmo de ventas actual
- riesgo_rotura (BOOLEAN) -- TRUE si hay riesgo inminente de quedarse sin stock

DEFINICIONES DE NEGOCIO OBLIGATORIAS:
- "ventas" significa euros facturados: SUM(vh.ingreso_total). No uses cantidad_vendida salvo que el usuario pida unidades.
- "ventas 90 días" = SUM(vh.ingreso_total) con fecha_venta entre CURRENT_DATE - INTERVAL '89 days' y CURRENT_DATE, contando 90 fechas naturales.
- La fuente oficial de ventas es la carga `fivemin_ventas`. Sus dimensiones de análisis son `p.familia`, `p.marca`, `p.familia_marca`, `p.seccion` y `p.product_manager`.
- El año fiscal empieza el 1 de mayo. Para preguntas de "año fiscal" usa desde el 1 de mayo correspondiente hasta hoy, siempre en Europe/Madrid.
- Si el resumen operativo indica una cobertura de datos, no inventes resultados fuera de esas fechas; explica con claridad la limitación.
- "inventario" significa euros actuales: SUM(p.costo_unitario * inv.stock_disponible).
- "margen", "MG" o "beneficio" = SUM(vh.margen_bruto_eur); su porcentaje agregado es SUM(margen_bruto_eur) / SUM(ingreso_total) * 100.
- "MGD" o "margen en destino" = SUM(vh.margen_destino_eur); su porcentaje agregado es SUM(margen_destino_eur) / SUM(ingreso_total) * 100.
- No recalcules MG o MGD desde el catálogo cuando existen estas columnas de ventas: son la fuente económica oficial.
- Cuando se solicite una comparación, informa periodo actual, periodo anterior, variación absoluta y variación porcentual.
- "oportunidad comercial" significa producto ABC A/B con stock disponible, margen positivo y ventas en los últimos 90 días; "acción prioritaria" ordena primero roturas de productos clave, después capital inmovilizado y después oportunidades.
- "ABC" se basa en ventas EUR de los últimos 90 días y no requiere inventario; "XYZ" se basa en inventario EUR actual.
- Para preguntas comerciales de clase A/B/C, prioriza la clasificación ABC calculada sobre ventas. Las clases X/Y/Z y los cuadrantes ABCXYZ usan `producto_metricas`.
- `cv` y `ads` representan variabilidad y velocidad de demanda para cobertura, pero no determinan la letra XYZ.
- Para totales y sumatorias, calcula en SQL con SUM y devuelve una sola fila agregada. No limites los totales a 50 productos.

EJEMPLOS DE QUERIES ÚTILES:
-- Top productos por valor de inventario:
SELECT p.nombre, (p.costo_unitario * inv.stock_disponible) as valor_inv, pm.matriz_abc FROM productos p JOIN inventario_snapshot inv ON p.id = inv.producto_id LEFT JOIN producto_metricas pm ON p.id = pm.producto_id WHERE p.empresa_id = 1 ORDER BY valor_inv DESC LIMIT 10;
-- Productos con riesgo de rotura clase A:
SELECT p.nombre, pm.dias_cobertura, (SELECT SUM(cantidad_vendida) FROM ventas_historicas WHERE producto_id = p.id) as ventas_totales FROM productos p JOIN producto_metricas pm ON p.id = pm.producto_id WHERE p.empresa_id = 1 AND pm.abc = 'A' AND pm.riesgo_rotura = TRUE ORDER BY pm.dias_cobertura ASC;
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
            return "SELECT 'Error de comunicación con el motor de IA. Inténtalo de nuevo más tarde.' AS error"
    
    sql_query = response.choices[0].message.content.strip()
    
    if sql_query.startswith("```sql"):
        sql_query = sql_query[6:]
    if sql_query.startswith("```"):
        sql_query = sql_query[3:]
    if sql_query.endswith("```"):
        sql_query = sql_query[:-3]
        
    return sql_query.strip()

ALLOWED_SQL_TABLES = {
    "productos",
    "inventario_snapshot",
    "ventas_historicas",
    "registro_po",
    "producto_metricas",
}

FORBIDDEN_SQL_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|CALL|MERGE|COPY|VACUUM|ANALYZE|REINDEX|ATTACH|DETACH|PRAGMA)\b",
    re.IGNORECASE,
)

TABLE_REFERENCE_PATTERN = re.compile(r"\b(?:FROM|JOIN)\s+([a-zA-Z_][\w\.]*)", re.IGNORECASE)
CTE_NAME_PATTERN = re.compile(r"(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([a-zA-Z_][\w]*)\s+AS\s*\(", re.IGNORECASE)
SET_OPERATOR_PATTERN = re.compile(r"\b(UNION|INTERSECT|EXCEPT)\b", re.IGNORECASE)
SUBQUERY_PATTERN = re.compile(r"\(\s*(?:SELECT|WITH)\b", re.IGNORECASE)
PRODUCT_ALIAS_PATTERN = re.compile(
    r"\b(?:FROM|JOIN)\s+(?:public\.)?productos\s+(?:AS\s+)?([a-zA-Z_][\w]*)\b",
    re.IGNORECASE,
)

def _strip_sql_comments(sql_query: str) -> str:
    return re.sub(r"(--[^\n]*|/\*.*?\*/)", " ", sql_query, flags=re.DOTALL).strip()

def validate_read_only_sql(sql_query: str, empresa_id: int, trusted_query: bool = False):
    if not isinstance(sql_query, str) or not sql_query.strip():
        return None, None, "La consulta SQL está vacía."

    normalized = _strip_sql_comments(sql_query)
    normalized = normalized.rstrip(";").strip()
    if ";" in normalized:
        return None, None, "Error de seguridad: solo se permite una sentencia SQL."
    if not re.match(r"^(?:SELECT|WITH)\b", normalized, flags=re.IGNORECASE):
        return None, None, "Error de seguridad: solo se permiten consultas SELECT."
    if FORBIDDEN_SQL_KEYWORDS.search(normalized):
        return None, None, "Error de seguridad: la consulta contiene una operación no permitida."

    if SET_OPERATOR_PATTERN.search(normalized):
        return None, None, "Error de seguridad: no se permiten UNION, INTERSECT ni EXCEPT."

    # Las consultas semanticas son plantillas internas revisadas. Las consultas
    # generadas por el modelo quedan limitadas a un SELECT simple y sin ramas
    # alternativas para impedir que un filtro de empresa se pueda sortear.
    if not trusted_query:
        if not re.match(r"^SELECT\b", normalized, flags=re.IGNORECASE):
            return None, None, "Error de seguridad: las consultas generadas deben ser SELECT simples."
        if re.search(r"\bOR\b", normalized, flags=re.IGNORECASE) or SUBQUERY_PATTERN.search(normalized):
            return None, None, "Error de seguridad: la consulta contiene una rama no permitida."
        aliases = [alias.lower() for alias in PRODUCT_ALIAS_PATTERN.findall(normalized)]
        if aliases != ["p"]:
            return None, None, "Error de seguridad: la consulta debe usar una unica relacion productos con alias p."
        if not re.search(
            r"\bWHERE\b[\s\S]*?\bp\.empresa_id\s*=\s*(?::empresa_id|\d+)\b",
            normalized,
            flags=re.IGNORECASE,
        ):
            return None, None, "Error de seguridad: el filtro de empresa debe estar dentro de WHERE."

    raw_references = [match.group(1).lower() for match in TABLE_REFERENCE_PATTERN.finditer(normalized)]
    invalid_schemas = {
        reference.split(".")[-2]
        for reference in raw_references
        if "." in reference and reference.split(".")[-2] != "public"
    }
    if invalid_schemas:
        return None, None, "Error de seguridad: la consulta referencia un esquema no permitido."

    referenced_tables = {reference.split(".")[-1] for reference in raw_references}
    cte_names = {match.group(1).lower() for match in CTE_NAME_PATTERN.finditer(normalized)}
    referenced_tables -= cte_names
    invalid_tables = referenced_tables - ALLOWED_SQL_TABLES
    if invalid_tables:
        return None, None, "Error de seguridad: la consulta referencia tablas no permitidas."

    tenant_filter = re.search(r"\b(?:p\.)?empresa_id\s*=\s*(?::empresa_id|\d+)\b", normalized, flags=re.IGNORECASE)
    if not tenant_filter:
        return None, None, "Error de seguridad: la consulta debe filtrar por empresa_id."
    numeric_value = re.search(r"\d+", tenant_filter.group(0))
    if numeric_value and int(numeric_value.group(0)) != empresa_id:
        return None, None, "Error de seguridad: el filtro de empresa no coincide con el usuario."

    safe_query = re.sub(r"\b((?:p\.)?empresa_id)\s*=\s*\d+\b", r"\1 = :empresa_id", normalized, flags=re.IGNORECASE)
    params = {"empresa_id": empresa_id}
    return safe_query, params, None

def execute_sql(
    db: Session,
    sql_query: str,
    empresa_id: int,
    extra_params: dict[str, Any] | None = None,
    trusted_query: bool = False,
):
    query_hash = hashlib.sha256(sql_query.encode("utf-8")).hexdigest()[:12]
    logger.info(f"[AUDIT SQL] Query generada interceptada hash={query_hash}")
    safe_query, params, validation_error = validate_read_only_sql(sql_query, empresa_id, trusted_query)
    if validation_error:
        logger.error(f"[AUDIT SQL] Consulta bloqueada: {validation_error}")
        return None, validation_error

    if extra_params:
        params.update({clave: valor for clave, valor in extra_params.items() if clave != "empresa_id"})

    try:
        result = db.execute(text(safe_query), params)
        rows = result.fetchmany(MAX_SQL_RESULT_ROWS)
        columns = result.keys()
        data = [dict(zip(columns, row)) for row in rows]
        return data, None
    except Exception as e:
        logger.error(f"[AUDIT SQL] Fallo de ejecución: {str(e)}")
        # M2: Do not expose raw exception string to the client
        return None, "La consulta SQL no pudo ejecutarse. Verifica que los nombres de las tablas y columnas sean correctos."

def interpret_results(
    history: list,
    sql_query: str,
    raw_data: any,
    error: str = None,
    model_preference: str = "fast",
    contexto: str = "",
    trusted_query: bool = False,
    export_params: dict[str, Any] | None = None,
) -> str:
    if error:
        return "⚠️ **Fallo en la consulta de datos.**\n\nLa consulta generada por el asistente intentó acceder a datos o columnas inexistentes. Por seguridad, la operación fue abortada y no se reintentará automáticamente para no consumir recursos.\n\nPor favor, reformula tu pregunta utilizando términos exactos del negocio."

    from .analitica_ventas import (
        contrato_respuesta_analitica,
        es_dossier_analitico,
        renderizar_respuesta_analitica,
        respuesta_analitica_cumple_contrato,
    )

    es_dossier = es_dossier_analitico(raw_data)
    total_records = len(raw_data) if isinstance(raw_data, list) else 0
    raw_data_truncated = raw_data[:50] if isinstance(raw_data, list) else raw_data
    
    truncation_warning = ""
    if total_records > 50:
        truncation_warning = f"\n⚠️ ADVERTENCIA CRÍTICA: La base de datos devolvió {total_records} registros, pero por límites de memoria solo se te han proporcionado los primeros 50. DEBES informar al usuario de que se encontraron {total_records} registros en total y que estás basando tu resumen en una muestra."

    client = get_openai_client()
    if not client:
        if es_dossier:
            return renderizar_respuesta_analitica(raw_data)
        return "⚠️ Error: API Key de OpenAI no configurada en el servidor."

    if model_preference in ["thinking", "ultra_thinking"]:
        contrato_dossier = contrato_respuesta_analitica() if es_dossier else ""
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
{contrato_dossier}

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
            if es_dossier:
                return renderizar_respuesta_analitica(raw_data)
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
            return "⚠️ **Error de comunicación:** No se pudo obtener la interpretación de la IA en este momento."
    
    reply = response.choices[0].message.content.strip()
    usage = getattr(response, "usage", None)
    if usage:
        logger.info(
            "[AUDIT IA] Interpretacion modelo=%s prompt_tokens=%s completion_tokens=%s total_tokens=%s",
            model_name,
            getattr(usage, "prompt_tokens", None),
            getattr(usage, "completion_tokens", None),
            getattr(usage, "total_tokens", None),
        )
    if es_dossier and not respuesta_analitica_cumple_contrato(reply):
        logger.warning("La interpretación analítica no cumplió el contrato; se usa el respaldo determinista.")
        return renderizar_respuesta_analitica(raw_data)
    # Adjuntamos el SQL oculto para el feature de CSV Export
    if isinstance(raw_data, list) and len(raw_data) > 0:
        reply += f"\n\n{build_sql_export_marker(sql_query, trusted_query, export_params)}"
    metrics_marker = build_metrics_marker(raw_data, sql_query)
    if metrics_marker:
        reply += f"\n\n{metrics_marker}"
        
    return reply

def process_copilot_chat(db: Session, history: list, empresa_id: int, model_preference: str = "fast", contexto: str = "") -> str:
    if not history:
        return "No hay historial de mensajes."
        
    user_message = history[-1]["content"]
    
    # Las preguntas agregadas frecuentes se resuelven con SQL parametrizado y exacto.
    from .copilot_orchestrator import analizar_intencion, crear_consulta_semantica

    intento, aclaracion = analizar_intencion(history)
    if aclaracion:
        return aclaracion

    # Las conversaciones simples no necesitan consultar el resumen empresarial.
    if not intento and is_conversational(user_message):
        return handle_conversational(user_message, contexto)

    from .copilot_context import construir_resumen_operativo
    contexto_analisis = (contexto or "")[:MAX_CONTEXT_PROMPT_CHARS]
    resumen_operativo = construir_resumen_operativo(db, empresa_id)
    if resumen_operativo:
        contexto_analisis = f"{contexto_analisis}\n\n{resumen_operativo}".strip()
    contexto_analisis = contexto_analisis[:MAX_CONTEXT_PROMPT_CHARS]

    if intento:
        if intento.tipo == "inventario" or intento.medida in {
            "matriz_productos",
            "productos_alerta",
            "productos_sobrestock",
        }:
            inventory_count = db.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM inventario_snapshot inv
                    JOIN productos p ON p.id = inv.producto_id
                    WHERE p.empresa_id = :empresa_id
                    """
                ),
                {"empresa_id": empresa_id},
            ).scalar() or 0
            if inventory_count == 0:
                return (
                    "Todavía no hay datos reales de inventario cargados. "
                    "Puedo analizar ventas, unidades, MG, MGD y clasificación ABC; "
                    "XYZ, stock, cobertura y alertas se activarán cuando cargues el inventario."
                )
        from .analitica_ventas import crear_plan_analitico_ventas, es_pregunta_gerencial

        usar_plan_analitico = (
            model_preference in {"thinking", "ultra_thinking"}
            and intento.tipo in {"ventas", "rentabilidad"}
            and (intento.comparacion or es_pregunta_gerencial(user_message))
        )
        if usar_plan_analitico:
            plan_analitico = crear_plan_analitico_ventas(intento)
            if plan_analitico:
                inicio_plan = time.perf_counter()
                bloques_fallidos: list[str] = []
                dossier: dict[str, Any] = {
                    "periodo_actual": {
                        "inicio": plan_analitico.periodo_actual[0].isoformat(),
                        "fin": plan_analitico.periodo_actual[1].isoformat(),
                    },
                    "periodo_anterior": {
                        "inicio": plan_analitico.periodo_anterior[0].isoformat(),
                        "fin": plan_analitico.periodo_anterior[1].isoformat(),
                    },
                    "resultados": {},
                }
                for consulta in plan_analitico.consultas:
                    datos, error = execute_sql(
                        db,
                        consulta.sql,
                        empresa_id,
                        consulta.parametros,
                        trusted_query=True,
                    )
                    if error:
                        logger.warning("No se pudo ejecutar el bloque analitico %s: %s", consulta.nombre, error)
                        bloques_fallidos.append(consulta.nombre)
                        continue
                    dossier["resultados"][consulta.nombre] = datos
                if dossier["resultados"]:
                    respuesta = interpret_results(
                        history,
                        "Dossier analitico multiconsulta: resumen, tendencia, impulsores y detalle por SKU.",
                        dossier,
                        model_preference=model_preference,
                        contexto=contexto_analisis,
                        trusted_query=True,
                    )
                    seguimiento = build_dynamic_followups_marker(dossier)
                    logger.info(
                        "[AUDIT ANALITICA] empresa_id=%s modelo=%s bloques_ok=%s bloques_fallidos=%s latencia_ms=%s",
                        empresa_id,
                        model_preference,
                        len(dossier["resultados"]),
                        ",".join(bloques_fallidos) or "ninguno",
                        round((time.perf_counter() - inicio_plan) * 1000),
                    )
                    return f"{respuesta}\n\n{seguimiento}" if seguimiento else respuesta

        sql_query, query_params = crear_consulta_semantica(intento)
        raw_data, error = execute_sql(db, sql_query, empresa_id, query_params, trusted_query=True)
        reply = interpret_results(
            history,
            sql_query,
            raw_data,
            error,
            model_preference,
            contexto_analisis,
            trusted_query=True,
            export_params=query_params,
        )
        followups = build_followups_marker(intento) if not error else ""
        return f"{reply}\n\n{followups}" if followups else reply

    # Loop de reintento: si la SQL falla, se le dice a GPT qué falló para que corrija
    max_retries = 2
    retry_history = list(history)  # Copia para no mutar el original
    
    for attempt in range(max_retries + 1):
        # 1. Generar SQL
        sql_query = generate_sql(retry_history, empresa_id, model_preference, contexto_analisis)
        
        # 2. Ejecutar SQL en la conexión RO
        raw_data, error = execute_sql(db, sql_query, empresa_id)
        
        # 3. Si hay error y quedan reintentos, pedirle a GPT que corrija
        if error and attempt < max_retries:
            logger.warning(f"[AUDIT SQL] Reintento {attempt + 1}/{max_retries}. SQL fallida hash={hashlib.sha256(sql_query.encode('utf-8')).hexdigest()[:12]}")
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
        final_response = interpret_results(history, sql_query, raw_data, error, model_preference, contexto_analisis)
        return final_response
    
    return """⚠️ **No pude obtener datos para responder tu pregunta** tras varios intentos.

Esto puede ocurrir si la pregunta usa términos muy genéricos o combinaciones inusuales. Prueba a ser más específico:
- ✅ *¿Cuál es el valor del inventario de la familia 'Portátiles'?*
- ✅ *¿Qué productos clase A tienen riesgo de rotura?*
- ✅ *Top 10 productos por ventas 90 días*
- ✅ *¿Cuántos artículos hay en cada cuadrante de la matriz ABC/XYZ?*"""

