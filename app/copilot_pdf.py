"""Presentación del informe firmado de Copilot, sin modificar sus cifras de origen."""
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import CondPageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


TITULOS = {"resumen": "Resumen ejecutivo", "total": "Resumen de ventas", "sku": "Productos", "cliente": "Clientes", "seccion": "Secciones", "familia": "Familias", "marca": "Marcas", "familia_marca": "Familias y marcas", "mes": "Evolución mensual", "estado_bloques": "Estado de los análisis"}
ETIQUETAS = {"referencia": "Código", "sku": "Código", "producto": "Producto", "nombre": "Nombre", "agrupacion": "Nombre", "familia": "Familia", "seccion": "Sección", "marca": "Marca", "periodo_actual": "Actual", "periodo_anterior": "Comparable", "actual": "Actual", "previo": "Comparable", "variacion_absoluta": "Variación", "variacion_eur": "Variación", "variacion_pct": "Variación %", "diferencia_observada": "Diferencia provisional", "diferencia_observada_pct": "Diferencia provisional %", "productos": "Productos", "clientes": "Clientes", "ventas_periodo_actual": "Ventas actuales", "ventas_periodo_anterior": "Ventas comparables", "ventas_variacion_absoluta": "Variación ventas", "ventas_variacion_pct": "Variación ventas %", "margen_periodo_actual": "MG actual", "mgd_periodo_actual": "MGD actual", "unidades_periodo_actual": "Unidades", "clientes_activos": "Clientes activos"}
DIMENSIONES = {"cliente": "Cliente", "seccion": "Sección", "familia": "Familia", "marca": "Marca", "familia_marca": "Familia / marca", "mes": "Mes"}
INTERNOS = {"comparacion_provisional", "sin_registros_actuales", "comparacion_verificada", "registros_actuales", "registros_anteriores", "fecha_minima_actual", "fecha_maxima_actual", "fecha_minima_anterior", "fecha_maxima_anterior", "dias_con_registros_actual", "dias_con_registros_anterior"}


def _fecha(valor):
    try:
        return date.fromisoformat(str(valor)[:10]).strftime("%d/%m/%Y")
    except (ValueError, TypeError):
        return "No disponible"


def _etiqueta(clave, bloque):
    if clave == "agrupacion":
        return DIMENSIONES.get(bloque, "Descripción")
    if clave == "referencia" and bloque == "sku":
        return "Código de producto"
    return ETIQUETAS.get(clave, clave.replace("_", " ").capitalize())


def _valor(clave, valor, bloque, medida=None):
    if valor is None:
        return "N/D"
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    if isinstance(valor, (int, float, Decimal)):
        try:
            numero = Decimal(str(valor))
            if not numero.is_finite():
                return "N/D"
            if "pct" in clave or clave.endswith("_pp"):
                return f"{numero.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " %"
            unidades = any(x in clave for x in ("unidad", "productos", "clientes", "sku_con_venta", "registros"))
            monetario = not unidades and (any(x in clave for x in ("ventas", "margen", "mgd", "eur", "variacion", "diferencia")) or clave in {"periodo_actual", "periodo_anterior", "actual", "previo", "valor"}) and "unidades" not in bloque and medida != "ventas_unidades"
            if monetario:
                return f"{numero.quantize(Decimal('1'), rounding=ROUND_HALF_UP):,}".replace(",", ".") + " €"
            entero, _, fraccion = f"{numero:,.12f}".rstrip("0").rstrip(".").partition(".")
            return entero.replace(",", ".") + ("," + fraccion if fraccion else "")
        except (InvalidOperation, ValueError):
            return "N/D"
    return str(valor)


def _columnas(filas, bloque):
    claves = list(dict.fromkeys(k for f in filas for k in f if k not in INTERNOS))
    prioridad = ["referencia", "sku", "producto", "nombre", "agrupacion", "familia", "seccion", "marca", "periodo_actual", "periodo_anterior", "actual", "previo", "variacion_absoluta", "variacion_eur", "variacion_pct", "diferencia_observada", "diferencia_observada_pct"]
    if any(f.get("comparacion_provisional") for f in filas):
        claves = [k for k in claves if k not in {"variacion_absoluta", "variacion_pct"}]
    ordenadas = [k for k in prioridad if k in claves] + [k for k in claves if k not in prioridad]
    return ordenadas[:7], len(ordenadas) > 7


def generar_pdf_informe(informe, message_id):
    salida = BytesIO()
    doc = SimpleDocTemplate(salida, pagesize=landscape(A4), rightMargin=1.25*cm, leftMargin=1.25*cm, topMargin=1.4*cm, bottomMargin=1.35*cm, title="Informe de AI Copilot")
    base = getSampleStyleSheet()
    titulo = ParagraphStyle("TituloCopilot", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=colors.HexColor("#132840"), spaceAfter=8)
    subtitulo = ParagraphStyle("SubtituloCopilot", parent=base["Heading2"], fontSize=12, leading=15, textColor=colors.HexColor("#17395f"), spaceBefore=12, spaceAfter=6, keepWithNext=False)
    texto = ParagraphStyle("TextoCopilot", parent=base["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#27384d"))
    cabeza = ParagraphStyle("CabeceraCopilot", parent=texto, fontName="Helvetica-Bold", fontSize=7.3, leading=9, textColor=colors.white)
    numero = ParagraphStyle("NumeroCopilot", parent=texto, alignment=TA_RIGHT)
    nota = ParagraphStyle("NotaCopilot", parent=texto, fontSize=7.5, leading=10, textColor=colors.HexColor("#68788b"))
    actual, anterior = informe.get("periodo_actual") or {}, informe.get("periodo_anterior") or {}
    story = [Paragraph("Informe de AI Copilot", titulo), Paragraph(f"<b>Período actual:</b> {_fecha(actual.get('inicio'))} - {_fecha(actual.get('fin'))} &nbsp;&nbsp; <b>Período comparable:</b> {_fecha(anterior.get('inicio'))} - {_fecha(anterior.get('fin'))}", texto), Paragraph(f"Datos procedentes del informe generado · Referencia {int(message_id)} · Importes en euros, redondeados sin decimales", nota), Spacer(1, 0.25*cm)]
    resultados = informe.get("resultados") if isinstance(informe.get("resultados"), dict) else {}
    if any(isinstance(f, dict) and f.get("comparacion_provisional") for v in resultados.values() for f in (v if isinstance(v, list) else [v])):
        story.append(Paragraph("Las diferencias provisionales comparan los importes registrados, pero no acreditan una evolución comparable: revise las fechas y la cobertura.", nota))
    for bloque, valor in resultados.items():
        filas = [f for f in (valor if isinstance(valor, list) else [valor]) if isinstance(f, dict)]
        if not filas:
            continue
        columnas, omitidas = _columnas(filas, str(bloque))
        if not columnas:
            continue
        titulo_bloque = TITULOS.get(bloque, str(bloque).replace("_", " ").capitalize())
        cabeceras = [Paragraph(escape(_etiqueta(k, bloque)), cabeza) for k in columnas]
        datos = [cabeceras]
        for fila in filas[:20]:
            datos.append([Paragraph(escape(_valor(k, fila.get(k), str(bloque), informe.get("medida"))), numero if isinstance(fila.get(k), (int, float, Decimal)) and not isinstance(fila.get(k), bool) else texto) for k in columnas])
        pesos = [2.8 if k in {"producto", "nombre", "agrupacion", "entidad"} else 1.5 if k in {"referencia", "sku", "diferencia_observada", "diferencia_observada_pct"} else 1.15 for k in columnas]
        anchos = [doc.width * p / sum(pesos) for p in pesos]
        tabla = Table(datos, colWidths=anchos, repeatRows=1, hAlign="LEFT")
        tabla.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#17395f")), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f2f6fa")]), ("LINEBELOW", (0,0), (-1,0), 0.6, colors.HexColor("#90a6bc")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7)]))
        story.extend([CondPageBreak(3*cm), Paragraph(escape(titulo_bloque), subtitulo), tabla])
        if len(filas) > 20 or omitidas:
            story.append(Paragraph("Vista resumida: " + (f"20 de {len(filas)} filas. " if len(filas) > 20 else "") + ("Se muestran las columnas principales. " if omitidas else "") + "El Excel conserva el detalle completo.", nota))
    def pie(canvas, documento):
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#718096"))
        canvas.drawString(doc.leftMargin, 0.7*cm, "Five Minutes · AI Copilot")
        canvas.drawRightString(landscape(A4)[0] - doc.rightMargin, 0.7*cm, f"Página {documento.page}")
    doc.build(story, onFirstPage=pie, onLaterPages=pie)
    salida.seek(0)
    return salida
