import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.copilot_orchestrator import (
    analizar_intencion,
    crear_consulta_semantica,
    resolver_periodo,
    serializar_intento,
)
from app.analitica_ventas import (
    construir_grafico_comparacion_mensual,
    construir_grafico_desglose,
    construir_grafico_ranking_sku,
    renderizar_comparacion_mensual,
    renderizar_desglose_agrupado,
    renderizar_ranking_sku,
    renderizar_resumen_financiero,
)
from app.copilot_service import interpret_results, process_copilot_chat, extract_signed_report_artifact


CASOS_EVALUACION = (
    ("Dame las ventas de los ultimos 7 dias", "ventas", "ventas_eur", "ultimos_7_dias", None, False, None),
    ("Facturacion de los ultimos 30 dias", "ventas", "ventas_eur", "ultimos_30_dias", None, False, None),
    ("Unidades vendidas este mes", "ventas", "ventas_unidades", "mes_actual", None, False, None),
    ("Margen de los ultimos 90 dias", "rentabilidad", "margen_eur", "ultimos_90_dias", None, False, None),
    ("Porcentaje de margen este mes", "rentabilidad", "margen_pct", "mes_actual", None, False, None),
    ("MGD del ano fiscal por seccion", "rentabilidad", "mgd_eur", "anio_fiscal", "seccion", False, None),
    ("Porcentaje de MGD del ano fiscal", "rentabilidad", "mgd_pct", "anio_fiscal", None, False, None),
    ("Compara las ventas de este mes con el mes anterior", "ventas", "ventas_eur", "mes_actual", None, True, None),
    ("Ventas del ano fiscal por familia", "ventas", "ventas_eur", "anio_fiscal", "familia", False, None),
    ("Ventas de los ultimos 90 dias por marca", "ventas", "ventas_eur", "ultimos_90_dias", "marca", False, None),
    ("Ventas de los ultimos 30 dias por Product Manager", "ventas", "ventas_eur", "ultimos_30_dias", "product_manager", False, None),
    ("Dame las ventas de los productos clase A en los ultimos 30 dias", "ventas", "ventas_eur", "ultimos_30_dias", None, False, "abc"),
    ("Dame las ventas de los productos clase B en los ultimos 30 dias", "ventas", "ventas_eur", "ultimos_30_dias", None, False, "abc"),
    ("Ventas de la familia 'Portatiles' este mes", "ventas", "ventas_eur", "mes_actual", None, False, "familia"),
    ("Ventas de la marca 'Lenovo' este mes", "ventas", "ventas_eur", "mes_actual", None, False, "marca"),
    ("Ventas de la seccion 'Informatica' este mes", "ventas", "ventas_eur", "mes_actual", None, False, "seccion"),
    ("Ventas del Product Manager 'Ana' este mes", "ventas", "ventas_eur", "mes_actual", None, False, "product_manager"),
    ("Ventas desde 01/07/2026 hasta 15/07/2026", "ventas", "ventas_eur", "rango_personalizado", None, False, None),
    ("Como va la empresa", "ventas", "ventas_eur", "mes_actual", None, True, None),
    ("Por que caen las ventas este mes", "ventas", "ventas_eur", "mes_actual", None, True, None),
    ("Hazme un resumen ejecutivo", "ventas", "ventas_eur", "mes_actual", None, True, None),
    ("Compara el margen de este mes con el mes anterior por familia", "rentabilidad", "margen_eur", "mes_actual", "familia", True, None),
    ("Ventas por familia y marca este mes", "ventas", "ventas_eur", "mes_actual", "familia_marca", False, None),
    ("Cuanto inventario tenemos hoy", "inventario", "inventario_eur", "hoy", None, False, None),
    ("Cuantas unidades de stock tenemos", "inventario", "inventario_unidades", None, None, False, None),
    ("Compara el inventario con el mes anterior", "inventario", "inventario_eur", None, None, True, None),
    ("Inventario de los ultimos 30 dias", "inventario", "inventario_eur", "ultimos_30_dias", None, False, None),
    ("Que acciones deberia priorizar hoy", "acciones", "acciones_prioritarias", "hoy", None, False, None),
    ("Que productos son oportunidades comerciales", "oportunidades", "productos_oportunidad", None, None, False, None),
    ("Que productos tienen riesgo de rotura", "alertas", "productos_alerta", None, None, False, None),
    ("Que productos tienen sobrestock", "inventario", "productos_sobrestock", None, None, False, None),
    ("Cuantos productos hay en la matriz", "matriz", "matriz_productos", None, None, False, None),
    ("Ventas ayer", "ventas", "ventas_eur", "ayer", None, False, None),
    ("Ventas hoy", "ventas", "ventas_eur", "hoy", None, False, None),
    ("Margen por familia este mes", "rentabilidad", "margen_eur", "mes_actual", "familia", False, None),
    ("MGD por Product Manager este mes", "rentabilidad", "mgd_eur", "mes_actual", "product_manager", False, None),
    ("Ventas ABC C ultimos 90 dias", "ventas", "ventas_eur", "ultimos_90_dias", None, False, "abc"),
    ("Ventas de la familia 'Redes' ultimos 30 dias", "ventas", "ventas_eur", "ultimos_30_dias", None, False, "familia"),
    ("Compara las ventas ultimos 7 dias", "ventas", "ventas_eur", "ultimos_7_dias", None, True, None),
    ("Que periodo quieres analizar", None, None, None, None, None, None),
    ("Ventas de este mes por cliente", "ventas", "ventas_eur", "mes_actual", "cliente", False, None),
    ("Ventas de este mes por tipo de cliente", "ventas", "ventas_eur", "mes_actual", "tipo_cliente", False, None),
    ("Margen de este mes por comercial asignado", "rentabilidad", "margen_eur", "mes_actual", "comercial_cliente", False, None),
    ("MGD de este mes por comercial de factura", "rentabilidad", "mgd_eur", "mes_actual", "comercial_factura", False, None),
    ("Ventas de este mes por KD", "ventas", "ventas_eur", "mes_actual", "kd", False, None),
)


class EvaluacionCopilotTests(unittest.TestCase):
    def test_cuarenta_consultas_gerenciales_y_operativas(self):
        self.assertEqual(len(CASOS_EVALUACION), 45)
        for texto, tipo, medida, periodo, agrupacion, comparacion, expectativa in CASOS_EVALUACION:
            with self.subTest(texto=texto):
                intento, aclaracion = analizar_intencion([{"role": "user", "content": texto}])
                if tipo is None:
                    self.assertIsNone(intento)
                    if expectativa:
                        self.assertIn(expectativa, (aclaracion or "").casefold())
                    else:
                        self.assertIsNone(aclaracion)
                    continue

                self.assertIsNone(aclaracion)
                self.assertIsNotNone(intento)
                self.assertEqual(intento.tipo, tipo)
                self.assertEqual(intento.medida, medida)
                self.assertEqual(intento.periodo, periodo)
                self.assertEqual(intento.agrupacion, agrupacion)
                self.assertEqual(intento.comparacion, comparacion)
                if expectativa:
                    self.assertIn(expectativa, intento.parametros)

    def test_desglose_hereda_el_anio_fiscal_de_la_consulta_anterior(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "¿Cuáles son las ventas acumuladas del año fiscal?"},
            {"role": "assistant", "content": "Las ventas acumuladas son 100 €."},
            {"role": "user", "content": "Desglosa las ventas del mismo periodo por familia"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.periodo, "anio_fiscal")
        self.assertEqual(intento.agrupacion, "familia")

    def test_consulta_por_cliente_usa_dimension_y_filtro_de_empresa(self):
        intento, aclaracion = analizar_intencion([{
            "role": "user",
            "content": "Ventas de este mes por tipo de cliente",
        }])

        self.assertIsNone(aclaracion)
        consulta, parametros = crear_consulta_semantica(intento)
        self.assertIn("LEFT JOIN clientes c ON c.id = vh.cliente_id", consulta)
        self.assertIn("p.empresa_id = :empresa_id", consulta)
        self.assertIn("c.tipo_cliente", consulta)
        self.assertIn("fecha_inicio", parametros)

    def test_ventas_fiscales_por_mes_crean_un_desglose_mensual(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Dame las ventas de este año fiscal actual por cada mes"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.periodo, "anio_fiscal")
        self.assertEqual(intento.agrupacion, "mes")

    def test_rango_de_meses_y_aclaraciones_conservan_el_contexto(self):
        periodo, inicio, fin = resolver_periodo(
            "Por mes, desde el mes de mayo hasta julio", hoy=date(2026, 8, 14)
        )
        self.assertEqual(periodo, "rango_personalizado")
        self.assertEqual(inicio, date(2026, 5, 1))
        self.assertEqual(fin, date(2026, 7, 31))

        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Dame las ventas mensuales en euros"},
            {"role": "assistant", "content": "Que periodo quieres analizar?"},
            {"role": "user", "content": "Por mes, desde el mes de mayo hasta julio"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.medida, "ventas_eur")
        self.assertEqual(intento.agrupacion, "mes")
        self.assertEqual(intento.fecha_inicio, date(2026, 5, 1))
        self.assertEqual(intento.fecha_fin, date(2026, 7, 31))

    def test_resolver_periodo_admite_formulaciones_naturales_de_meses(self):
        casos = (
            ("Entre febrero y abril", date(2026, 2, 1), date(2026, 4, 30)),
            ("Ventas mensuales: mayo, junio y julio", date(2026, 5, 1), date(2026, 7, 31)),
            ("De noviembre a febrero", date(2025, 11, 1), date(2026, 2, 28)),
            ("Ventas del mes de junio", date(2026, 6, 1), date(2026, 6, 30)),
        )
        for texto, inicio_esperado, fin_esperado in casos:
            with self.subTest(texto=texto):
                periodo, inicio, fin = resolver_periodo(texto, hoy=date(2026, 8, 14))
                self.assertEqual(periodo, "rango_personalizado")
                self.assertEqual(inicio, inicio_esperado)
                self.assertEqual(fin, fin_esperado)

    def test_resolver_periodo_desde_dia_natural_hasta_ultima_fecha_disponible(self):
        periodo, inicio, fin = resolver_periodo(
            "Desde el 5 de mayo de 2025 hasta la última fecha disponible",
            hoy=date(2026, 8, 25),
        )

        self.assertEqual(periodo, "rango_personalizado")
        self.assertEqual(inicio, date(2025, 5, 5))
        self.assertEqual(fin, date(2026, 8, 25))

    def test_numero_de_sku_con_venta_no_se_interpreta_como_filtro(self):
        intento, aclaracion = analizar_intencion([{
            "role": "user",
            "content": (
                "Muéstrame las ventas mensuales desde el 5 de mayo de 2025 hasta la última fecha "
                "disponible, con ventas, unidades, margen, MGD y número de SKU con venta."
            ),
        }])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.agrupacion, "mes")
        self.assertNotIn("sku", intento.parametros)

    def test_solicitud_excel_mensual_hereda_el_periodo_aclarado(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Dame un Excel de las ventas por mes"},
        ])
        self.assertIsNone(intento)
        self.assertIn("periodo", (aclaracion or "").casefold())

        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Dame un Excel de las ventas por mes"},
            {"role": "assistant", "content": "¿Qué periodo quieres analizar?"},
            {"role": "user", "content": "Del año fiscal"},
        ])
        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.medida, "ventas_eur")
        self.assertEqual(intento.agrupacion, "mes")
        self.assertEqual(intento.periodo, "anio_fiscal")
        consulta, _ = crear_consulta_semantica(intento)
        self.assertIn("GROUP BY", consulta)
        self.assertIn("fecha_venta", consulta)

    def test_pregunta_gerencial_mal_codificada_sigue_la_consulta_segura(self):
        intento, aclaracion = analizar_intencion([{
            "role": "user",
            "content": "\u00c2\u00bfC\u00c3\u00b3mo va la empresa este mes?",
        }])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.tipo, "ventas")
        self.assertTrue(intento.comparacion)
        consulta, _ = crear_consulta_semantica(intento)
        self.assertNotIn("LEFT JOIN clientes", consulta)

    def test_inventario_historico_permite_comparar_periodos(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Compara el inventario de este mes con el mes anterior por familia"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.tipo, "inventario")
        self.assertTrue(intento.comparacion)
        consulta, _parametros = crear_consulta_semantica(intento)
        self.assertIn("inventario_historico ih", consulta)
        self.assertIn("periodo_anterior", consulta)

    def test_ranking_de_referencias_conserva_metricas_y_limite_tras_aclarar_periodo(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Cuáles han sido las 5 mejores referencias por margen absoluto"},
            {"role": "assistant", "content": "¿Qué periodo quieres analizar?"},
            {"role": "user", "content": "90 días"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.medida, "margen_eur")
        self.assertEqual(intento.agrupacion, "sku")
        self.assertEqual(intento.limite, 5)
        self.assertEqual(intento.periodo, "ultimos_90_dias")
        consulta, parametros = crear_consulta_semantica(intento)
        self.assertIn("p.sku AS referencia", consulta)
        self.assertIn("LIMIT :limite", consulta)
        self.assertEqual(parametros["limite"], 5)

    def test_comparativa_fiscal_explicita_normaliza_fecha_y_alinea_meses(self):
        intento, aclaracion = analizar_intencion([{
            "role": "user",
            "content": "Compara FY2025 vs FY2026 hasta el 31 de septiembre por mes las ventas",
        }])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertTrue(intento.comparacion)
        self.assertEqual(intento.periodo, "comparacion_fiscal")
        self.assertEqual(intento.fecha_inicio, date(2026, 5, 1))
        self.assertEqual(intento.fecha_fin, date(2026, 9, 30))
        self.assertEqual(intento.fecha_inicio_comparacion, date(2025, 5, 1))
        self.assertEqual(intento.fecha_fin_comparacion, date(2025, 9, 30))
        self.assertIn("ajustó", intento.ajuste_fecha)
        consulta, _ = crear_consulta_semantica(intento)
        self.assertIn("SUBSTR(CAST(vh.fecha_venta AS TEXT), 6, 2)", consulta)
        self.assertIn("fecha_minima_actual", consulta)

    def test_resumen_financiero_fiscal_calcula_los_tres_kpi_en_una_sola_consulta(self):
        intento, aclaracion = analizar_intencion([{
            "role": "user",
            "content": "Dame los totales de ventas, margen y MGD de FY2025 contra FY2026 hasta el 30 de septiembre",
        }])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.medida, "resumen_financiero")
        self.assertTrue(intento.comparacion)
        consulta, _ = crear_consulta_semantica(intento)
        self.assertIn("ventas_periodo_actual", consulta)
        self.assertIn("margen_periodo_actual", consulta)
        self.assertIn("mgd_periodo_actual", consulta)

    def test_contexto_estructurado_restaura_el_ranking_en_un_seguimiento(self):
        inicial, _ = analizar_intencion([{
            "role": "user", "content": "Top 5 referencias por margen de los últimos 90 días",
        }])
        self.assertIsNotNone(inicial)
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Top 5 referencias por margen de los últimos 90 días"},
            {"role": "assistant", "content": "Resultado anterior"},
            {"role": "user", "content": "Lo mismo, pero por ventas"},
        ], serializar_intento(inicial))

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.medida, "ventas_eur")
        self.assertEqual(intento.agrupacion, "sku")
        self.assertEqual(intento.limite, 5)

    def test_seguimiento_conserva_filtro_y_compara_ventana_equivalente(self):
        inicial, _ = analizar_intencion([{
            "role": "user",
            "content": "Ventas de la familia 'Portátiles' desde 01/05/2026 hasta 30/09/2026",
        }])
        self.assertIsNotNone(inicial)

        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Ventas de la familia 'Portátiles' desde 01/05/2026 hasta 30/09/2026"},
            {"role": "assistant", "content": "Resultado anterior"},
            {"role": "user", "content": "Compáralo con el mismo periodo del año anterior y desglósalo por marca"},
        ], serializar_intento(inicial))

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertTrue(intento.comparacion)
        self.assertEqual(intento.agrupacion, "marca")
        self.assertEqual(intento.parametros["familia"], "Portátiles")
        self.assertEqual(intento.fecha_inicio, date(2026, 5, 1))
        self.assertEqual(intento.fecha_fin, date(2026, 9, 30))
        self.assertEqual(intento.fecha_inicio_comparacion, date(2025, 5, 1))
        self.assertEqual(intento.fecha_fin_comparacion, date(2025, 9, 30))

    def test_seguimiento_cinco_peores_usa_ranking_ascendente(self):
        inicial, _ = analizar_intencion([{
            "role": "user", "content": "Top 5 referencias por margen de los últimos 90 días",
        }])
        self.assertIsNotNone(inicial)

        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Top 5 referencias por margen de los últimos 90 días"},
            {"role": "assistant", "content": "Resultado anterior"},
            {"role": "user", "content": "Muéstrame los cinco peores"},
        ], serializar_intento(inicial))

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.agrupacion, "sku")
        self.assertEqual(intento.limite, 5)
        self.assertEqual(intento.orden, "asc")
        consulta, parametros = crear_consulta_semantica(intento)
        self.assertIn("ORDER BY margen_eur ASC, referencia ASC", consulta)
        self.assertEqual(parametros["limite"], 5)

    def test_render_comparativo_incluye_mes_sin_registros_y_conciliacion(self):
        respuesta = renderizar_comparacion_mensual(
            [{
                "agrupacion": "05", "periodo_actual": 120, "periodo_anterior": 100,
                "variacion_absoluta": 20, "variacion_pct": 20,
                "fecha_minima_actual": "2026-05-01", "fecha_maxima_actual": "2026-05-31",
                "fecha_minima_anterior": "2025-05-01", "fecha_maxima_anterior": "2025-05-31",
            }],
            date(2026, 5, 1), date(2026, 6, 30), date(2025, 5, 1), date(2025, 6, 30),
            "ventas_eur", "Se ajustó el 31 de septiembre al 30 de septiembre.",
        )

        self.assertIn("| Mayo |", respuesta)
        self.assertIn("| Junio | €0,00 | €0,00", respuesta)
        self.assertIn("Totales conciliados", respuesta)
        self.assertIn("Ajuste de fecha", respuesta)

    def test_render_resumen_financiero_muestra_ventas_mg_y_mgd(self):
        respuesta = renderizar_resumen_financiero(
            {
                "ventas_periodo_actual": 500, "ventas_periodo_anterior": 400,
                "margen_periodo_actual": 50, "margen_periodo_anterior": 40,
                "mgd_periodo_actual": 35, "mgd_periodo_anterior": 30,
            },
            date(2026, 5, 1), date(2026, 9, 30), date(2025, 5, 1), date(2025, 9, 30),
        )

        self.assertIn("Ventas netas", respuesta)
        self.assertIn("Margen bruto", respuesta)
        self.assertIn("MGD", respuesta)

    def test_grafico_comparativo_usa_la_misma_serie_y_conserva_meses_cero(self):
        grafico = construir_grafico_comparacion_mensual(
            [{"agrupacion": "05", "periodo_actual": 120, "periodo_anterior": 100}],
            date(2026, 5, 1), date(2026, 6, 30), date(2025, 5, 1), "ventas_eur",
        )

        self.assertEqual(grafico["title"], "Ventas netas mensual · FY2026 vs FY2025")
        self.assertEqual(grafico["series"][0]["label"], "FY2026")
        self.assertEqual(grafico["series"][1]["label"], "FY2025")
        self.assertEqual(grafico["data"], [
            {"mes": "Mayo", "actual": 120.0, "anterior": 100.0},
            {"mes": "Junio", "actual": 0.0, "anterior": 0.0},
        ])

    def test_ranking_sku_tiene_tabla_y_grafico_deterministas(self):
        filas = [{
            "referencia": "SKU-1", "producto": "Producto 1", "familia": "Familia 1",
            "ventas_eur": 500, "margen_eur": 80, "mgd_eur": 60, "margen_pct": 16,
        }]
        respuesta = renderizar_ranking_sku(filas, "margen_eur", date(2026, 8, 1), date(2026, 8, 31))
        grafico = construir_grafico_ranking_sku(filas, "margen_eur", False)

        self.assertIn("SKU-1", respuesta)
        self.assertIn("€80,00", respuesta)
        self.assertEqual(grafico["data"], [{"referencia": "SKU-1", "actual": 80.0}])
        self.assertEqual(grafico["series"][0]["label"], "Margen bruto")

    def test_error_de_consulta_no_culpa_al_usuario_ni_expone_lenguaje_tecnico(self):
        respuesta = interpret_results([], "SELECT no se usa", None, error="error interno")

        self.assertIn("No pude completar", respuesta)
        self.assertNotIn("columnas inexistentes", respuesta)
        self.assertNotIn("términos exactos", respuesta)

    def test_desglose_de_familias_tiene_tabla_y_grafico_verificados(self):
        filas = [
            {"agrupacion": "Portátiles", "ventas_eur": 1000, "productos": 4},
            {"agrupacion": "Monitores", "ventas_eur": 700, "productos": 2},
        ]
        respuesta = renderizar_desglose_agrupado(
            filas, "ventas_eur", "familia", date(2026, 8, 1), date(2026, 8, 31),
        )
        grafico = construir_grafico_desglose(filas, "ventas_eur", "familia", False)

        self.assertIn("Ventas netas por familia", respuesta)
        self.assertIn("Portátiles", respuesta)
        self.assertIn("€1.000,00", respuesta)
        self.assertEqual(grafico["data"][0]["segmento"], "Portátiles")
        self.assertEqual(grafico["series"][0]["label"], "Ventas netas")

    def test_dossier_no_pasa_telemetria_a_la_consulta_sql(self):
        """La telemetría es de la llamada LLM, no del contrato de SQL."""
        plan = SimpleNamespace(
            periodo_actual=(date(2026, 10, 1), date(2026, 10, 27)),
            periodo_anterior=(date(2026, 9, 1), date(2026, 9, 27)),
            consultas=(SimpleNamespace(nombre="resumen", sql="SELECT 1", parametros={}),),
        )

        class SesionFicticia:
            def get_bind(self):
                return object()

        llamadas_sql = []

        def ejecutar_sql_ficticio(*args, **kwargs):
            llamadas_sql.append((args, kwargs))
            self.assertNotIn("usage_context", kwargs)
            if "AS fecha_ultima" in args[1]:
                return [{"fecha_ultima": "2026-10-27"}], None
            return [{"ventas_periodo_actual": 120, "ventas_periodo_anterior": 100, "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-27", "fecha_minima_anterior": "2026-09-01", "fecha_maxima_anterior": "2026-09-27"}], None

        with (
            patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)),
            patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan) as crear_plan,
            patch("app.copilot_context.construir_resumen_operativo", return_value=""),
            patch("app.copilot_service.execute_sql", side_effect=ejecutar_sql_ficticio),
            patch("app.copilot_service.interpret_results", return_value="Respuesta verificada") as interpretar,
        ):
            respuesta = process_copilot_chat(
                SesionFicticia(),
                [{"role": "user", "content": "¿Cómo va la empresa este mes?"}],
                empresa_id=1,
                model_preference="terra",
            )

        self.assertEqual(len(llamadas_sql), 2)
        self.assertIn("Respuesta verificada", respuesta)
        self.assertEqual(interpretar.call_args.kwargs["usage_context"]["empresa_id"], 1)
        self.assertEqual(crear_plan.call_args.args[0].fecha_inicio_comparacion, date(2025, 10, 1))
        self.assertEqual(crear_plan.call_args.args[0].fecha_fin_comparacion, date(2025, 10, 27))

    def test_resumen_gerencial_no_inventa_variacion_si_falta_comparable(self):
        class SesionFicticia:
            def get_bind(self):
                return object()

        plan = SimpleNamespace(
            periodo_actual=(date(2026, 10, 1), date(2026, 10, 27)),
            periodo_anterior=(date(2025, 10, 1), date(2025, 10, 27)),
            consultas=(SimpleNamespace(nombre="resumen", sql="SELECT 1", parametros={}),),
        )
        fila = {"ventas_periodo_actual": 120, "ventas_periodo_anterior": 0, "ventas_variacion_pct": 0,
                "margen_periodo_actual": 20, "mgd_periodo_actual": 15, "unidades_periodo_actual": 3,
                "clientes_activos": 2, "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-27"}
        with (patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)),
              patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan),
              patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=lambda _db, sql, *_args, **_kw: ([{"fecha_ultima": "2026-10-27"}], None) if "AS fecha_ultima" in sql else ([fila], None)),
              patch("app.copilot_service.interpret_results") as interpretar):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "¿Cómo va la empresa este mes?"}], 7)
        interpretar.assert_not_called()
        self.assertIn("Último día con registros", respuesta)
        self.assertIn("No se presenta la variación", respuesta)
        self.assertNotIn("variacion_ventas_pct", respuesta)
        import base64, json, re
        match = re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", respuesta)
        metricas = json.loads(base64.b64decode(match.group(1)))['data']
        self.assertEqual(metricas['ventas_eur'], 120)
        self.assertEqual(metricas['clientes_activos'], 2)
        self.assertIsNone(metricas['variacion_ventas_pct'])

    def test_resumen_gerencial_compara_hasta_ultimo_dia_disponible(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
        plan = SimpleNamespace(periodo_actual=(date(2026, 10, 1), date(2026, 10, 24)),
                               periodo_anterior=(date(2025, 10, 1), date(2025, 10, 24)),
                               consultas=(SimpleNamespace(nombre="resumen", sql="SELECT 1", parametros={}),))
        fila = {"ventas_periodo_actual": 120, "ventas_periodo_anterior": 100,
                "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-24",
                "fecha_minima_anterior": "2025-10-01", "fecha_maxima_anterior": "2025-10-24"}
        with (patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)),
              patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan) as crear_plan,
              patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=lambda _db, sql, *_args, **_kw: ([{"fecha_ultima": "2026-10-24"}], None) if "AS fecha_ultima" in sql else ([fila], None)),
              patch("app.copilot_service.interpret_results", return_value="Respuesta")):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "¿Cómo va la empresa este mes?"}], 7)
        enviado = crear_plan.call_args.args[0]
        self.assertEqual(enviado.fecha_fin, date(2026, 10, 24))
        self.assertEqual(enviado.fecha_fin_comparacion, date(2025, 10, 24))
        self.assertIn("24-10-2026", respuesta)

    def test_resumen_gerencial_se_mantiene_si_clientes_no_tiene_permiso(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass
        plan = SimpleNamespace(
            periodo_actual=(date(2026, 10, 1), date(2026, 10, 27)),
            periodo_anterior=(date(2025, 10, 1), date(2025, 10, 27)),
            consultas=(SimpleNamespace(nombre="resumen", sql="SELECT resumen", parametros={}),
                       SimpleNamespace(nombre="clientes_activos", sql="SELECT clientes_activos", parametros={}),
                       SimpleNamespace(nombre="clientes_comparativa", sql="SELECT clientes_comparativa", parametros={})),
        )
        fila = {"ventas_periodo_actual": 120, "ventas_periodo_anterior": 100,
                "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-27",
                "fecha_minima_anterior": "2025-10-01", "fecha_maxima_anterior": "2025-10-27"}
        def ejecutar(_db, sql, *_args, **_kwargs):
            if "AS fecha_ultima" in sql:
                return [{"fecha_ultima": "2026-10-27"}], None
            if "clientes" in sql:
                return None, "sin permiso"
            return [fila], None
        with (patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)),
              patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan),
              patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=ejecutar),
              patch("app.copilot_service.interpret_results", return_value="Resultado verificable") as interpretar):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "¿Cómo va la empresa este mes?"}], 7)
        interpretar.assert_not_called()
        self.assertIn("Resumen ejecutivo", respuesta)
        self.assertIn("No se pudo consultar clientes activos", respuesta)
        self.assertIn("No se pudo calcular este bloque", respuesta)
        import base64, json, re
        metricas = json.loads(base64.b64decode(re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", respuesta).group(1)))['data']
        self.assertEqual(metricas['ventas_eur'], 120)
        self.assertIsNone(metricas['clientes_activos'])

    def test_resumen_mantiene_tablas_y_no_exporta_comparativa_sin_cobertura(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass
        plan = SimpleNamespace(periodo_actual=(date(2026, 10, 1), date(2026, 10, 27)), periodo_anterior=(date(2025, 10, 1), date(2025, 10, 27)), consultas=tuple(SimpleNamespace(nombre=n, sql=n, parametros={}) for n in ("resumen", "clientes_comparativa", "top_productos", "impulsores_seccion")))
        resumen = {"ventas_periodo_actual": 120, "ventas_periodo_anterior": 90, "ventas_variacion_absoluta": 30, "ventas_variacion_pct": 33.33, "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-27"}
        detalle = {"agrupacion": "Cliente A", "sku": "S1", "nombre": "Producto", "ventas_periodo_actual": 120, "ventas_periodo_anterior": 90, "ventas_variacion_absoluta": 30}
        def ejecutar(_db, sql, *_args, **_kwargs):
            if "AS fecha_ultima" in sql:
                return [{"fecha_ultima": "2026-10-27"}], None
            return ([dict(resumen)] if sql == "resumen" else [dict(detalle)]), None
        with (patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)), patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan), patch("app.copilot_context.construir_resumen_operativo", return_value=""), patch("app.copilot_service.execute_sql", side_effect=ejecutar), patch("app.copilot_service.interpret_results") as interpretar):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "¿Cómo va la empresa este mes?"}], 7)
        interpretar.assert_not_called()
        self.assertIn("Cliente A", respuesta)
        self.assertIn("Producto", respuesta)
        self.assertIn("N/D", respuesta)
        self.assertIn("No se puede seleccionar un ranking comparativo", respuesta)
        informe = extract_signed_report_artifact(respuesta)
        self.assertIsNone(informe["resultados"]["resumen"][0]["ventas_periodo_anterior"])
        self.assertIsNone(informe["resultados"]["clientes_comparativa"][0]["ventas_variacion_absoluta"])
        self.assertNotIn("impulsores_seccion", informe["resultados"])

    def test_resumen_sin_registros_muestra_kpis_no_disponibles(self):
        import base64, json, re
        from app.copilot_service import build_metrics_marker
        marker = build_metrics_marker({"resultados": {"resumen": [{"sin_registros_actuales": True, "ventas_periodo_actual": 0, "margen_periodo_actual": 0, "mgd_periodo_actual": 0, "unidades_periodo_actual": 0, "clientes_activos": 0}]}})
        payload = json.loads(base64.b64decode(re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", marker).group(1)))
        self.assertEqual(payload["tipo"], "ejecutivo")
        self.assertEqual(len(payload["data"]), 6)
        self.assertTrue(all(valor is None for valor in payload["data"].values()))

    def test_resumen_sigue_disponible_si_falla_narracion(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
        plan = SimpleNamespace(periodo_actual=(date(2026, 10, 1), date(2026, 10, 27)), periodo_anterior=(date(2025, 10, 1), date(2025, 10, 27)), consultas=(SimpleNamespace(nombre="resumen", sql="resumen", parametros={}),))
        fila = {"ventas_periodo_actual": 120, "ventas_periodo_anterior": 100, "ventas_variacion_absoluta": 20, "ventas_variacion_pct": 20, "fecha_minima_actual": "2026-10-01", "fecha_maxima_actual": "2026-10-27", "fecha_minima_anterior": "2025-10-01", "fecha_maxima_anterior": "2025-10-27"}
        with (patch("app.copilot_orchestrator._fecha_hoy", return_value=date(2026, 10, 27)), patch("app.analitica_ventas.crear_plan_analitico_ventas", return_value=plan), patch("app.copilot_context.construir_resumen_operativo", return_value=""), patch("app.copilot_service.execute_sql", side_effect=lambda _db, sql, *_args, **_kwargs: ([{"fecha_ultima": "2026-10-27"}], None) if "AS fecha_ultima" in sql else ([dict(fila)], None)), patch("app.copilot_service.interpret_results", side_effect=RuntimeError("error simulado"))):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "¿Cómo va la empresa este mes?"}], 7)
        self.assertIn("<!-- copilot_metrics:", respuesta)
        self.assertIn("Resumen ejecutivo", respuesta)
        self.assertIn("20,00", respuesta)
        self.assertIsNotNone(extract_signed_report_artifact(respuesta))

    def test_cabecera_multidimensional_con_error_clientes_conserva_las_ventas(self):
        import base64, json, re
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass
        def ejecutar(_db, sql, _empresa_id, params, trusted_query=False):
            if "COUNT(DISTINCT CASE WHEN vh.ingreso_total" in sql:
                return None, "sin permiso"
            if "SUM(vh.ingreso_total) AS ventas_periodo_actual" in sql:
                return [{"ventas_periodo_actual": 100, "margen_periodo_actual": 10, "mgd_periodo_actual": 8, "unidades_periodo_actual": 4, "fecha_minima_actual": params["fecha_inicio"], "fecha_maxima_actual": params["fecha_fin"]}], None
            return [{"agrupacion": "Detalle", "referencia": "S1", "ventas_eur": 100, "productos": 1}], None
        with (patch("app.copilot_context.construir_resumen_operativo", return_value=""), patch("app.copilot_service.execute_sql", side_effect=ejecutar)):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "Resumen de ventas desde 01/05/2026 hasta 31/05/2026 con clientes y productos"}], 7)
        datos = json.loads(base64.b64decode(re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", respuesta).group(1)))["data"]
        self.assertEqual(datos["ventas_eur"], 100)
        self.assertIsNone(datos["clientes_activos"])
        self.assertIn("No se pudieron calcular los clientes activos", respuesta)

    def test_resumen_multidimensional_incluye_todos_los_bloques_y_reporta_fallos(self):
        class SesionFicticia:
            def get_bind(self):
                return object()

            def rollback(self):
                pass

        llamadas = []
        def ejecutar(_db, sql, empresa_id, parametros, trusted_query=False):
            self.assertEqual(empresa_id, 7)
            self.assertTrue(trusted_query)
            self.assertIn(":empresa_id", sql)
            llamadas.append(sql)
            if "c.cliente_pk" in sql:
                return None, "error controlado"
            if "p.sku AS referencia" in sql:
                return [{"referencia": "S1", "producto": "Producto", "familia": "Familia", "ventas_eur": 40}], None
            if "p.seccion" in sql:
                return [{"agrupacion": "Sección A", "ventas_eur": 40, "productos": 1}], None
            return [{"ventas_eur": 40, "productos": 1}], None

        with (patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=ejecutar)):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "Dame un resumen de ventas para este mes, con clientes, secciones y Top 10 productos"}], 7)

        self.assertEqual(len(llamadas), 5)
        self.assertIn("### Total", respuesta)
        self.assertIn("### Clientes", respuesta)
        self.assertIn("No se pudo calcular este bloque", respuesta)
        self.assertIn("### Secciones", respuesta)
        self.assertIn("Sección A", respuesta)
        self.assertIn("### Productos", respuesta)
        self.assertIn("S1", respuesta)

    def test_resumen_multidimensional_consulta_sql_y_aisla_empresas(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conexion:
            conexion.execute(text("CREATE TABLE productos (id INTEGER PRIMARY KEY, empresa_id INTEGER, sku TEXT, nombre TEXT, familia TEXT, seccion TEXT, marca TEXT, familia_marca TEXT, product_manager TEXT)"))
            conexion.execute(text("CREATE TABLE clientes (id INTEGER PRIMARY KEY, empresa_id INTEGER, cliente_pk TEXT, nombre TEXT, comercial_cliente TEXT, tipo_cliente TEXT)"))
            conexion.execute(text("CREATE TABLE ventas_historicas (producto_id INTEGER, cliente_id INTEGER, fecha_venta DATE, ingreso_total NUMERIC, cantidad_vendida NUMERIC, margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC, comercial_factura TEXT, kd TEXT)"))
            conexion.execute(text("INSERT INTO productos VALUES (1, 7, 'S1', 'Producto A', 'Familia', 'Sección A', 'Marca A', 'Familia-Marca A', 'Gestora A'), (2, 8, 'S2', 'Otra empresa', 'Familia', 'Otra sección', 'Marca B', 'Familia-Marca B', 'Gestor B')"))
            conexion.execute(text("INSERT INTO clientes VALUES (1, 7, 'C1', 'Cliente A', 'Comercial Asignado A', 'Distribuidor')"))
            conexion.execute(text("INSERT INTO ventas_historicas VALUES (1, 1, '2026-05-10', 40, 2, 8, 6, 'Factura A', 'No'), (2, 1, '2026-05-10', 9999, 1, 2, 1, 'Factura B', 'No'), (1, 1, '2025-05-10', 30, 1, 6, 4, 'Factura A', 'No')"))
        with Session(engine) as sesion, patch("app.copilot_context.construir_resumen_operativo", return_value=""):
            respuesta = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 con clientes, secciones y Top 10 productos"}], 7)
            respuesta_multimetrica = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas, unidades, margen bruto y MGD desde 01/05/2026 hasta 31/05/2026 con clientes, secciones y Top 10 productos"}], 7)
            respuesta_familias_marcas = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 con top 2 familias, top 3 marcas y clientes"}], 7)
            respuesta_comparativa = process_copilot_chat(sesion, [{"role": "user", "content": "Compara FY2025 vs FY2026 hasta el 10 de mayo las ventas con clientes, familias, marcas y productos"}], 7)
            respuesta_filtrada = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 de la familia 'Inexistente' por clientes y top 10 productos"}], 7)
            respuesta_comercial_factura = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 con clientes y comerciales de factura"}], 7)
            respuesta_comercial_asignado = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 con clientes y comerciales asignados"}], 7)
            respuesta_mensual = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas mensuales desde 01/05/2026 hasta 31/05/2026 con clientes"}], 7)
            respuesta_compuesta = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 por familia/marca y tipos de cliente"}], 7)
            respuesta_resumen = process_copilot_chat(sesion, [{"role": "user", "content": "Dame un resumen de ventas de la familia 'Familia' desde 01/05/2026 hasta 31/05/2026 con clientes, secciones y top 10 productos"}], 7)
        self.assertIn("Cliente A", respuesta)
        self.assertIn("Sección A", respuesta)
        self.assertIn("Producto A", respuesta)
        self.assertIn("40,00", respuesta)
        self.assertIn("10-05-2026", respuesta)
        self.assertIn("no garantizan una carga completa", respuesta)
        self.assertNotIn("Otra empresa", respuesta)
        self.assertNotIn("No se pudo calcular", respuesta)
        self.assertNotIn("No se pudo calcular", respuesta_multimetrica)
        self.assertIn("## Unidades", respuesta_multimetrica)
        self.assertIn("## Margen bruto", respuesta_multimetrica)
        self.assertIn("## MGD", respuesta_multimetrica)
        informe = extract_signed_report_artifact(respuesta_multimetrica)
        self.assertIsNotNone(informe)
        self.assertEqual(informe["resultados"]["ventas_unidades_sku"][0]["ventas_unidades"], 2)
        self.assertEqual(informe["resultados"]["margen_eur_cliente"][0]["margen_eur"], 8)
        self.assertIn("### Familias", respuesta_familias_marcas)
        self.assertIn("### Marcas", respuesta_familias_marcas)
        self.assertIn("Marca A", respuesta_familias_marcas)
        self.assertNotIn("Marca B", respuesta_familias_marcas)
        self.assertNotIn("No se pudo calcular", respuesta_familias_marcas)
        self.assertNotIn("No se pudo calcular", respuesta_comparativa)
        self.assertIn("10,00 €", respuesta_comparativa)
        self.assertNotIn("no coinciden", respuesta_comparativa)
        self.assertIn("Marca A", respuesta_comparativa)
        self.assertIn("No hay registros de venta", respuesta_filtrada)
        self.assertNotIn("Producto A", respuesta_filtrada)
        self.assertNotIn("No se pudo calcular", respuesta_filtrada)
        self.assertIn("Factura A", respuesta_comercial_factura)
        self.assertNotIn("Factura B", respuesta_comercial_factura)
        self.assertIn("Comercial Asignado A", respuesta_comercial_asignado)
        self.assertNotIn("No se pudo calcular", respuesta_comercial_asignado)
        self.assertIn("### Meses", respuesta_mensual)
        self.assertIn("2026-05", respuesta_mensual)
        self.assertIn("### Clientes", respuesta_mensual)
        self.assertNotIn("No se pudo calcular", respuesta_mensual)
        self.assertIn("Familia-Marca A", respuesta_compuesta)
        self.assertIn("Distribuidor", respuesta_compuesta)
        self.assertNotIn("No se pudo calcular", respuesta_compuesta)
        import base64, json, re
        datos_resumen = json.loads(base64.b64decode(re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", respuesta_resumen).group(1)))['data']
        self.assertEqual(datos_resumen['ventas_eur'], 40)
        self.assertEqual(datos_resumen['margen_eur'], 8)
        self.assertEqual(datos_resumen['mgd_eur'], 6)
        self.assertEqual(datos_resumen['ventas_unidades'], 2)
        self.assertEqual(datos_resumen['clientes_activos'], 1)
        self.assertAlmostEqual(datos_resumen['variacion_ventas_pct'], 100 / 3)
        self.assertIn("10-05-2026", respuesta_resumen)
        self.assertIn("### Conclusiones", respuesta_resumen)
        self.assertIn("Las ventas suben 10,00 € (33,33 %)", respuesta_resumen)
        self.assertEqual(extract_signed_report_artifact(respuesta_resumen)['resultados']['resumen'][0]['ventas_periodo_actual'], 40)

    def test_limites_independientes_se_persisten_en_el_contrato(self):
        from app.copilot_orchestrator import restaurar_intento
        intento, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas de este mes con top 5 clientes, top 3 secciones y top 10 productos"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(intento.limites_dimensiones, {"cliente": 5, "seccion": 3, "sku": 10})
        self.assertEqual(restaurar_intento(serializar_intento(intento)).limites_dimensiones, intento.limites_dimensiones)
        siguiente, aclaracion = analizar_intencion([
            {"role": "user", "content": "Ventas de este mes con top 5 clientes, top 3 secciones y top 10 productos"},
            {"role": "assistant", "content": "Resultado anterior"},
            {"role": "user", "content": "Compáralo con el mismo periodo del año anterior"},
        ], serializar_intento(intento))
        self.assertIsNone(aclaracion)
        self.assertEqual(siguiente.dimensiones, intento.dimensiones)
        self.assertEqual(siguiente.limites_dimensiones, intento.limites_dimensiones)

    def test_dimensiones_y_limites_de_familia_y_marca_se_persisten(self):
        from app.copilot_orchestrator import restaurar_intento
        intento, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes con top 2 familias, top 3 marcas y clientes"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(intento.dimensiones, ("cliente", "familia", "marca"))
        self.assertEqual(intento.limites_dimensiones, {"familia": 2, "marca": 3})
        restaurado = restaurar_intento(serializar_intento(intento))
        self.assertEqual(restaurado.dimensiones, intento.dimensiones)
        self.assertEqual(restaurado.limites_dimensiones, intento.limites_dimensiones)

    def test_dimensiones_no_implementadas_se_declaran_sin_omitirlas(self):
        for texto, dimension in (
            ("Ventas de este mes con clientes y comerciales", "comercial"),
        ):
            with self.subTest(texto=texto):
                intento, aclaracion = analizar_intencion([{"role": "user", "content": texto}])
                self.assertIsNone(intento)
                self.assertIn(dimension, aclaracion)

    def test_ordenes_independientes_y_dimensiones_compuestas_se_persisten(self):
        from app.copilot_orchestrator import restaurar_intento
        intento, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes con los peores clientes y top 10 productos"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(intento.ordenes_dimensiones, {"cliente": "asc", "sku": "desc"})
        self.assertEqual(restaurar_intento(serializar_intento(intento)).ordenes_dimensiones, intento.ordenes_dimensiones)
        compuesto, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes por familia/marca y tipos de cliente"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(compuesto.dimensiones, ("familia_marca", "tipo_cliente"))
        singular, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes con cliente y sección"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(singular.dimensiones, ("cliente", "seccion"))
        self.assertNotIn("nombre_cliente", singular.parametros)
        sku, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes por clientes y top 10 SKU"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(sku.dimensiones, ("cliente", "sku"))
        limites, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes con los cinco peores clientes y 10 mejores productos"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(limites.limites_dimensiones, {"cliente": 5, "sku": 10})
        filtrado, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas del SKU A123 este mes por clientes y secciones"}])
        self.assertIsNone(aclaracion)
        self.assertEqual(filtrado.dimensiones, ("cliente", "seccion"))
        self.assertEqual(filtrado.parametros["sku"], "A123")

    def test_multidimension_no_omite_dimension_desconocida(self):
        intento, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes por clientes, productos y por región"}])
        self.assertIsNone(intento)
        self.assertIn("desglose validado", aclaracion)
        intento, aclaracion = analizar_intencion([{"role": "user", "content": "Ventas este mes por clientes y región"}])
        self.assertIsNone(intento)
        self.assertIn("desglose validado", aclaracion)

    def test_multidimension_declara_cualquier_fallo_en_respuesta_y_exportacion(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass

        for bloque, fragmento in (("Clientes", "c.cliente_pk"), ("Secciones", "p.seccion"), ("Productos", "p.sku AS referencia")):
            def ejecutar(_db, sql, _empresa_id, _parametros, trusted_query=False):
                if fragmento in sql:
                    return None, "fallo simulado"
                if "p.sku AS referencia" in sql:
                    return [{"referencia": "S1", "producto": "Producto", "familia": "Familia", "ventas_eur": 40}], None
                return [{"agrupacion": "Detalle", "ventas_eur": 40, "productos": 1}], None
            with self.subTest(bloque=bloque), patch("app.copilot_context.construir_resumen_operativo", return_value=""), patch("app.copilot_service.execute_sql", side_effect=ejecutar):
                respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "Ventas de este mes con clientes, secciones y top 10 productos"}], 7)
                self.assertIn(f"### {bloque}\n\nNo se pudo calcular este bloque", respuesta)
                informe = extract_signed_report_artifact(respuesta)
                self.assertIn({"Bloque": bloque, "Estado": "Error de cálculo"}, informe["resultados"]["estado_bloques"])
                self.assertEqual(len(informe["resultados"]["estado_bloques"]), 4)

    def test_ranking_multidimensional_respeta_orden_y_empresa_del_cliente(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conexion:
            conexion.execute(text("CREATE TABLE productos (id INTEGER PRIMARY KEY, empresa_id INTEGER, sku TEXT, nombre TEXT, familia TEXT, seccion TEXT, marca TEXT)"))
            conexion.execute(text("CREATE TABLE clientes (id INTEGER PRIMARY KEY, empresa_id INTEGER, cliente_pk TEXT, nombre TEXT)"))
            conexion.execute(text("CREATE TABLE ventas_historicas (producto_id INTEGER, cliente_id INTEGER, fecha_venta DATE, ingreso_total NUMERIC, cantidad_vendida NUMERIC, margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC)"))
            conexion.execute(text("INSERT INTO productos VALUES (1, 7, 'A', 'Mayor', 'F', 'S', 'M'), (2, 7, 'B', 'Menor', 'F', 'S', 'M'), (3, 7, 'C', 'Otro', 'F', 'S', 'M')"))
            conexion.execute(text("INSERT INTO clientes VALUES (1, 7, 'C1', 'Grande'), (2, 7, 'C2', 'Pequeño'), (3, 8, 'C3', 'Dato de otra empresa')"))
            conexion.execute(text("INSERT INTO ventas_historicas VALUES (1, 1, '2026-05-10', 100, 1, 10, 8), (2, 2, '2026-05-10', 20, 1, 2, 1), (3, 3, '2026-05-10', 30, 1, 3, 2)"))
        with Session(engine) as sesion, patch("app.copilot_context.construir_resumen_operativo", return_value=""):
            respuesta = process_copilot_chat(sesion, [{"role": "user", "content": "Ventas desde 01/05/2026 hasta 31/05/2026 con los peores clientes y top 2 productos"}], 7)
        self.assertNotIn("Dato de otra empresa", respuesta)
        clientes = respuesta.split("### Clientes", 1)[1].split("### Productos", 1)[0]
        productos = respuesta.split("### Productos", 1)[1]
        self.assertLess(clientes.index("Pequeño"), clientes.index("Grande"))
        self.assertLess(productos.index("Mayor"), productos.index("Otro"))
        self.assertNotIn("Menor", productos)
        informe = extract_signed_report_artifact(respuesta)
        self.assertEqual([fila["referencia"] for fila in informe["resultados"]["sku"]], ["A", "C"])

    def test_multidimension_exporta_estados_y_no_inventa_comparativa_sin_cobertura(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass

        def ejecutar(_db, sql, empresa_id, parametros, trusted_query=False):
            if "registros_anteriores" in sql:
                return [{"periodo_actual": 100, "periodo_anterior": 0, "variacion_absoluta": 100, "productos": 1, "registros_actuales": 1, "registros_anteriores": 0}], None
            if "c.cliente_pk" in sql:
                return None, "fallo"
            return [{"referencia": "S1", "agrupacion": "Sección", "periodo_actual": 100, "periodo_anterior": 0, "variacion_absoluta": 100, "variacion_pct": 0}], None

        with (patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=ejecutar)):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": "Compara ventas este mes con el año anterior por clientes, secciones y top 10 productos"}], 7)
        self.assertIn("no hay registros de ventas", respuesta)
        self.assertIn("N/D (sin registros)", respuesta)
        informe = extract_signed_report_artifact(respuesta)
        self.assertIsNotNone(informe)
        self.assertIsNone(informe["resultados"]["sku"][0]["periodo_anterior"])
        self.assertIn({"Bloque": "Clientes", "Estado": "Error de cálculo"}, informe["resultados"]["estado_bloques"])

    def test_multidimension_no_atribuye_a_ventas_la_diferencia_de_tramos(self):
        class SesionFicticia:
            def get_bind(self):
                return object()
            def rollback(self):
                pass

        def ejecutar(_db, sql, empresa_id, parametros, trusted_query=False):
            if "registros_anteriores" in sql:
                return [{"periodo_actual": 100, "periodo_anterior": 90, "variacion_absoluta": 10, "productos": 1, "registros_actuales": 1, "registros_anteriores": 1,
                         "fecha_minima_actual": "2026-05-05", "fecha_maxima_actual": "2026-05-10", "fecha_minima_anterior": "2025-05-01", "fecha_maxima_anterior": "2025-05-10"}], None
            return [{"referencia": "S1", "agrupacion": "Cliente A", "periodo_actual": 100, "periodo_anterior": 90, "variacion_absoluta": 10, "variacion_pct": 11.11}], None

        pregunta = "Compara FY2025 vs FY2026 hasta el 10 de mayo las ventas por clientes y top 10 productos"
        with (patch("app.copilot_context.construir_resumen_operativo", return_value=""),
              patch("app.copilot_service.execute_sql", side_effect=ejecutar)):
            respuesta = process_copilot_chat(SesionFicticia(), [{"role": "user", "content": pregunta}], 7)
        self.assertIn("no coinciden", respuesta)
        self.assertIn("actividad comercial o a una carga incompleta", respuesta)
        self.assertIn("Diferencia observada provisional: **10,00 €**", respuesta)
        self.assertIn("Actual (FY2026)", respuesta)
        self.assertIn("Período anterior (FY2025)", respuesta)
        self.assertIn("| S1 | 100,00 € | 90,00 € | 10,00 € | 11,11 % |", respuesta)
        informe = extract_signed_report_artifact(respuesta)
        self.assertIsNone(informe["resultados"]["sku"][0]["variacion_absoluta"])
        self.assertIsNone(informe["resultados"]["sku"][0]["variacion_pct"])
        self.assertEqual(informe["resultados"]["sku"][0]["diferencia_observada"], 10)
        self.assertTrue(informe["resultados"]["sku"][0]["comparacion_provisional"])

    def test_etiquetas_fiscales_respetan_mayo_y_rangos(self):
        from datetime import date
        from app.copilot_service import etiqueta_ejercicios_fiscales

        self.assertEqual(etiqueta_ejercicios_fiscales(date(2026, 1, 1), date(2026, 4, 30)), "FY2025")
        self.assertEqual(etiqueta_ejercicios_fiscales(date(2026, 5, 1), date(2027, 4, 30)), "FY2026")
        self.assertEqual(etiqueta_ejercicios_fiscales(date(2026, 4, 30), date(2026, 5, 1)), "FY2025–FY2026")


if __name__ == "__main__":
    unittest.main()
