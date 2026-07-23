"""Resolucion determinista de preguntas agregadas del AI Copilot."""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
import re
import unicodedata
from typing import Any
from zoneinfo import ZoneInfo


ZONA_NEGOCIO = ZoneInfo("Europe/Madrid")


@dataclass(frozen=True)
class IntentoSemantico:
    """Intencion de negocio suficiente para construir una consulta segura."""

    tipo: str
    medida: str
    periodo: str | None
    fecha_inicio: date | None
    fecha_fin: date | None
    agrupacion: str | None = None
    parametros: dict[str, Any] = field(default_factory=dict)
    descripcion: str = ""
    comparacion: bool = False
    fecha_inicio_comparacion: date | None = None
    fecha_fin_comparacion: date | None = None


def normalizar_texto(texto: str) -> str:
    """Normaliza acentos y espacios para que el parser sea estable en espanol."""
    texto = unicodedata.normalize("NFD", texto.lower())
    texto = "".join(caracter for caracter in texto if unicodedata.category(caracter) != "Mn")
    return re.sub(r"\s+", " ", texto).strip()


def _contiene(texto: str, expresiones: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{expresion}\b", texto) for expresion in expresiones)


def _fecha_hoy() -> date:
    return datetime.now(ZONA_NEGOCIO).date()


def resolver_periodo(texto: str, hoy: date | None = None) -> tuple[str | None, date | None, date | None]:
    """Resuelve periodos naturales usando siempre la zona horaria de Madrid."""
    normalizado = normalizar_texto(texto)
    fecha_hoy = hoy or _fecha_hoy()

    if _contiene(normalizado, ("ayer", "dia anterior")):
        ayer = fecha_hoy - timedelta(days=1)
        return "ayer", ayer, ayer
    if _contiene(normalizado, ("hoy", "dia actual")):
        return "hoy", fecha_hoy, fecha_hoy
    if _contiene(normalizado, ("mes actual", "este mes", "mes en curso")):
        return "mes_actual", fecha_hoy.replace(day=1), fecha_hoy

    dias = re.search(r"\b(?:ultimos?\s*)?(7|30|60|90)\s*(?:dias|d)\b", normalizado)
    if dias:
        cantidad = int(dias.group(1))
        return (
            f"ultimos_{cantidad}_dias",
            fecha_hoy - timedelta(days=cantidad - 1),
            fecha_hoy,
        )

    return None, None, None


def detectar_comparacion(texto: str) -> bool:
    normalizado = normalizar_texto(texto)
    return _contiene(normalizado, (
        "comparar", "compara", "comparalo", "compararlo", "comparacion", "frente a", "frente al", "respecto a", "respecto al", "vs", "variacion", "crecimiento", "tendencia", "evolucion"
    ))


def resolver_periodo_anterior(periodo: str | None, fecha_inicio: date | None, fecha_fin: date | None) -> tuple[date | None, date | None]:
    if not periodo or not fecha_inicio or not fecha_fin:
        return None, None
    if periodo == "mes_actual":
        fin_anterior = fecha_inicio - timedelta(days=1)
        return fin_anterior.replace(day=1), fin_anterior
    dias = (fecha_fin - fecha_inicio).days + 1
    fin_anterior = fecha_inicio - timedelta(days=1)
    return fin_anterior - timedelta(days=dias - 1), fin_anterior


def detectar_medida(texto: str) -> tuple[str | None, str | None]:
    """Devuelve la medida y el tipo de dato que representa."""
    normalizado = normalizar_texto(texto)

    if _contiene(normalizado, ("productos en cada cuadrante", "productos por cuadrante", "conteo de la matriz", "cuantos hay en la matriz")) or re.search(
        r"\bcuant(?:os|as)\b.*\bproductos?\b.*\b(?:cuadrante|matriz)\b", normalizado
    ):
        return "matriz_productos", "matriz"
    if _contiene(normalizado, ("productos en alerta", "productos estan en alerta", "productos con alertas", "alertas de stock", "riesgo de rotura", "riesgo rotura", "quiebres de stock")) or re.search(
        r"\bproductos?\b.*\ben alerta\b", normalizado
    ):
        return "productos_alerta", "alertas"
    if _contiene(normalizado, ("acciones prioritarias", "que debo priorizar", "que deberia priorizar", "que hago hoy", "plan de accion", "recomendaciones", "necesitan actuacion", "necesita accion")) or re.search(
        r"\b(?:que|cuales)\b.*\b(?:priorizar|accion|actuacion|recomendacion)\b", normalizado
    ):
        return "acciones_prioritarias", "acciones"
    if _contiene(normalizado, ("productos oportunidad", "productos con potencial", "oportunidades comerciales", "donde tengo oportunidad")) or re.search(
        r"\bproductos?\b.*\b(?:oportunidad|potencial)\b", normalizado
    ):
        return "productos_oportunidad", "oportunidades"
    if _contiene(normalizado, ("productos con sobrestock", "sobrestock", "exceso de stock", "capital inmovilizado")):
        return "productos_sobrestock", "inventario"
    if re.search(r"(?:%\s*mgd|mgd\s*%)", normalizado) or _contiene(normalizado, ("porcentaje mgd", "mgd porcentual", "porcentaje de mgd", "porcentaje de margen en destino")):
        return "mgd_pct", "rentabilidad"
    if _contiene(normalizado, ("mgd", "margen en destino", "margen destino")):
        return "mgd_eur", "rentabilidad"
    if re.search(r"(?:%\s*mg\b|mg\s*%)", normalizado) or _contiene(normalizado, ("margen porcentual", "porcentaje de margen", "margen en porcentaje", "% de margen")):
        return "margen_pct", "rentabilidad"
    if _contiene(normalizado, ("beneficio", "beneficios", "ganancia", "ganancias")):
        return "beneficio_eur", "rentabilidad"
    if _contiene(normalizado, ("mg", "margen", "rentabilidad")):
        return "margen_eur", "rentabilidad"
    if _contiene(normalizado, ("unidades en stock", "unidades de stock", "stock en unidades", "stock disponible en unidades", "inventario en unidades")) or re.search(
        r"\bunidades\b.*\b(?:stock|inventario)\b", normalizado
    ):
        return "inventario_unidades", "inventario"
    if _contiene(normalizado, ("unidades vendidas", "cantidad vendida", "uds vendidas", "ventas en unidades", "en unidades")):
        return "ventas_unidades", "ventas"
    if _contiene(normalizado, ("inventario", "stock", "capital inmovilizado", "valor del stock")):
        return "inventario_eur", "inventario"
    if _contiene(normalizado, ("ventas", "venta", "facturacion", "ingresos", "ingreso")):
        return "ventas_eur", "ventas"
    return None, None


def detectar_agrupacion(texto: str) -> str | None:
    normalizado = normalizar_texto(texto)
    if _contiene(normalizado, ("por familia", "por familias", "cada familia", "cada familias")):
        return "familia"
    if _contiene(normalizado, ("por marca", "por marcas", "cada marca", "cada marcas")):
        return "marca"
    if _contiene(normalizado, ("por matriz", "por cuadrante", "matriz abcxyz", "abcxyz")):
        return "matriz"
    return None


def detectar_filtros(texto: str) -> dict[str, str]:
    """Extrae filtros concretos que se convierten siempre en parametros SQL."""
    filtros: dict[str, str] = {}
    normalizado = normalizar_texto(texto)

    # "Clase A/B/C" se refiere a ABC (ventas EUR) y "clase X/Y/Z" a XYZ
    # (inventario EUR). Tambien aceptamos expresiones como "ABC A" o "XYZ X".
    clase_abc = re.search(r"\b(?:clase\s*(?:abc\s*)?|abc\s*)([abc])\b", normalizado)
    clase_xyz = re.search(r"\b(?:clase\s*(?:xyz\s*)?|xyz\s*)([xyz])\b", normalizado)
    cuadrante = re.search(r"\b(?:matriz|cuadrante)\s*([abc][xyz])\b", normalizado)
    if clase_abc:
        filtros["abc"] = clase_abc.group(1).upper()
    if clase_xyz:
        filtros["xyz"] = clase_xyz.group(1).upper()
    if cuadrante:
        filtros["matriz_abc"] = cuadrante.group(1).upper()

    sku = re.search(r"\bsku\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9_-]*)", texto, flags=re.IGNORECASE)
    if sku:
        filtros["sku"] = sku.group(1).strip()

    for campo in ("familia", "marca"):
        campo_en_texto = re.search(rf"\b{campo}\b", texto, flags=re.IGNORECASE)
        if campo_en_texto and re.search(r"\bpor\s+$", texto[:campo_en_texto.start()], flags=re.IGNORECASE):
            continue
        citado = re.search(rf"\b{campo}\b\s*(?:es|:)?\s*[\"']([^\"']+)[\"']", texto, flags=re.IGNORECASE)
        if citado:
            filtros[campo] = citado.group(1).strip()
            continue
        sin_comillas = re.search(
            rf"\b{campo}\b\s*(?:es|:)?\s+(.+?)(?=\s+(?:de|en|por|para|durante|ayer|hoy|este|mes|ultimos?|los|las)\b|[?,.;]|$)",
            texto,
            flags=re.IGNORECASE,
        )
        if sin_comillas:
            valor = sin_comillas.group(1).strip()
            if valor:
                filtros[campo] = valor
    return filtros


def _es_seguimiento(texto: str) -> bool:
    normalizado = normalizar_texto(texto)
    if _contiene(normalizado, ("gracias", "perfecto", "entendido", "vale")):
        return False
    if re.match(r"^(y|tambien|también|ademas|además)\b", normalizado):
        return True
    if re.match(r"^(compara|comparalo|compararlo)\b", normalizado):
        return True
    return _contiene(normalizado, (
        "por familia", "por marca", "por matriz", "en euros", "en unidades", "lo mismo", "desglosado", "desglosada"
    ))


def _tiene_filtro_no_soportado(texto: str) -> bool:
    """Evita convertir una consulta concreta en un total global incorrecto."""
    normalizado = normalizar_texto(texto)
    medida, _ = detectar_medida(normalizado)
    if medida in ("productos_alerta", "productos_sobrestock", "matriz_productos", "acciones_prioritarias", "productos_oportunidad"):
        return False
    if _contiene(normalizado, ("producto", "articulo")) and not detectar_filtros(texto) and not detectar_agrupacion(normalizado):
        return True
    if _contiene(normalizado, ("familia", "marca")) and not detectar_filtros(texto) and not detectar_agrupacion(normalizado):
        return True
    if _contiene(normalizado, ("sku",)) and not detectar_filtros(texto):
        return True
    return False


def _es_pregunta_agregada(texto: str) -> bool:
    normalizado = normalizar_texto(texto)
    palabras_agregadas = (
        "cuanto",
        "cuantos",
        "total",
        "totales",
        "suma",
        "sumatoria",
        "resumen",
        "valor",
        "importe",
        "facturacion",
        "dame las ventas",
        "dame el inventario",
        "inventario actual",
    )
    if _contiene(normalizado, palabras_agregadas):
        return True
    return detectar_agrupacion(normalizado) is not None and not _contiene(
        normalizado, ("top", "mayores", "ranking", "productos")
    )


def analizar_intencion(history: list[dict[str, Any]]) -> tuple[IntentoSemantico | None, str | None]:
    """Identifica preguntas agregadas y devuelve una aclaracion cuando falta contexto."""
    mensajes_usuario = [
        mensaje.get("content", "")
        for mensaje in history
        if mensaje.get("role") == "user" and isinstance(mensaje.get("content"), str)
    ]
    if not mensajes_usuario:
        return None, None

    actual = mensajes_usuario[-1]
    texto_analizado = actual
    periodo, fecha_inicio, fecha_fin = resolver_periodo(actual)
    comparar = detectar_comparacion(actual)
    medida, tipo = detectar_medida(actual)
    intento_anterior = None

    if len(mensajes_usuario) > 1 and _es_seguimiento(actual):
        intento_anterior, _ = analizar_intencion(history[:-1])
        if intento_anterior:
            texto_analizado = f"{mensajes_usuario[-2]} {actual}"
            if not medida:
                medida, tipo = intento_anterior.medida, intento_anterior.tipo
            if not periodo:
                periodo = intento_anterior.periodo
                fecha_inicio = intento_anterior.fecha_inicio
                fecha_fin = intento_anterior.fecha_fin
            if not comparar:
                comparar = intento_anterior.comparacion

    # Permite responder a "ayer" o "este mes" después de una pregunta de ventas.
    if not medida and periodo and len(mensajes_usuario) > 1:
        anterior = mensajes_usuario[-2]
        medida, tipo = detectar_medida(anterior)
        if medida:
            texto_analizado = f"{anterior} {actual}"

    if not medida:
        if _es_pregunta_agregada(actual):
            return None, "¿Quieres analizar ventas en euros, unidades vendidas o inventario en euros?"
        return None, None

    filtros = detectar_filtros(texto_analizado)
    if _tiene_filtro_no_soportado(actual if intento_anterior else texto_analizado):
        return None, None

    if tipo in ("ventas", "rentabilidad") and not periodo:
        return None, "¿Qué periodo quieres analizar: ayer, mes actual, últimos 30 días o últimos 90 días?"

    if tipo == "inventario" and periodo not in (None, "hoy"):
        return None, "El inventario se calcula con el último snapshot disponible. ¿Quieres que consulte el inventario actual en euros?"
    if tipo == "inventario" and comparar:
        return None, "Solo dispongo del inventario del último snapshot. Puedo darte su valor actual, pero todavía no compararlo con un periodo anterior."

    agrupacion_actual = detectar_agrupacion(actual)
    if intento_anterior:
        agrupacion = agrupacion_actual or intento_anterior.agrupacion
    else:
        agrupacion = detectar_agrupacion(texto_analizado)
    descripcion = f"{medida} agrupado por {agrupacion}" if agrupacion else medida
    fecha_inicio_comparacion, fecha_fin_comparacion = resolver_periodo_anterior(periodo, fecha_inicio, fecha_fin) if comparar else (None, None)
    parametros = {
        clave: valor
        for clave, valor in {
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "fecha_inicio_comparacion": fecha_inicio_comparacion,
            "fecha_fin_comparacion": fecha_fin_comparacion,
            **filtros,
        }.items()
        if valor is not None
    }
    if medida in ("acciones_prioritarias", "productos_oportunidad"):
        hoy_operativo = _fecha_hoy()
        parametros.update({
            "fecha_inicio_90d": hoy_operativo - timedelta(days=89),
            "fecha_fin_90d": hoy_operativo,
        })
    return IntentoSemantico(
        tipo=tipo or "",
        medida=medida or "",
        periodo=periodo,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        agrupacion=agrupacion,
        parametros=parametros,
        descripcion=descripcion,
        comparacion=comparar,
        fecha_inicio_comparacion=fecha_inicio_comparacion,
        fecha_fin_comparacion=fecha_fin_comparacion,
    ), None


def _condiciones_sql(intento: IntentoSemantico, incluir_periodo: bool = False) -> str:
    condiciones = ["p.empresa_id = :empresa_id"]
    for campo in ("familia", "marca", "sku"):
        if campo in intento.parametros:
            condiciones.append(f"p.{campo} = :{campo}")
    for campo in ("abc", "xyz", "matriz_abc"):
        if campo in intento.parametros:
            condiciones.append(f"pm.{campo} = :{campo}")
    if incluir_periodo:
        if intento.comparacion:
            condiciones.append("vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin")
        else:
            condiciones.append("vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin")
    return "\n                  AND ".join(condiciones)


def _expresiones_comparativas(intento: IntentoSemantico, expresion: str) -> tuple[str, str, str, str, str | None]:
    actual = (
        f"COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN {expresion} ELSE 0 END), 0)"
    )
    anterior = (
        f"COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN {expresion} ELSE 0 END), 0)"
    )
    if intento.medida in ("margen_pct", "mgd_pct"):
        ingresos_actual = "COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.ingreso_total ELSE 0 END), 0)"
        ingresos_anterior = "COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.ingreso_total ELSE 0 END), 0)"
        actual = f"CASE WHEN {ingresos_actual} = 0 THEN 0 ELSE {actual} / NULLIF({ingresos_actual}, 0) * 100 END"
        anterior = f"CASE WHEN {ingresos_anterior} = 0 THEN 0 ELSE {anterior} / NULLIF({ingresos_anterior}, 0) * 100 END"
    variacion = f"({actual}) - ({anterior})"
    variacion_pct = f"CASE WHEN ABS({anterior}) = 0 THEN 0 ELSE ({variacion}) / ABS({anterior}) * 100 END"
    variacion_pp = variacion if intento.medida in ("margen_pct", "mgd_pct") else None
    return actual, anterior, variacion, variacion_pct, variacion_pp


def crear_consulta_semantica(intento: IntentoSemantico) -> tuple[str, dict[str, Any]]:
    """Construye SQL parametrizado para las agregaciones de negocio mas frecuentes."""
    if intento.medida in ("acciones_prioritarias", "productos_oportunidad"):
        condiciones = _condiciones_sql(intento)
        solo_oportunidades = intento.medida == "productos_oportunidad"
        filtros_accion = (
            "pm.abc IN ('A', 'B') AND inv.stock_disponible > 0 "
            "AND p.precio_venta > p.costo_unitario AND COALESCE(v90.ventas_90d, 0) > 0"
            if solo_oportunidades
            else "((pm.riesgo_rotura = TRUE AND pm.abc IN ('A', 'B')) "
                 "OR (pm.dias_cobertura > 120 AND (p.costo_unitario * inv.stock_disponible) > 1000) "
                 "OR (pm.abc IN ('A', 'B') AND inv.stock_disponible > 0 AND p.precio_venta > p.costo_unitario))"
        )
        tipo_accion = (
            "'Oportunidad comercial'"
            if solo_oportunidades
            else "CASE WHEN pm.riesgo_rotura = TRUE AND pm.abc IN ('A', 'B') THEN 'Rotura de producto clave' "
                 "WHEN pm.dias_cobertura > 120 AND (p.costo_unitario * inv.stock_disponible) > 1000 THEN 'Capital inmovilizado' "
                 "ELSE 'Oportunidad comercial' END"
        )
        sql = f"""
            WITH ventas_90 AS (
                SELECT vh.producto_id,
                       COALESCE(SUM(vh.ingreso_total), 0) AS ventas_90d,
                       COALESCE(SUM(vh.margen_bruto_eur), 0) AS beneficio_90d
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                WHERE p.empresa_id = :empresa_id
                  AND vh.fecha_venta BETWEEN :fecha_inicio_90d AND :fecha_fin_90d
                GROUP BY vh.producto_id
            )
            SELECT p.sku,
                   p.nombre,
                   p.familia,
                   p.marca,
                   pm.matriz_abc,
                   pm.abc,
                   pm.xyz,
                   pm.dias_cobertura,
                   inv.stock_disponible AS stock_unidades,
                   (p.costo_unitario * inv.stock_disponible) AS inventario_eur,
                   COALESCE(v90.ventas_90d, 0) AS ventas_90d,
                   COALESCE(v90.beneficio_90d, 0) AS beneficio_90d,
                   ((p.precio_venta - p.costo_unitario) * inv.stock_disponible) AS margen_stock_eur,
                   {tipo_accion} AS tipo_accion
            FROM productos p
            JOIN inventario_snapshot inv ON inv.producto_id = p.id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            LEFT JOIN ventas_90 v90 ON v90.producto_id = p.id
            WHERE {condiciones}
              AND {filtros_accion}
            ORDER BY
                CASE
                    WHEN pm.riesgo_rotura = TRUE AND pm.abc IN ('A', 'B') THEN 1
                    WHEN pm.dias_cobertura > 120 AND (p.costo_unitario * inv.stock_disponible) > 1000 THEN 2
                    ELSE 3
                END,
                COALESCE(v90.ventas_90d, 0) DESC,
                inventario_eur DESC
            LIMIT 20
        """
        return sql, dict(intento.parametros)

    if intento.medida == "matriz_productos":
        condiciones = _condiciones_sql(intento)
        sql = """
            SELECT COALESCE(pm.matriz_abc, 'Sin clasificar') AS cuadrante,
                   COUNT(DISTINCT p.id) AS productos,
                   COALESCE(SUM(p.costo_unitario * inv.stock_disponible), 0) AS inventario_eur
            FROM productos p
            JOIN inventario_snapshot inv ON inv.producto_id = p.id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            WHERE {condiciones}
            GROUP BY COALESCE(pm.matriz_abc, 'Sin clasificar')
            ORDER BY inventario_eur DESC
        """.format(condiciones=condiciones)
        return sql, dict(intento.parametros)

    if intento.medida in ("productos_alerta", "productos_sobrestock"):
        condicion = "pm.riesgo_rotura = TRUE" if intento.medida == "productos_alerta" else "pm.dias_cobertura > 120"
        alias = "productos_alerta" if intento.medida == "productos_alerta" else "productos_sobrestock"
        condiciones = _condiciones_sql(intento)
        sql = f"""
            SELECT COUNT(DISTINCT p.id) AS {alias},
                   COALESCE(SUM(p.costo_unitario * inv.stock_disponible), 0) AS inventario_eur
            FROM productos p
            JOIN inventario_snapshot inv ON inv.producto_id = p.id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            WHERE {condiciones}
              AND {condicion}
        """
        return sql, dict(intento.parametros)

    if intento.tipo in ("ventas", "rentabilidad"):
        if intento.medida == "ventas_eur":
            expresion = "vh.ingreso_total"
            alias = "ventas_eur"
        elif intento.medida == "ventas_unidades":
            expresion = "vh.cantidad_vendida"
            alias = "ventas_unidades"
        elif intento.medida in ("beneficio_eur", "margen_eur", "margen_pct"):
            expresion = "vh.margen_bruto_eur"
            alias = "beneficio_eur" if intento.medida == "beneficio_eur" else "margen_eur"
        elif intento.medida in ("mgd_eur", "mgd_pct"):
            expresion = "vh.margen_destino_eur"
            alias = "mgd_eur"
        else:
            expresion = "vh.margen_bruto_eur"
            alias = "beneficio_eur"
        condiciones = _condiciones_sql(intento, incluir_periodo=True)
        es_porcentaje = intento.medida in ("margen_pct", "mgd_pct")
        expresion_agregada = (
            "CASE WHEN COALESCE(SUM(vh.ingreso_total), 0) = 0 THEN 0 "
            f"ELSE COALESCE(SUM({expresion}), 0) / NULLIF(SUM(vh.ingreso_total), 0) * 100 END"
            if es_porcentaje
            else f"COALESCE(SUM({expresion}), 0)"
        )
        alias_agregado = intento.medida if es_porcentaje else alias
        if intento.agrupacion == "familia":
            agrupacion = "COALESCE(p.familia, 'Sin familia')"
        elif intento.agrupacion == "marca":
            agrupacion = "COALESCE(p.marca, 'Sin marca')"
        elif intento.agrupacion == "matriz":
            agrupacion = "COALESCE(pm.matriz_abc, 'Sin clasificar')"
        else:
            agrupacion = None

        join_metricas = (
            " LEFT JOIN producto_metricas pm ON pm.producto_id = p.id"
            if intento.agrupacion == "matriz" or any(campo in intento.parametros for campo in ("abc", "xyz", "matriz_abc"))
            else ""
        )
        if intento.comparacion:
            actual_sql, anterior_sql, variacion_sql, variacion_pct_sql, variacion_pp_sql = _expresiones_comparativas(intento, expresion)
            columnas_comparacion = (
                f"{actual_sql} AS periodo_actual, {anterior_sql} AS periodo_anterior, "
                f"{variacion_sql} AS variacion_absoluta, {variacion_pct_sql} AS variacion_pct"
            )
            if variacion_pp_sql:
                columnas_comparacion += f", {variacion_pp_sql} AS variacion_pp"
            productos_actuales = "COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END)"
            if agrupacion:
                sql = f"""
                    SELECT {agrupacion} AS agrupacion,
                           {columnas_comparacion},
                           {productos_actuales} AS productos
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_metricas}
                    WHERE {condiciones}
                    GROUP BY {agrupacion}
                    ORDER BY variacion_pct DESC
                """
            else:
                sql = f"""
                    SELECT {columnas_comparacion},
                           {productos_actuales} AS productos
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_metricas}
                    WHERE {condiciones}
                """
            return sql, dict(intento.parametros)
        if agrupacion:
            sql = f"""
                SELECT {agrupacion} AS agrupacion,
                       {expresion_agregada} AS {alias_agregado},
                       COUNT(DISTINCT vh.producto_id) AS productos
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                {join_metricas}
                WHERE {condiciones}
                GROUP BY {agrupacion}
                ORDER BY {alias_agregado} DESC
            """
        else:
            sql = f"""
                   SELECT {expresion_agregada} AS {alias_agregado},
                          COUNT(DISTINCT vh.producto_id) AS productos
                   FROM ventas_historicas vh
                   JOIN productos p ON p.id = vh.producto_id
                   {join_metricas}
                   WHERE {condiciones}
               """
        return sql, dict(intento.parametros)

    if intento.medida == "inventario_unidades":
        expresion = "inv.stock_disponible"
        alias = "inventario_unidades"
    else:
        expresion = "p.costo_unitario * inv.stock_disponible"
        alias = "inventario_eur"

    if intento.agrupacion == "familia":
        agrupacion = "COALESCE(p.familia, 'Sin familia')"
    elif intento.agrupacion == "marca":
        agrupacion = "COALESCE(p.marca, 'Sin marca')"
    elif intento.agrupacion == "matriz":
        agrupacion = "COALESCE(pm.matriz_abc, 'Sin clasificar')"
    else:
        agrupacion = None

    join_metricas = (
        " LEFT JOIN producto_metricas pm ON pm.producto_id = p.id"
        if intento.agrupacion == "matriz" or any(campo in intento.parametros for campo in ("abc", "xyz", "matriz_abc"))
        else ""
    )
    condiciones = _condiciones_sql(intento)
    if agrupacion:
        sql = f"""
            SELECT {agrupacion} AS agrupacion,
                   COALESCE(SUM({expresion}), 0) AS {alias},
                   COUNT(DISTINCT p.id) AS productos
            FROM productos p
            JOIN inventario_snapshot inv ON inv.producto_id = p.id
            {join_metricas}
            WHERE {condiciones}
            GROUP BY {agrupacion}
            ORDER BY {alias} DESC
        """
    else:
        sql = f"""
            SELECT COALESCE(SUM({expresion}), 0) AS {alias},
                   COALESCE(SUM(inv.stock_disponible), 0) AS inventario_unidades,
                   COUNT(DISTINCT p.id) AS productos
            FROM productos p
            JOIN inventario_snapshot inv ON inv.producto_id = p.id
            {join_metricas}
            WHERE {condiciones}
        """
    return sql, dict(intento.parametros)
