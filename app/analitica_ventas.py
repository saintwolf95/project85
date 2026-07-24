"""Definiciones reutilizables para la analitica de ventas del Copilot.

Esta capa no depende de inventario. En particular, la clasificacion ABC se
calcula siempre desde las ventas reales de los ultimos 90 dias.
"""

from dataclasses import dataclass
from datetime import date, timedelta
import re
import unicodedata
from typing import Any

from .semantic_metrics import CORTE_PRINCIPAL, CORTE_SECUNDARIO, DIAS_CLASIFICACION_ABC


METRICAS_VENTAS = {
    "ventas_eur": {
        "expresion": "vh.ingreso_total",
        "etiqueta": "Ventas",
        "formato": "eur",
    },
    "ventas_unidades": {
        "expresion": "vh.cantidad_vendida",
        "etiqueta": "Unidades vendidas",
        "formato": "unidades",
    },
    "margen_eur": {
        "expresion": "vh.margen_bruto_eur",
        "etiqueta": "Margen bruto",
        "formato": "eur",
    },
    "mgd_eur": {
        "expresion": "vh.margen_destino_eur",
        "etiqueta": "Margen en destino",
        "formato": "eur",
    },
}


DIMENSIONES_VENTAS = {
    "familia": "COALESCE(p.familia, 'Sin familia')",
    "marca": "COALESCE(p.marca, 'Sin marca')",
    "familia_marca": "COALESCE(p.familia_marca, 'Sin familia/marca')",
    "seccion": "COALESCE(p.seccion, 'Sin seccion')",
    "product_manager": "COALESCE(p.product_manager, 'Sin Product Manager')",
}

ENCABEZADOS_RESPUESTA_ANALITICA = (
    "Conclusión ejecutiva",
    "Principales impulsores",
    "Top 5 caídas",
    "Lectura ABC",
    "Acciones verificables",
    "Limitaciones",
)


@dataclass(frozen=True)
class ConsultaAnalitica:
    nombre: str
    sql: str
    parametros: dict[str, Any]


@dataclass(frozen=True)
class PlanAnaliticoVentas:
    periodo_actual: tuple[date, date]
    periodo_anterior: tuple[date, date]
    consultas: tuple[ConsultaAnalitica, ...]


def es_pregunta_gerencial(texto: str) -> bool:
    """Identifica preguntas que exigen diagnostico y no un total aislado."""
    normalizado = unicodedata.normalize("NFD", texto.lower())
    normalizado = "".join(caracter for caracter in normalizado if unicodedata.category(caracter) != "Mn")
    return bool(re.search(
        r"\b(como va|como vamos|estado de la empresa|resumen ejecutivo|salud del negocio|"
        r"por que (?:cae|caen|bajan|bajamos)|explica (?:la )?caida|que esta pasando)\b",
        normalizado,
    ))


def rango_clasificacion_abc(fecha_referencia: date) -> tuple[date, date]:
    """Devuelve los 90 dias inclusivos que definen el ABC comercial."""
    return fecha_referencia - timedelta(days=DIAS_CLASIFICACION_ABC - 1), fecha_referencia


def crear_cte_abc_ventas() -> str:
    """Genera la CTE portable PostgreSQL/SQLite para clasificar todos los SKU.

    Los articulos sin ventas se clasifican como C. El segundo criterio de orden
    garantiza que el corte sea estable cuando dos articulos facturan lo mismo.
    """
    return f"""
        WITH ventas_abc AS (
            SELECT p.id AS producto_id,
                   COALESCE(SUM(
                       CASE
                           WHEN vh.fecha_venta BETWEEN :fecha_abc_inicio AND :fecha_abc_fin
                           THEN vh.ingreso_total
                           ELSE 0
                       END
                   ), 0) AS ventas_abc_90d
            FROM productos p
            LEFT JOIN ventas_historicas vh ON vh.producto_id = p.id
            WHERE p.empresa_id = :empresa_id
            GROUP BY p.id
        ), acumulado_abc AS (
            SELECT producto_id,
                   ventas_abc_90d,
                   SUM(ventas_abc_90d) OVER (
                       ORDER BY ventas_abc_90d DESC, producto_id ASC
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                   ) / NULLIF(SUM(ventas_abc_90d) OVER (), 0) AS porcentaje_acumulado,
                   SUM(ventas_abc_90d) OVER () AS ventas_totales_abc
            FROM ventas_abc
        ), clasificacion_abc AS (
            SELECT producto_id,
                   ventas_abc_90d,
                   CASE
                       WHEN ventas_totales_abc <= 0 THEN 'C'
                       WHEN porcentaje_acumulado <= {CORTE_PRINCIPAL} THEN 'A'
                       WHEN porcentaje_acumulado <= {CORTE_SECUNDARIO} THEN 'B'
                       ELSE 'C'
                   END AS abc
            FROM acumulado_abc
        )
    """


def _rango_anterior(periodo: str | None, inicio: date, fin: date) -> tuple[date, date]:
    if periodo == "mes_actual":
        fin_anterior = inicio - timedelta(days=1)
        return fin_anterior.replace(day=1), fin_anterior
    if periodo == "anio_fiscal":
        return inicio.replace(year=inicio.year - 1), fin.replace(year=fin.year - 1)
    dias = (fin - inicio).days + 1
    fin_anterior = inicio - timedelta(days=1)
    return fin_anterior - timedelta(days=dias - 1), fin_anterior


def _expresiones_comparativas(expresion: str, prefijo: str) -> str:
    actual = (
        f"COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin "
        f"THEN {expresion} ELSE 0 END), 0)"
    )
    anterior = (
        f"COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_anterior AND :fecha_fin_anterior "
        f"THEN {expresion} ELSE 0 END), 0)"
    )
    variacion = f"({actual}) - ({anterior})"
    variacion_pct = f"CASE WHEN ABS({anterior}) = 0 THEN 0 ELSE ({variacion}) / ABS({anterior}) * 100 END"
    return (
        f"{actual} AS {prefijo}_periodo_actual, "
        f"{anterior} AS {prefijo}_periodo_anterior, "
        f"{variacion} AS {prefijo}_variacion_absoluta, "
        f"{variacion_pct} AS {prefijo}_variacion_pct"
    )


def crear_plan_analitico_ventas(intento: Any) -> PlanAnaliticoVentas | None:
    """Construye el dossier multiconsulta para diagnosticos comerciales.

    Todas las consultas son plantillas internas, parametrizadas y limitadas. El
    modelo recibe sus resultados, no tiene que inventar la explicacion causal.
    """
    if not intento.fecha_inicio or not intento.fecha_fin:
        return None

    inicio, fin = intento.fecha_inicio, intento.fecha_fin
    inicio_anterior, fin_anterior = _rango_anterior(intento.periodo, inicio, fin)
    inicio_abc, fin_abc = rango_clasificacion_abc(fin)
    parametros = {
        "fecha_inicio": inicio,
        "fecha_fin": fin,
        "fecha_inicio_anterior": inicio_anterior,
        "fecha_fin_anterior": fin_anterior,
        "fecha_abc_inicio": inicio_abc,
        "fecha_abc_fin": fin_abc,
    }
    alcance = "vh.fecha_venta BETWEEN :fecha_inicio_anterior AND :fecha_fin"
    ventas = _expresiones_comparativas("vh.ingreso_total", "ventas")
    unidades = _expresiones_comparativas("vh.cantidad_vendida", "unidades")
    margen = _expresiones_comparativas("vh.margen_bruto_eur", "margen")
    mgd = _expresiones_comparativas("vh.margen_destino_eur", "mgd")
    consultas = [
        ConsultaAnalitica(
            "resumen",
            f"""
                SELECT {ventas}, {unidades}, {margen}, {mgd},
                       COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END) AS productos_actuales,
                       COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_anterior AND :fecha_fin_anterior THEN vh.producto_id END) AS productos_anteriores
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                WHERE p.empresa_id = :empresa_id AND {alcance}
            """,
            parametros,
        ),
        ConsultaAnalitica(
            "tendencia_diaria",
            """
                SELECT vh.fecha_venta AS fecha,
                       COALESCE(SUM(vh.ingreso_total), 0) AS ventas_eur,
                       COALESCE(SUM(vh.cantidad_vendida), 0) AS unidades,
                       COALESCE(SUM(vh.margen_bruto_eur), 0) AS margen_eur,
                       COALESCE(SUM(vh.margen_destino_eur), 0) AS mgd_eur
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                WHERE p.empresa_id = :empresa_id
                  AND vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin
                GROUP BY vh.fecha_venta
                ORDER BY vh.fecha_venta ASC
            """,
            parametros,
        ),
    ]
    for nombre, dimension in DIMENSIONES_VENTAS.items():
        consultas.append(ConsultaAnalitica(
            f"impulsores_{nombre}",
            f"""
                SELECT {dimension} AS agrupacion, {ventas}, {margen},
                       COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END) AS productos
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                WHERE p.empresa_id = :empresa_id AND {alcance}
                GROUP BY {dimension}
                ORDER BY ventas_variacion_absoluta ASC, agrupacion ASC
                LIMIT 10
            """,
            parametros,
        ))
    consultas.extend((
        ConsultaAnalitica(
            "top_caidas_sku",
            f"""{crear_cte_abc_ventas()}
                SELECT p.sku, p.nombre, COALESCE(p.familia, 'Sin familia') AS familia,
                       COALESCE(p.marca, 'Sin marca') AS marca, ca.abc, {ventas}, {margen}
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                LEFT JOIN clasificacion_abc ca ON ca.producto_id = p.id
                WHERE p.empresa_id = :empresa_id AND {alcance}
                GROUP BY p.sku, p.nombre, p.familia, p.marca, ca.abc
                ORDER BY ventas_variacion_absoluta ASC, p.sku ASC
                LIMIT 5
            """,
            parametros,
        ),
        ConsultaAnalitica(
            "abc_ventas",
            f"""{crear_cte_abc_ventas()}
                SELECT ca.abc,
                       COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END) AS productos,
                       {ventas}, {margen}
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                JOIN clasificacion_abc ca ON ca.producto_id = p.id
                WHERE p.empresa_id = :empresa_id AND {alcance}
                GROUP BY ca.abc
                ORDER BY ca.abc ASC
            """,
            parametros,
        ),
    ))
    return PlanAnaliticoVentas(
        periodo_actual=(inicio, fin),
        periodo_anterior=(inicio_anterior, fin_anterior),
        consultas=tuple(consultas),
    )


def es_dossier_analitico(datos: Any) -> bool:
    return isinstance(datos, dict) and isinstance(datos.get("resultados"), dict)


def contrato_respuesta_analitica() -> str:
    """Instrucciones que convierten el dossier en una respuesta fundamentada."""
    encabezados = " | ".join(f"## {encabezado}" for encabezado in ENCABEZADOS_RESPUESTA_ANALITICA)
    return f"""
CONTRATO OBLIGATORIO PARA EL DOSSIER ANALÍTICO:
- Usa exactamente estos apartados Markdown y en este orden: {encabezados}.
- Cada conclusión debe citar al menos un importe, porcentaje, periodo o producto del dossier.
- Explica únicamente impulsores observados en los datos. No presentes una correlación como causa comercial demostrada.
- No inventes cifras, porcentajes, precios, motivos de clientes ni información fuera del dossier.
- En “Top 5 caídas” muestra una tabla Markdown con SKU, producto, familia, ABC, periodo actual, periodo anterior y variación.
- En “Acciones verificables” indica qué segmento revisar, qué métrica lo justifica y qué desglose debe consultarse después. Prohíbe frases genéricas como “potenciar ventas”, “mejorar campañas” o “optimizar la estrategia”.
- Si no hay caída o no hay datos suficientes, dilo explícitamente en el apartado correspondiente.
"""


def respuesta_analitica_cumple_contrato(respuesta: str) -> bool:
    if not isinstance(respuesta, str) or not re.search(r"\d", respuesta):
        return False
    respuesta_normalizada = respuesta.casefold()
    frases_genericas = ("potenciar ventas", "mejorar campañas", "optimizar la estrategia")
    return (
        all(encabezado.casefold() in respuesta_normalizada for encabezado in ENCABEZADOS_RESPUESTA_ANALITICA)
        and "| sku" in respuesta_normalizada
        and not any(frase in respuesta_normalizada for frase in frases_genericas)
    )


def _numero(valor: Any) -> float:
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0.0


def _eur(valor: Any) -> str:
    importe = _numero(valor)
    texto = f"{abs(importe):,.2f}"
    signo = "-" if importe < 0 else ""
    return f"{signo}€{texto.replace(',', 'X').replace('.', ',').replace('X', '.')}"


def _porcentaje(valor: Any) -> str:
    return f"{_numero(valor):.1f}".replace(".", ",") + "%"


def _primera_fila(resultados: dict[str, Any], nombre: str) -> dict[str, Any]:
    filas = resultados.get(nombre, [])
    return filas[0] if isinstance(filas, list) and filas and isinstance(filas[0], dict) else {}


def _principal_impulsor(resultados: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    candidatos: list[tuple[str, dict[str, Any]]] = []
    for dimension in DIMENSIONES_VENTAS:
        for fila in resultados.get(f"impulsores_{dimension}", []):
            if isinstance(fila, dict) and _numero(fila.get("ventas_variacion_absoluta")) < 0:
                candidatos.append((dimension, fila))
    if not candidatos:
        return None
    return min(candidatos, key=lambda candidato: _numero(candidato[1].get("ventas_variacion_absoluta")))


def renderizar_respuesta_analitica(dossier: dict[str, Any]) -> str:
    """Respaldo determinista si el modelo no respeta el contrato analítico."""
    resultados = dossier.get("resultados", {})
    resumen = _primera_fila(resultados, "resumen")
    ventas_actuales = resumen.get("ventas_periodo_actual", 0)
    ventas_anteriores = resumen.get("ventas_periodo_anterior", 0)
    variacion = resumen.get("ventas_variacion_absoluta", 0)
    variacion_pct = resumen.get("ventas_variacion_pct", 0)
    periodo_actual = dossier.get("periodo_actual", {})
    periodo_anterior = dossier.get("periodo_anterior", {})
    sentido = "crecen" if _numero(variacion) >= 0 else "caen"
    lineas = [
        "## Conclusión ejecutiva",
        (
            f"Las ventas {sentido} hasta {_eur(variacion)} ({_porcentaje(variacion_pct)}) "
            f"frente al periodo comparable: {_eur(ventas_actuales)} entre "
            f"{periodo_actual.get('inicio', 'N/D')} y {periodo_actual.get('fin', 'N/D')}, "
            f"frente a {_eur(ventas_anteriores)} entre {periodo_anterior.get('inicio', 'N/D')} "
            f"y {periodo_anterior.get('fin', 'N/D')}."
        ),
        "\n## Principales impulsores",
    ]
    impulsor = _principal_impulsor(resultados)
    if impulsor:
        dimension, fila = impulsor
        lineas.append(
            f"- El principal impulsor observado es {dimension} **{fila.get('agrupacion', 'Sin clasificar')}**: "
            f"{_eur(fila.get('ventas_variacion_absoluta'))} ({_porcentaje(fila.get('ventas_variacion_pct'))}) "
            f"respecto al periodo anterior. Este dato explica el movimiento contable; no demuestra por sí solo su causa comercial."
        )
    else:
        lineas.append("- No hay un impulsor negativo identificable con los datos del periodo comparable.")

    lineas.extend(("\n## Top 5 caídas", "| SKU | Producto | Familia | ABC | Periodo actual | Periodo anterior | Variación |", "| --- | --- | --- | --- | ---: | ---: | ---: |"))
    caidas = [
        fila for fila in resultados.get("top_caidas_sku", [])
        if isinstance(fila, dict) and _numero(fila.get("ventas_variacion_absoluta")) < 0
    ]
    if caidas:
        for fila in caidas[:5]:
            lineas.append(
                f"| {fila.get('sku', 'N/D')} | {fila.get('nombre') or 'Sin nombre'} | "
                f"{fila.get('familia', 'Sin familia')} | {fila.get('abc', 'N/D')} | "
                f"{_eur(fila.get('ventas_periodo_actual'))} | {_eur(fila.get('ventas_periodo_anterior'))} | "
                f"{_eur(fila.get('ventas_variacion_absoluta'))} |"
            )
    else:
        lineas.append("| N/D | No se identifican SKU con caída en el periodo | - | - | - | - | - |")

    lineas.extend(("\n## Lectura ABC", "| Clase | Productos | Ventas actuales | Variación |", "| --- | ---: | ---: | ---: |"))
    abc = resultados.get("abc_ventas", [])
    if abc:
        for fila in abc:
            lineas.append(
                f"| {fila.get('abc', 'N/D')} | {int(_numero(fila.get('productos')))} | "
                f"{_eur(fila.get('ventas_periodo_actual'))} | {_eur(fila.get('ventas_variacion_absoluta'))} |"
            )
    else:
        lineas.append("| N/D | 0 | €0,00 | €0,00 |")

    lineas.append("\n## Acciones verificables")
    if impulsor:
        dimension, fila = impulsor
        lineas.append(
            f"- Revisar **{dimension} {fila.get('agrupacion', 'Sin clasificar')}**: su variación de "
            f"{_eur(fila.get('ventas_variacion_absoluta'))} justifica desglosar por marca y SKU antes de decidir una intervención."
        )
    if caidas:
        primer_sku = caidas[0]
        lineas.append(
            f"- Analizar el SKU **{primer_sku.get('sku', 'N/D')}** y sus unidades, precio medio y margen; "
            f"es la mayor caída identificada ({_eur(primer_sku.get('ventas_variacion_absoluta'))})."
        )
    if not impulsor and not caidas:
        lineas.append("- No se propone una intervención hasta disponer de una variación negativa segmentada.")

    lineas.extend((
        "\n## Limitaciones",
        "- El análisis describe variaciones observadas en ventas. No permite atribuir causas comerciales sin datos adicionales de precio, disponibilidad, promociones o mercado.",
    ))
    return "\n".join(lineas)


def _texto_para_prompt(valor: Any) -> str:
    return re.sub(r"\s+", " ", str(valor or "Sin clasificar")).strip().replace('"', "'")


def crear_acciones_seguimiento(dossier: dict[str, Any]) -> list[dict[str, str]]:
    """Propone siguientes preguntas a partir de hallazgos concretos del dossier."""
    resultados = dossier.get("resultados", {})
    acciones: list[dict[str, str]] = []
    impulsor = _principal_impulsor(resultados)
    if impulsor:
        dimension, fila = impulsor
        segmento = _texto_para_prompt(fila.get("agrupacion"))
        acciones.append({
            "label": f"Explicar caída de {segmento}",
            "prompt": (
                f"Desglosa la variación de ventas de {dimension} '{segmento}' por marca y SKU entre el periodo actual y el anterior. "
                "Indica los 5 artículos que más explican la caída, sus ventas, variación en euros y clase ABC."
            ),
        })

    caidas = [
        fila for fila in resultados.get("top_caidas_sku", [])
        if isinstance(fila, dict) and _numero(fila.get("ventas_variacion_absoluta")) < 0
    ]
    if caidas:
        principal = caidas[0]
        sku = _texto_para_prompt(principal.get("sku"))
        acciones.append({
            "label": f"Analizar SKU {sku}",
            "prompt": (
                f"Para el SKU '{sku}', separa la caída entre unidades vendidas, precio medio, margen y MGD frente al periodo anterior. "
                "Incluye familia, marca y clase ABC para valorar su prioridad comercial."
            ),
        })

    abc_en_caida = next((
        fila for fila in resultados.get("abc_ventas", [])
        if isinstance(fila, dict) and fila.get("abc") == "A" and _numero(fila.get("ventas_variacion_absoluta")) < 0
    ), None)
    if abc_en_caida:
        acciones.append({
            "label": "Revisar caída de clase A",
            "prompt": (
                "Identifica los productos clase A que más han caído frente al periodo anterior y calcula cuánto aportan al descenso total. "
                "Agrúpalos por familia y marca."
            ),
        })

    resumen = _primera_fila(resultados, "resumen")
    if resumen and _numero(resumen.get("margen_variacion_absoluta")) < 0:
        acciones.append({
            "label": "Separar ventas y margen",
            "prompt": (
                "Compara la variación de ventas, margen bruto y MGD por familia. "
                "Señala dónde el margen cae más rápido que las ventas y cuantifica la diferencia."
            ),
        })

    return acciones[:4]
