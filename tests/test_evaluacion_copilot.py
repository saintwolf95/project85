import unittest

from app.copilot_orchestrator import analizar_intencion


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
    ("Compara el inventario con el mes anterior", None, None, None, None, None, "snapshot"),
    ("Inventario de los ultimos 30 dias", None, None, None, None, None, "snapshot"),
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
)


class EvaluacionCopilotTests(unittest.TestCase):
    def test_cuarenta_consultas_gerenciales_y_operativas(self):
        self.assertEqual(len(CASOS_EVALUACION), 40)
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


if __name__ == "__main__":
    unittest.main()
