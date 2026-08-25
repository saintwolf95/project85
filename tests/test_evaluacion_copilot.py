import unittest
from datetime import date

from app.copilot_orchestrator import analizar_intencion, crear_consulta_semantica, resolver_periodo


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


if __name__ == "__main__":
    unittest.main()
