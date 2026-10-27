import unittest
from datetime import date

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
from app.copilot_service import interpret_results


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


if __name__ == "__main__":
    unittest.main()
