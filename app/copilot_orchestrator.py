"""Resolucion determinista de preguntas agregadas del AI Copilot."""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
import re
import unicodedata
from typing import Any
from zoneinfo import ZoneInfo

from .analitica_ventas import crear_cte_abc_ventas, es_pregunta_gerencial, rango_clasificacion_abc


ZONA_NEGOCIO = ZoneInfo("Europe/Madrid")
DIMENSIONES_MULTIPLES = frozenset({"cliente", "seccion", "familia", "marca", "sku", "comercial_cliente", "comercial_factura"})


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
    limite: int | None = None
    orden: str = "desc"
    ajuste_fecha: str | None = None
    dimensiones: tuple[str, ...] = ()
    limites_dimensiones: dict[str, int] = field(default_factory=dict)
    metricas_solicitadas: tuple[str, ...] = ()


def serializar_intento(intento: IntentoSemantico | None) -> dict[str, Any] | None:
    """Persiste únicamente el contrato analítico, nunca el texto del modelo."""
    if not intento:
        return None
    def serializar_valor(valor: Any) -> Any:
        return valor.isoformat() if isinstance(valor, date) else valor

    return {
        "tipo": intento.tipo,
        "medida": intento.medida,
        "periodo": intento.periodo,
        "fecha_inicio": serializar_valor(intento.fecha_inicio),
        "fecha_fin": serializar_valor(intento.fecha_fin),
        "agrupacion": intento.agrupacion,
        "parametros": {clave: serializar_valor(valor) for clave, valor in intento.parametros.items()},
        "descripcion": intento.descripcion,
        "comparacion": intento.comparacion,
        "fecha_inicio_comparacion": serializar_valor(intento.fecha_inicio_comparacion),
        "fecha_fin_comparacion": serializar_valor(intento.fecha_fin_comparacion),
        "limite": intento.limite,
        "orden": intento.orden,
        "ajuste_fecha": intento.ajuste_fecha,
        "dimensiones": list(intento.dimensiones),
        "limites_dimensiones": intento.limites_dimensiones,
        "metricas_solicitadas": list(intento.metricas_solicitadas),
    }


def restaurar_intento(datos: dict[str, Any] | None) -> IntentoSemantico | None:
    """Restaura un contrato analítico previamente validado para un seguimiento."""
    if not isinstance(datos, dict) or not datos.get("medida") or not datos.get("tipo"):
        return None

    def fecha(valor: Any) -> date | None:
        if isinstance(valor, date):
            return valor
        if isinstance(valor, str):
            try:
                return date.fromisoformat(valor)
            except ValueError:
                return None
        return None

    parametros = {
        clave: fecha(valor) if clave.startswith("fecha_") else valor
        for clave, valor in (datos.get("parametros") or {}).items()
    }
    return IntentoSemantico(
        tipo=str(datos["tipo"]),
        medida=str(datos["medida"]),
        periodo=datos.get("periodo"),
        fecha_inicio=fecha(datos.get("fecha_inicio")),
        fecha_fin=fecha(datos.get("fecha_fin")),
        agrupacion=datos.get("agrupacion"),
        parametros=parametros,
        descripcion=str(datos.get("descripcion") or ""),
        comparacion=bool(datos.get("comparacion")),
        fecha_inicio_comparacion=fecha(datos.get("fecha_inicio_comparacion")),
        fecha_fin_comparacion=fecha(datos.get("fecha_fin_comparacion")),
        limite=datos.get("limite") if isinstance(datos.get("limite"), int) else None,
        orden=datos.get("orden") if datos.get("orden") in {"asc", "desc"} else "desc",
        ajuste_fecha=datos.get("ajuste_fecha") if isinstance(datos.get("ajuste_fecha"), str) else None,
        dimensiones=tuple(d for d in datos.get("dimensiones", []) if d in DIMENSIONES_MULTIPLES) if isinstance(datos.get("dimensiones"), list) else (),
        limites_dimensiones={k: v for k, v in (datos.get("limites_dimensiones") or {}).items() if k in DIMENSIONES_MULTIPLES and isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 50} if isinstance(datos.get("limites_dimensiones"), dict) else {},
        metricas_solicitadas=tuple(m for m in datos.get("metricas_solicitadas", []) if m in {"ventas_eur", "ventas_unidades", "margen_eur", "mgd_eur"}) if isinstance(datos.get("metricas_solicitadas"), list) else (),
    )


def normalizar_texto(texto: str) -> str:
    """Normaliza acentos y espacios para que el parser sea estable en espanol."""
    if "Ã" in texto or "Â" in texto:
        try:
            texto = texto.encode("latin-1").decode("utf-8")
        except UnicodeError:
            pass
    texto = unicodedata.normalize("NFD", texto.lower())
    texto = "".join(caracter for caracter in texto if unicodedata.category(caracter) != "Mn")
    return re.sub(r"\s+", " ", texto).strip()


def _contiene(texto: str, expresiones: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{expresion}\b", texto) for expresion in expresiones)


def _fecha_hoy() -> date:
    return datetime.now(ZONA_NEGOCIO).date()


def _inicio_anio_fiscal(fecha: date) -> date:
    """El ejercicio de Five Minutes comienza el 1 de mayo."""
    return date(fecha.year if fecha.month >= 5 else fecha.year - 1, 5, 1)


def _parsear_fecha(valor: str) -> date | None:
    for formato in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(valor, formato).date()
        except ValueError:
            continue
    return None


MESES_ES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dic": 12,
}


def _ultimo_dia_mes(anio: int, mes: int) -> date:
    siguiente_anio, siguiente_mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)
    return date(siguiente_anio, siguiente_mes, 1) - timedelta(days=1)


def _fecha_normalizada(anio: int, mes: int, dia: int) -> tuple[date, bool]:
    """Devuelve una fecha válida y señala si se ajustó un día imposible.

    En preguntas analíticas es mejor corregir de forma explícita «31 de
    septiembre» a 30 de septiembre que abandonar silenciosamente el contexto.
    """
    ultimo_dia = _ultimo_dia_mes(anio, mes).day
    fecha = date(anio, mes, min(max(dia, 1), ultimo_dia))
    return fecha, dia != fecha.day


def _resolver_comparacion_fiscal(texto: str) -> tuple[date, date, date, date, str | None] | None:
    """Resuelve comparativas explícitas como «FY2025 vs FY2026 hasta septiembre».

    El año fiscal de Five Minutes va de mayo a abril. El primer rango devuelto
    es el más reciente y el segundo el ejercicio anterior para reutilizar el
    contrato comparativo del resto del Copilot.
    """
    normalizado = normalizar_texto(texto)
    ejercicios = sorted({int(valor) for valor in re.findall(r"\bfy\s*(20\d{2})\b", normalizado)})
    if len(ejercicios) != 2:
        return None

    corte = re.search(
        rf"\bhasta\s+(?:el\s+)?(\d{{1,2}})\s+de\s+({'|'.join(MESES_ES)})(?:\s+de\s+(20\d{{2}}))?\b",
        normalizado,
    )
    if corte:
        dia_solicitado = int(corte.group(1))
        mes_corte = MESES_ES[corte.group(2)]
        anio_explicito = int(corte.group(3)) if corte.group(3) else None
    else:
        # Si no se indica corte se comparan ejercicios fiscales completos.
        dia_solicitado, mes_corte, anio_explicito = 30, 4, None

    def rango(ejercicio: int) -> tuple[date, date, str | None]:
        inicio = date(ejercicio, 5, 1)
        anio_fin = anio_explicito or (ejercicio if mes_corte >= 5 else ejercicio + 1)
        fin, corregida = _fecha_normalizada(anio_fin, mes_corte, dia_solicitado)
        # Un corte anterior a mayo pertenece al siguiente año natural.
        if fin < inicio:
            fin, corregida = _fecha_normalizada(ejercicio + 1, mes_corte, dia_solicitado)
        aviso = (
            f"Se ajustó el {dia_solicitado} de {corte.group(2)} al {fin.day} de {corte.group(2)}."
            if corregida and corte else None
        )
        return inicio, fin, aviso

    anterior_inicio, anterior_fin, aviso_anterior = rango(ejercicios[0])
    actual_inicio, actual_fin, aviso_actual = rango(ejercicios[1])
    return actual_inicio, actual_fin, anterior_inicio, anterior_fin, aviso_actual or aviso_anterior


def _resolver_rango_fechas_naturales(normalizado: str, fecha_hoy: date) -> tuple[date, date] | None:
    """Resuelve rangos como «desde el 5 de mayo de 2025 hasta hoy»."""
    nombres_meses = "|".join(MESES_ES)
    inicio_match = re.search(
        rf"\bdesde\s+(?:el\s+)?(\d{{1,2}})\s+de\s+({nombres_meses})(?:\s+de)?\s+(\d{{4}})\b",
        normalizado,
    )
    if not inicio_match:
        return None
    try:
        inicio = date(
            int(inicio_match.group(3)),
            MESES_ES[inicio_match.group(2)],
            int(inicio_match.group(1)),
        )
    except ValueError:
        return None

    fin_match = re.search(
        rf"\b(?:hasta|al)\s+(?:el\s+)?(\d{{1,2}})\s+de\s+({nombres_meses})(?:\s+de)?\s+(\d{{4}})\b",
        normalizado,
    )
    if fin_match:
        try:
            fin, _ = _fecha_normalizada(
                int(fin_match.group(3)), MESES_ES[fin_match.group(2)], int(fin_match.group(1))
            )
        except ValueError:
            return None
    else:
        # «Hasta hoy» y «hasta la última fecha disponible» consultan hasta hoy;
        # la cobertura real se obtiene con MAX(fecha_venta), nunca se inventa.
        fin = fecha_hoy
    if inicio > fin or inicio > fecha_hoy:
        return None
    return inicio, min(fin, fecha_hoy)


def _resolver_rango_meses(normalizado: str, fecha_hoy: date) -> tuple[date, date] | None:
    """Resuelve meses y rangos expresados en lenguaje natural."""
    nombres_meses = "|".join(MESES_ES)
    coincidencias = list(re.finditer(
        rf"\b({nombres_meses})\b(?:\s+(?:de\s+)?(\d{{4}}))?",
        normalizado,
    ))
    if not coincidencias:
        return None

    primera, ultima = coincidencias[0], coincidencias[-1]
    es_rango = len(coincidencias) > 1 and (
        re.search(r"\b(?:desde|hasta|entre|y|a|al)\b|[-–—,]", normalizado[primera.end():ultima.start()])
        or "por mes" in normalizado
        or "mensual" in normalizado
    )
    es_mes_unico = len(coincidencias) == 1 and re.search(
        rf"\b(?:en|de|del|durante)\s+(?:el\s+)?(?:mes\s+de\s+)?{re.escape(primera.group(1))}\b",
        normalizado,
    )
    if not es_rango and not es_mes_unico:
        return None

    mes_inicio, mes_fin = MESES_ES[primera.group(1)], MESES_ES[ultima.group(1)]
    anio_inicio = int(primera.group(2)) if primera.group(2) else (
        fecha_hoy.year if mes_inicio <= fecha_hoy.month else fecha_hoy.year - 1
    )
    anio_fin = int(ultima.group(2)) if ultima.group(2) else (
        anio_inicio if mes_fin >= mes_inicio else anio_inicio + 1
    )
    inicio, fin = date(anio_inicio, mes_inicio, 1), _ultimo_dia_mes(anio_fin, mes_fin)
    if inicio > fin or inicio > fecha_hoy:
        return None
    return inicio, min(fin, fecha_hoy)


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
    if _contiene(normalizado, ("ano fiscal", "ejercicio fiscal", "inicio fiscal", "acumulado fiscal")):
        return "anio_fiscal", _inicio_anio_fiscal(fecha_hoy), fecha_hoy

    rango = re.search(
        r"\bdesde\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})"
        r"(?:\s+(?:hasta|al)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2}))?",
        normalizado,
    )
    if rango:
        inicio = _parsear_fecha(rango.group(1))
        fin = _parsear_fecha(rango.group(2)) if rango.group(2) else fecha_hoy
        if inicio and fin and inicio <= fin:
            return "rango_personalizado", inicio, min(fin, fecha_hoy)

    rango_natural = _resolver_rango_fechas_naturales(normalizado, fecha_hoy)
    if rango_natural:
        return "rango_personalizado", *rango_natural

    rango_meses = _resolver_rango_meses(normalizado, fecha_hoy)
    if rango_meses:
        return "rango_personalizado", *rango_meses

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
        "comparar", "compara", "comparalo", "compararlo", "comparacion", "frente a", "frente al", "respecto a", "respecto al", "contra", "diferencias", "vs", "variacion", "crecimiento", "tendencia", "evolucion"
    ))


def resolver_periodo_anterior(periodo: str | None, fecha_inicio: date | None, fecha_fin: date | None) -> tuple[date | None, date | None]:
    if not periodo or not fecha_inicio or not fecha_fin:
        return None, None
    if periodo == "mes_actual":
        fin_mes_anterior = fecha_inicio - timedelta(days=1)
        inicio_anterior = fin_mes_anterior.replace(day=1)
        dias_transcurridos = (fecha_fin - fecha_inicio).days
        return inicio_anterior, min(inicio_anterior + timedelta(days=dias_transcurridos), fin_mes_anterior)
    if periodo == "anio_fiscal":
        return fecha_inicio.replace(year=fecha_inicio.year - 1), fecha_fin.replace(year=fecha_fin.year - 1)
    dias = (fecha_fin - fecha_inicio).days + 1
    fin_anterior = fecha_inicio - timedelta(days=1)
    return fin_anterior - timedelta(days=dias - 1), fin_anterior


def _periodo_interanual_equivalente(fecha_inicio: date, fecha_fin: date) -> tuple[date, date]:
    """Desplaza un intervalo un año, ajustando de forma segura el 29 de febrero."""
    inicio, _ = _fecha_normalizada(fecha_inicio.year - 1, fecha_inicio.month, fecha_inicio.day)
    fin, _ = _fecha_normalizada(fecha_fin.year - 1, fecha_fin.month, fecha_fin.day)
    return inicio, fin


def detectar_medida(texto: str) -> tuple[str | None, str | None]:
    """Devuelve la medida y el tipo de dato que representa."""
    normalizado = normalizar_texto(texto)

    # Una comparativa que pide varios KPI no se puede degradar a una única
    # métrica por el orden de las palabras. Se resuelve con un resumen común.
    menciona_ventas = _contiene(normalizado, ("ventas", "venta", "facturacion", "ingresos", "ingreso"))
    menciona_margen = _contiene(normalizado, ("margen", "mg", "mgd", "margen en destino"))
    if menciona_ventas and menciona_margen:
        return "resumen_financiero", "ventas"

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
    if (
        _contiene(normalizado, ("por referencia", "por referencias", "por sku", "por skus", "por producto", "por productos"))
        or re.search(r"\b(?:top|ranking|mejores?|mayores?|peores?)\s*\d*\s*(?:referencias?|productos?|skus?)\b", normalizado)
        or re.search(r"\b\d+\s+(?:mejores?|mayores?|peores?)\s+(?:referencias?|productos?|skus?)\b", normalizado)
    ):
        return "sku"
    if _contiene(normalizado, ("por comercial factura", "por comercial de factura", "cada comercial factura")):
        return "comercial_factura"
    if _contiene(normalizado, ("por nombre comercial", "por comercial asignado", "por comercial cliente")):
        return "comercial_cliente"
    if _contiene(normalizado, ("por tipo cliente", "por tipo de cliente", "por tipos de cliente")):
        return "tipo_cliente"
    if _contiene(normalizado, ("por cliente", "por clientes", "cada cliente")):
        return "cliente"
    if _contiene(normalizado, ("por kd", "kd y no kd")):
        return "kd"
    if re.search(r"\b(?:por|cada)\s+mes(?:es)?\b", normalizado) or _contiene(normalizado, ("mensual", "mensuales", "mes a mes")):
        return "mes"
    if _contiene(normalizado, ("por familia/marca", "por familia marca", "por familia y marca")):
        return "familia_marca"
    if _contiene(normalizado, ("por seccion", "por secciones", "cada seccion")):
        return "seccion"
    if _contiene(normalizado, ("por product manager", "por pm", "cada product manager", "cada pm")):
        return "product_manager"
    if _contiene(normalizado, ("por familia", "por familias", "cada familia", "cada familias")):
        return "familia"
    if _contiene(normalizado, ("por marca", "por marcas", "cada marca", "cada marcas")):
        return "marca"
    if _contiene(normalizado, ("por matriz", "por cuadrante", "matriz abcxyz", "abcxyz")):
        return "matriz"
    return None


def detectar_dimensiones_multiples(texto: str) -> tuple[str, ...]:
    """Reconoce las dimensiones explícitas de un resumen multidimensional."""
    texto = normalizar_texto(texto)
    texto = re.sub(r"\b(?:numero|cantidad|conteo)\s+de\s+skus?\s+(?:con\s+venta|vendidos?)\b", "", texto)
    comercial_factura = r"\bcomerciales?\s+(?:de\s+)?factura\b"
    comercial_cliente = r"\bcomerciales?\s+(?:asignad[oa]s?|del?\s+cliente)\b|\bnombres?\s+comerciales?\b"
    texto_sin_tipo_comercial = re.sub(f"(?:{comercial_factura}|{comercial_cliente})", "", texto)
    patrones = (
        ("cliente", r"\bclientes\b|\b(?:por|cada)\s+cliente\b"),
        ("seccion", r"\bsecciones\b|\b(?:por|cada)\s+seccion\b"),
        ("familia", r"\bfamilias\b|\b(?:por|cada)\s+familia\b"),
        ("marca", r"\bmarcas\b|\b(?:por|cada)\s+marca\b"),
        ("sku", r"\b(?:productos|articulos|referencias|skus?)\b|\b(?:por|cada)\s+(?:producto|articulo|referencia)\b"),
        ("comercial_factura", comercial_factura),
        ("comercial_cliente", comercial_cliente),
        ("mes", r"\b(?:por|cada)\s+mes(?:es)?\b|\bmensuales\b"),
    )
    dimensiones = tuple(nombre for nombre, patron in patrones if re.search(patron, texto))
    if re.search(r"\b(?:por|cada|y|con)\s+comerciales?\b", texto_sin_tipo_comercial):
        dimensiones += ("comercial",)
    return dimensiones if len(dimensiones) > 1 else ()


def detectar_limites_dimensiones(texto: str) -> dict[str, int]:
    """Vincula cada top a su dimensión, no a las demás tablas."""
    texto = normalizar_texto(texto)
    nombres = {"cliente": r"clientes?", "seccion": r"seccion(?:es)?", "familia": r"familias?", "marca": r"marcas?", "sku": r"(?:productos?|articulos?|referencias?|skus?)", "comercial_factura": r"comerciales?\s+(?:de\s+)?factura", "comercial_cliente": r"comerciales?\s+(?:asignad[oa]s?|del?\s+cliente)"}
    limites = {}
    for dimension, sustantivo in nombres.items():
        coincidencia = re.search(rf"\b(?:top|primeros?|primeras?|mejores?|mayores?|peores?)\s*(\d{{1,2}})\s+(?:de\s+)?{sustantivo}\b", texto)
        if coincidencia:
            limites[dimension] = min(max(int(coincidencia.group(1)), 1), 50)
    return limites


def detectar_metricas_multiples(texto: str) -> tuple[str, ...]:
    texto = normalizar_texto(texto)
    metricas = []
    if _contiene(texto, ("ventas", "venta", "facturacion", "ingresos")):
        metricas.append("ventas_eur")
    if _contiene(texto, ("unidades", "cantidad vendida")):
        metricas.append("ventas_unidades")
    if _contiene(texto, ("mgd", "margen en destino", "margen destino")):
        metricas.append("mgd_eur")
    if _contiene(texto, ("mg", "margen bruto", "beneficio")) or re.search(r"\bmargen\b(?!\s+(?:en\s+)?destino)", texto):
        metricas.append("margen_eur")
    return tuple(metricas) if len(metricas) > 1 else ()


def detectar_filtros(texto: str) -> dict[str, str]:
    """Extrae filtros concretos que se convierten siempre en parametros SQL."""
    filtros: dict[str, str] = {}
    normalizado = normalizar_texto(texto)
    agrupacion_solicitada = detectar_agrupacion(texto)
    campos_agrupados = {
        "familia": {"familia"},
        "marca": {"marca"},
        "familia_marca": {"familia", "marca", "familia_marca"},
        "seccion": {"seccion"},
        "product_manager": {"product_manager"},
        "cliente": {"cliente_pk", "nombre_cliente"},
        "tipo_cliente": {"tipo_cliente"},
        "comercial_cliente": {"comercial_cliente"},
        "comercial_factura": {"comercial_factura"},
        "kd": {"kd"},
    }.get(agrupacion_solicitada, set())

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

    sku = re.search(r"\bsku\s*([:#])?\s*([A-Za-z0-9][A-Za-z0-9_-]*)", texto, flags=re.IGNORECASE)
    if sku:
        candidato = sku.group(2).strip()
        # «número de SKU con venta» describe una métrica, no filtra el SKU
        # llamado "con". Sin separador explícito solo aceptamos códigos.
        if sku.group(1) or re.search(r"[0-9_-]", candidato):
            filtros["sku"] = candidato

    campos = {
        "familia": ("familia",),
        "marca": ("marca",),
        "familia_marca": ("familia/marca", "familia marca"),
        "seccion": ("seccion", "sección"),
        "product_manager": ("product manager", "pm"),
        "cliente_pk": ("clientepk", "cliente pk", "codigo cliente"),
        "nombre_cliente": ("nombre cliente", "cliente"),
        "tipo_cliente": ("tipo cliente", "tipo de cliente"),
        "comercial_cliente": ("nombre comercial", "comercial asignado", "comercial cliente"),
        "comercial_factura": ("comercial factura", "comercial de factura"),
        "kd": ("kd",),
    }
    for campo, alias in campos.items():
        if campo in campos_agrupados:
            continue
        etiqueta = "(?:" + "|".join(re.escape(nombre) for nombre in alias) + ")"
        campo_en_texto = re.search(rf"\b{etiqueta}\b", texto, flags=re.IGNORECASE)
        if campo_en_texto and re.search(r"\bpor\s+$", texto[:campo_en_texto.start()], flags=re.IGNORECASE):
            continue
        citado = re.search(rf"\b{etiqueta}\b\s*(?:es|:)?\s*[\"']([^\"']+)[\"']", texto, flags=re.IGNORECASE)
        if citado:
            filtros[campo] = citado.group(1).strip()
            continue
        sin_comillas = re.search(
            rf"\b{etiqueta}\b\s*(?:es|:)?\s+(.+?)(?=\s+(?:de|en|por|para|durante|ayer|hoy|este|mes|ultimos?|los|las)\b|[?,.;]|$)",
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
    if resolver_periodo(texto)[0] is not None:
        return True
    if re.match(r"^(por|desde|hasta)\b", normalizado):
        return True
    if _contiene(normalizado, ("gracias", "perfecto", "entendido", "vale")):
        return False
    if re.match(r"^(y|tambien|también|ademas|además)\b", normalizado):
        return True
    if re.match(r"^(compara|comparalo|compararlo|dame|hazme|muestrame|muestra)\b", normalizado) and _contiene(
        normalizado, (
            "lo mismo", "totales", "sumatorio", "ejercicio anterior", "ano anterior",
            "diferencias", "contra", "mejores", "mayores", "peores", "menores",
        )
    ):
        return True
    return _contiene(normalizado, (
        "por familia", "por marca", "por seccion", "por product manager", "por pm", "por cliente", "por tipo cliente", "por comercial", "por kd", "por matriz", "por referencia", "por sku", "lo mismo", "mismo periodo", "ejercicio anterior", "ano anterior", "contra totales", "sumatorio", "mejores", "mayores", "peores", "menores", "desglosa", "desglosar", "desglosado", "desglosada"
    ))


def _tiene_filtro_no_soportado(texto: str) -> bool:
    """Evita convertir una consulta concreta en un total global incorrecto."""
    normalizado = normalizar_texto(texto)
    medida, _ = detectar_medida(normalizado)
    if medida in ("productos_alerta", "productos_sobrestock", "matriz_productos", "acciones_prioritarias", "productos_oportunidad"):
        return False
    if _contiene(normalizado, ("producto", "articulo")) and not detectar_filtros(texto) and not detectar_agrupacion(normalizado):
        return True
    if _contiene(normalizado, ("familia", "marca", "seccion", "product manager", "pm", "cliente", "comercial", "kd")) and not detectar_filtros(texto) and not detectar_agrupacion(normalizado):
        return True
    menciona_recuento_sku = bool(re.search(
        r"\b(?:numero|cantidad|recuento)\s+de\s+sku\b|\bsku\s+con\s+venta\b",
        normalizado,
    ))
    if _contiene(normalizado, ("sku",)) and not menciona_recuento_sku and not detectar_filtros(texto):
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


def analizar_intencion(
    history: list[dict[str, Any]], contexto_previo: dict[str, Any] | None = None,
) -> tuple[IntentoSemantico | None, str | None]:
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
    dimensiones = detectar_dimensiones_multiples(actual)
    comparacion_fiscal = _resolver_comparacion_fiscal(actual)
    if comparacion_fiscal:
        (
            fecha_inicio,
            fecha_fin,
            fecha_inicio_comparacion,
            fecha_fin_comparacion,
            ajuste_fecha,
        ) = comparacion_fiscal
        periodo, comparar = "comparacion_fiscal", True
    else:
        periodo, fecha_inicio, fecha_fin = resolver_periodo(actual)
        fecha_inicio_comparacion, fecha_fin_comparacion, ajuste_fecha = None, None, None
        comparar = detectar_comparacion(actual)
    medida, tipo = detectar_medida(actual)
    analisis_gerencial = es_pregunta_gerencial(actual)
    if analisis_gerencial and not medida:
        medida, tipo = "ventas_eur", "ventas"
    if analisis_gerencial and not periodo:
        periodo, fecha_inicio, fecha_fin = resolver_periodo("mes actual")
    if analisis_gerencial:
        comparar = True
    intento_anterior = None

    if len(mensajes_usuario) > 1 and _es_seguimiento(actual):
        intento_anterior = restaurar_intento(contexto_previo)
        if not intento_anterior:
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
            if not fecha_inicio_comparacion:
                fecha_inicio_comparacion = intento_anterior.fecha_inicio_comparacion
                fecha_fin_comparacion = intento_anterior.fecha_fin_comparacion
        else:
            # Una aclaración previa puede contener solo parte de la intención.
            # Completamos los huecos con los mensajes anteriores del usuario.
            texto_analizado = f"{' '.join(mensajes_usuario[:-1])} {actual}"
            for anterior in reversed(mensajes_usuario[:-1]):
                if not medida:
                    medida, tipo = detectar_medida(anterior)
                if not periodo:
                    periodo, fecha_inicio, fecha_fin = resolver_periodo(anterior)
                if medida and periodo:
                    break

    # Permite responder a "ayer" o "este mes" después de una pregunta de ventas.
    if not medida and periodo and len(mensajes_usuario) > 1:
        anterior = mensajes_usuario[-2]
        medida, tipo = detectar_medida(anterior)
        if medida:
            texto_analizado = f"{anterior} {actual}"

    if not dimensiones and len(mensajes_usuario) > 1 and not intento_anterior:
        dimensiones = detectar_dimensiones_multiples(texto_analizado)

    if not medida:
        if _es_pregunta_agregada(actual):
            return None, "¿Quieres analizar ventas en euros, unidades vendidas o inventario en euros?"
        return None, None

    no_implementadas = [d for d in dimensiones if d not in DIMENSIONES_MULTIPLES]
    if no_implementadas and tipo in ("ventas", "rentabilidad"):
        nombres = {"comercial": "comerciales", "mes": "meses"}
        pendientes = ", ".join(nombres[d] for d in no_implementadas)
        if "comercial" in no_implementadas:
            return None, "¿Quieres el desglose por comercial asignado al cliente o por comercial de factura? Indícalo para no confundir ambos datos."
        return None, f"Todavía no puedo incluir {pendientes} junto con los demás desgloses en una sola respuesta. Pídelo por separado para no omitir ningún bloque."

    filtros = detectar_filtros(texto_analizado)
    if intento_anterior:
        # El contrato persistido conserva filtros que no se repiten en una
        # petición corta como «desglósalo por familia». Las fechas se resuelven
        # aparte para que un nuevo período sí pueda sustituir al anterior.
        filtros_anteriores = {
            clave: valor
            for clave, valor in intento_anterior.parametros.items()
            if not clave.startswith("fecha_")
        }
        filtros = {**filtros_anteriores, **filtros}
    if _tiene_filtro_no_soportado(actual if intento_anterior else texto_analizado):
        return None, None

    if tipo in ("ventas", "rentabilidad") and not periodo:
        return None, "¿Qué periodo quieres analizar: ayer, mes actual, últimos 30 días o últimos 90 días?"

    dimensiones_cliente = {"cliente", "tipo_cliente", "comercial_cliente", "comercial_factura", "kd"}
    if tipo == "inventario" and (
        detectar_agrupacion(texto_analizado) in dimensiones_cliente
        or any(campo in filtros for campo in {"cliente_pk", "nombre_cliente", "tipo_cliente", "comercial_cliente", "comercial_factura", "kd"})
    ):
        return None, "Las dimensiones de cliente, KD y comercial están asociadas a ventas. ¿Quieres analizar las ventas en euros para ese desglose?"

    agrupacion_actual = detectar_agrupacion(actual)
    if intento_anterior and intento_anterior.dimensiones and not dimensiones and not agrupacion_actual:
        dimensiones = intento_anterior.dimensiones
    if intento_anterior:
        agrupacion = agrupacion_actual or intento_anterior.agrupacion
    else:
        agrupacion = detectar_agrupacion(texto_analizado)
    texto_normalizado = normalizar_texto(actual)
    ranking_implicito = bool(re.search(
        r"\b(?:top\s*)?(?:\d{1,2}|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+"
        r"(?:mejores?|mayores?|peores?|menores?)\b",
        texto_normalizado,
    ))
    if ranking_implicito and not agrupacion_actual:
        agrupacion = "sku"
    descripcion = f"{medida} agrupado por {agrupacion}" if agrupacion else medida
    if comparar and not fecha_inicio_comparacion:
        if _contiene(texto_normalizado, ("mismo periodo", "ano anterior", "ejercicio anterior", "interanual")):
            fecha_inicio_comparacion, fecha_fin_comparacion = _periodo_interanual_equivalente(
                fecha_inicio, fecha_fin,
            )
        else:
            fecha_inicio_comparacion, fecha_fin_comparacion = resolver_periodo_anterior(
                periodo, fecha_inicio, fecha_fin,
            )
    texto_ranking = actual if intento_anterior else texto_analizado
    ranking_normalizado = normalizar_texto(texto_ranking)
    limite_match = re.search(
        r"\b(?:top|ranking|primer(?:os|as)?|mejores?|mayores?)\s*(\d{1,2})\b|\b(\d{1,2})\s+(?:mejores?|mayores?|peores?)\b",
        ranking_normalizado,
    )
    limite = min(int(limite_match.group(1) or limite_match.group(2)), 50) if limite_match else None
    if limite is None:
        numeros_texto = {
            "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
            "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
        }
        limite_palabra = re.search(
            r"\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+"
            r"(?:mejores?|mayores?|peores?|menores?)\b",
            ranking_normalizado,
        )
        if limite_palabra:
            limite = numeros_texto[limite_palabra.group(1)]
    if limite is None and intento_anterior:
        limite = intento_anterior.limite
    if re.search(r"\b(peores?|menores?|caidas?)\b", texto_normalizado):
        orden = "asc"
    elif re.search(r"\b(mejores?|mayores?|top|ranking)\b", texto_normalizado):
        orden = "desc"
    elif intento_anterior:
        orden = intento_anterior.orden
    else:
        orden = "desc"
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
    if "abc" in filtros:
        fecha_abc_inicio, fecha_abc_fin = rango_clasificacion_abc(_fecha_hoy())
        parametros.update({
            "fecha_abc_inicio": fecha_abc_inicio,
            "fecha_abc_fin": fecha_abc_fin,
        })
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
        limite=limite,
        orden=orden,
        ajuste_fecha=ajuste_fecha,
        dimensiones=dimensiones if tipo in ("ventas", "rentabilidad") else (),
        limites_dimensiones=(
            {**(intento_anterior.limites_dimensiones if intento_anterior else {}), **detectar_limites_dimensiones(actual if intento_anterior else texto_analizado)}
            if dimensiones else {}
        ),
        metricas_solicitadas=(detectar_metricas_multiples(texto_analizado) if dimensiones else ()),
    ), None


def _condiciones_sql(
    intento: IntentoSemantico,
    incluir_periodo: bool = False,
    campo_abc: str = "pm.abc",
) -> str:
    condiciones = ["p.empresa_id = :empresa_id"]
    for campo in ("familia", "marca", "familia_marca", "seccion", "product_manager", "sku"):
        if campo in intento.parametros:
            condiciones.append(f"p.{campo} = :{campo}")
    if intento.tipo in ("ventas", "rentabilidad"):
        for campo in ("cliente_pk", "tipo_cliente", "comercial_cliente"):
            if campo in intento.parametros:
                condiciones.append(f"c.{campo} = :{campo}")
        if "nombre_cliente" in intento.parametros:
            condiciones.append("c.nombre = :nombre_cliente")
        for campo in ("kd", "comercial_factura"):
            if campo in intento.parametros:
                condiciones.append(f"vh.{campo} = :{campo}")
    if "abc" in intento.parametros:
        condiciones.append(f"{campo_abc} = :abc")
    for campo in ("xyz", "matriz_abc"):
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
        if intento.medida == "resumen_financiero":
            condiciones = _condiciones_sql(intento, incluir_periodo=True)
            if intento.comparacion:
                sql = f"""
                    SELECT
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_periodo_actual,
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_periodo_anterior,
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.margen_bruto_eur ELSE 0 END), 0) AS margen_periodo_actual,
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.margen_bruto_eur ELSE 0 END), 0) AS margen_periodo_anterior,
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.margen_destino_eur ELSE 0 END), 0) AS mgd_periodo_actual,
                        COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.margen_destino_eur ELSE 0 END), 0) AS mgd_periodo_anterior,
                        MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_minima_actual,
                        MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_maxima_actual,
                        MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_minima_anterior,
                        MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_maxima_anterior
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    WHERE {condiciones}
                """
            else:
                sql = f"""
                    SELECT COALESCE(SUM(vh.ingreso_total), 0) AS ventas_periodo_actual,
                           COALESCE(SUM(vh.margen_bruto_eur), 0) AS margen_periodo_actual,
                           COALESCE(SUM(vh.margen_destino_eur), 0) AS mgd_periodo_actual,
                           MIN(vh.fecha_venta) AS fecha_minima_actual,
                           MAX(vh.fecha_venta) AS fecha_maxima_actual
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    WHERE {condiciones}
                """
            return sql, dict(intento.parametros)

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
        usa_abc_dinamico = "abc" in intento.parametros
        campo_abc = "ca.abc" if usa_abc_dinamico else "pm.abc"
        condiciones = _condiciones_sql(intento, incluir_periodo=True, campo_abc=campo_abc)
        if intento.agrupacion == "mes" and not intento.comparacion:
            usa_clientes = any(campo in intento.parametros for campo in {
                "cliente_pk", "nombre_cliente", "tipo_cliente", "comercial_cliente",
            })
            join_clientes = "LEFT JOIN clientes c ON c.id = vh.cliente_id" if usa_clientes else ""
            join_metricas_mensuales = (
                "LEFT JOIN producto_metricas pm ON pm.producto_id = p.id"
                if any(campo in intento.parametros for campo in ("xyz", "matriz_abc")) else ""
            )
            sql = f"""{crear_cte_abc_ventas() if usa_abc_dinamico else ''}
                SELECT SUBSTR(CAST(vh.fecha_venta AS TEXT), 1, 7) AS agrupacion,
                       COALESCE(SUM(vh.ingreso_total), 0) AS ventas_eur,
                       COALESCE(SUM(vh.cantidad_vendida), 0) AS unidades,
                       COALESCE(SUM(vh.margen_bruto_eur), 0) AS margen_eur,
                       COALESCE(SUM(vh.margen_destino_eur), 0) AS mgd_eur,
                       COUNT(DISTINCT vh.producto_id) AS productos,
                       MIN(vh.fecha_venta) AS fecha_minima,
                       MAX(vh.fecha_venta) AS fecha_maxima
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                {join_clientes}
                {join_metricas_mensuales}
                {'LEFT JOIN clasificacion_abc ca ON ca.producto_id = p.id' if usa_abc_dinamico else ''}
                WHERE {condiciones}
                GROUP BY SUBSTR(CAST(vh.fecha_venta AS TEXT), 1, 7)
                ORDER BY agrupacion ASC
            """
            return sql, dict(intento.parametros)
        es_porcentaje = intento.medida in ("margen_pct", "mgd_pct")
        if es_porcentaje:
            denominador = "ABS(SUM(vh.ingreso_total))" if intento.medida == "mgd_pct" else "SUM(vh.ingreso_total)"
            expresion_agregada = (
                f"CASE WHEN COALESCE({denominador}, 0) = 0 THEN 0 "
                f"ELSE COALESCE(SUM({expresion}), 0) / NULLIF({denominador}, 0) * 100 END"
            )
        else:
            expresion_agregada = f"COALESCE(SUM({expresion}), 0)"
        alias_agregado = intento.medida if es_porcentaje else alias
        if intento.agrupacion == "familia":
            agrupacion = "COALESCE(p.familia, 'Sin familia')"
        elif intento.agrupacion == "marca":
            agrupacion = "COALESCE(p.marca, 'Sin marca')"
        elif intento.agrupacion == "familia_marca":
            agrupacion = "COALESCE(p.familia_marca, 'Sin familia/marca')"
        elif intento.agrupacion == "seccion":
            agrupacion = "COALESCE(p.seccion, 'Sin seccion')"
        elif intento.agrupacion == "product_manager":
            agrupacion = "COALESCE(p.product_manager, 'Sin Product Manager')"
        elif intento.agrupacion == "cliente":
            agrupacion = "COALESCE(c.cliente_pk || ' · ' || c.nombre, c.cliente_pk, c.nombre, 'Sin cliente')"
        elif intento.agrupacion == "tipo_cliente":
            agrupacion = "COALESCE(c.tipo_cliente, 'Sin tipo de cliente')"
        elif intento.agrupacion == "comercial_cliente":
            agrupacion = "COALESCE(c.comercial_cliente, 'Sin comercial asignado')"
        elif intento.agrupacion == "comercial_factura":
            agrupacion = "COALESCE(vh.comercial_factura, 'Sin comercial de factura')"
        elif intento.agrupacion == "kd":
            agrupacion = "COALESCE(vh.kd, 'NO')"
        elif intento.agrupacion == "matriz":
            agrupacion = "COALESCE(pm.matriz_abc, 'Sin clasificar')"
        elif intento.agrupacion == "mes":
            agrupacion = "SUBSTR(CAST(vh.fecha_venta AS TEXT), 1, 7)"
        else:
            agrupacion = None

        join_metricas = (
            " LEFT JOIN producto_metricas pm ON pm.producto_id = p.id"
            if intento.agrupacion == "matriz" or any(campo in intento.parametros for campo in ("xyz", "matriz_abc"))
            else ""
        )
        usa_clientes = intento.agrupacion in {
            "cliente", "tipo_cliente", "comercial_cliente",
        } or any(campo in intento.parametros for campo in {
            "cliente_pk", "nombre_cliente", "tipo_cliente", "comercial_cliente",
        })
        join_clientes = " LEFT JOIN clientes c ON c.id = vh.cliente_id" if usa_clientes else ""
        columna_clientes = ", COUNT(DISTINCT vh.cliente_id) AS clientes" if usa_clientes else ""
        prefijo_abc = crear_cte_abc_ventas() if usa_abc_dinamico else ""
        join_abc = " LEFT JOIN clasificacion_abc ca ON ca.producto_id = p.id" if usa_abc_dinamico else ""
        if intento.agrupacion == "sku":
            limite = intento.limite or 20
            parametros = {**intento.parametros, "limite": limite}
            orden_sql = "ASC" if intento.orden == "asc" else "DESC"
            if intento.comparacion:
                actual_sql, anterior_sql, variacion_sql, variacion_pct_sql, _ = _expresiones_comparativas(intento, expresion)
                campo_orden = "variacion_absoluta" if intento.orden == "asc" else "periodo_actual"
                sql = f"""{prefijo_abc}
                    SELECT p.sku AS referencia,
                           COALESCE(p.nombre, 'Sin nombre') AS producto,
                           COALESCE(p.familia, 'Sin familia') AS familia,
                           {actual_sql} AS periodo_actual,
                           {anterior_sql} AS periodo_anterior,
                           {variacion_sql} AS variacion_absoluta,
                           {variacion_pct_sql} AS variacion_pct,
                           COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END) AS productos
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_clientes}
                    {join_abc}
                    {join_metricas}
                    WHERE {condiciones}
                    GROUP BY p.sku, p.nombre, p.familia
                    ORDER BY {campo_orden} {orden_sql}, referencia ASC
                    LIMIT :limite
                """
            else:
                sql = f"""{prefijo_abc}
                    SELECT p.sku AS referencia,
                           COALESCE(p.nombre, 'Sin nombre') AS producto,
                           COALESCE(p.familia, 'Sin familia') AS familia,
                           COALESCE(SUM(vh.ingreso_total), 0) AS ventas_eur,
                           COALESCE(SUM(vh.cantidad_vendida), 0) AS ventas_unidades,
                           COALESCE(SUM(vh.margen_bruto_eur), 0) AS margen_eur,
                           COALESCE(SUM(vh.margen_destino_eur), 0) AS mgd_eur,
                           CASE WHEN COALESCE(SUM(vh.ingreso_total), 0) = 0 THEN 0
                                ELSE COALESCE(SUM(vh.margen_bruto_eur), 0) / NULLIF(SUM(vh.ingreso_total), 0) * 100 END AS margen_pct,
                           COUNT(DISTINCT vh.producto_id) AS productos
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_clientes}
                    {join_abc}
                    {join_metricas}
                    WHERE {condiciones}
                    GROUP BY p.sku, p.nombre, p.familia
                    ORDER BY {alias_agregado} {orden_sql}, referencia ASC
                    LIMIT :limite
                """
            return sql, parametros
        if intento.comparacion:
            actual_sql, anterior_sql, variacion_sql, variacion_pct_sql, variacion_pp_sql = _expresiones_comparativas(intento, expresion)
            columnas_comparacion = (
                f"{actual_sql} AS periodo_actual, {anterior_sql} AS periodo_anterior, "
                f"{variacion_sql} AS variacion_absoluta, {variacion_pct_sql} AS variacion_pct"
            )
            if variacion_pp_sql:
                columnas_comparacion += f", {variacion_pp_sql} AS variacion_pp"
            productos_actuales = "COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.producto_id END)"
            if intento.agrupacion == "mes":
                mes = "SUBSTR(CAST(vh.fecha_venta AS TEXT), 6, 2)"
                sql = f"""{prefijo_abc}
                    SELECT {mes} AS agrupacion,
                           {columnas_comparacion},
                           MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_minima_actual,
                           MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_maxima_actual,
                           MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_minima_anterior,
                           MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_maxima_anterior,
                           {productos_actuales} AS productos
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_clientes}
                    {join_abc}
                    {join_metricas}
                    WHERE {condiciones}
                    GROUP BY {mes}
                    ORDER BY agrupacion ASC
                """
            elif agrupacion:
                sql = f"""{prefijo_abc}
                    SELECT {agrupacion} AS agrupacion,
                           {columnas_comparacion},
                           {productos_actuales} AS productos{columna_clientes}
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_clientes}
                    {join_abc}
                    {join_metricas}
                    WHERE {condiciones}
                    GROUP BY {agrupacion}
                    ORDER BY variacion_pct DESC
                """
            else:
                sql = f"""{prefijo_abc}
                    SELECT {columnas_comparacion},
                           {productos_actuales} AS productos,
                           COUNT(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN 1 END) AS registros_actuales,
                           COUNT(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN 1 END) AS registros_anteriores,
                           MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_minima_actual,
                           MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS fecha_maxima_actual,
                           COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio AND :fecha_fin THEN vh.fecha_venta END) AS dias_con_registros_actual,
                           MIN(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_minima_anterior,
                           MAX(CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS fecha_maxima_anterior,
                           COUNT(DISTINCT CASE WHEN vh.fecha_venta BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN vh.fecha_venta END) AS dias_con_registros_anterior{columna_clientes}
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    {join_clientes}
                    {join_abc}
                    {join_metricas}
                    WHERE {condiciones}
                """
            return sql, dict(intento.parametros)
        if agrupacion:
            sql = f"""{prefijo_abc}
                SELECT {agrupacion} AS agrupacion,
                       {expresion_agregada} AS {alias_agregado},
                       COUNT(DISTINCT vh.producto_id) AS productos{columna_clientes}
                FROM ventas_historicas vh
                JOIN productos p ON p.id = vh.producto_id
                {join_clientes}
                {join_abc}
                {join_metricas}
                WHERE {condiciones}
                GROUP BY {agrupacion}
                ORDER BY {"agrupacion ASC" if intento.agrupacion == "mes" else f"{alias_agregado} DESC"}
            """
        else:
            sql = f"""{prefijo_abc}
                   SELECT {expresion_agregada} AS {alias_agregado},
                          COUNT(DISTINCT vh.producto_id) AS productos,
                          MIN(vh.fecha_venta) AS fecha_minima_actual,
                          MAX(vh.fecha_venta) AS fecha_maxima_actual,
                          COUNT(DISTINCT vh.fecha_venta) AS dias_con_registros_actual{columna_clientes}
                   FROM ventas_historicas vh
                   JOIN productos p ON p.id = vh.producto_id
                   {join_clientes}
                   {join_abc}
                   {join_metricas}
                   WHERE {condiciones}
               """
        return sql, dict(intento.parametros)

    if intento.tipo == "inventario" and intento.periodo not in (None, "hoy"):
        expresion = "ih.unidades_inventario" if intento.medida == "inventario_unidades" else "ih.inventario_eur"
        alias = "inventario_unidades" if intento.medida == "inventario_unidades" else "inventario_eur"
        agrupaciones = {
            "familia": "COALESCE(p.familia, 'Sin familia')",
            "marca": "COALESCE(p.marca, 'Sin marca')",
            "familia_marca": "COALESCE(p.familia_marca, 'Sin familia/marca')",
            "seccion": "COALESCE(p.seccion, 'Sin seccion')",
            "product_manager": "COALESCE(p.product_manager, 'Sin Product Manager')",
        }
        agrupacion = agrupaciones.get(intento.agrupacion)
        join_metricas = (
            " LEFT JOIN producto_metricas pm ON pm.producto_id = p.id"
            if intento.agrupacion == "matriz" or any(campo in intento.parametros for campo in ("abc", "xyz", "matriz_abc"))
            else ""
        )
        condiciones = _condiciones_sql(intento)
        if intento.comparacion:
            actual = f"COALESCE(SUM(CASE WHEN ih.fecha_inventario BETWEEN :fecha_inicio AND :fecha_fin THEN {expresion} ELSE 0 END), 0)"
            anterior = f"COALESCE(SUM(CASE WHEN ih.fecha_inventario BETWEEN :fecha_inicio_comparacion AND :fecha_fin_comparacion THEN {expresion} ELSE 0 END), 0)"
            variacion = f"({actual}) - ({anterior})"
            variacion_pct = f"CASE WHEN ABS({anterior}) = 0 THEN 0 ELSE ({variacion}) / ABS({anterior}) * 100 END"
            columnas = f"{actual} AS periodo_actual, {anterior} AS periodo_anterior, {variacion} AS variacion_absoluta, {variacion_pct} AS variacion_pct"
            periodo_sql = "ih.fecha_inventario BETWEEN :fecha_inicio_comparacion AND :fecha_fin"
        else:
            columnas = f"COALESCE(SUM({expresion}), 0) AS {alias}"
            periodo_sql = "ih.fecha_inventario BETWEEN :fecha_inicio AND :fecha_fin"
        if agrupacion:
            sql = f"""
                SELECT {agrupacion} AS agrupacion, {columnas}, COUNT(DISTINCT p.id) AS productos
                FROM inventario_historico ih
                JOIN productos p ON p.id = ih.producto_id
                {join_metricas}
                WHERE {condiciones} AND {periodo_sql}
                GROUP BY {agrupacion}
                ORDER BY {"variacion_pct DESC" if intento.comparacion else f"{alias} DESC"}
            """
        else:
            sql = f"""
                SELECT {columnas}, COUNT(DISTINCT p.id) AS productos
                FROM inventario_historico ih
                JOIN productos p ON p.id = ih.producto_id
                {join_metricas}
                WHERE {condiciones} AND {periodo_sql}
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
    elif intento.agrupacion == "familia_marca":
        agrupacion = "COALESCE(p.familia_marca, 'Sin familia/marca')"
    elif intento.agrupacion == "seccion":
        agrupacion = "COALESCE(p.seccion, 'Sin seccion')"
    elif intento.agrupacion == "product_manager":
        agrupacion = "COALESCE(p.product_manager, 'Sin Product Manager')"
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
