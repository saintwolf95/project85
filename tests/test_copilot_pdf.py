import unittest
from decimal import Decimal

from app.copilot_pdf import _columnas, _etiqueta, _valor, generar_pdf_informe


class CopilotPdfTests(unittest.TestCase):
    def test_etiquetas_de_negocio_y_formato_espanol(self):
        self.assertEqual(_etiqueta("referencia", "sku"), "Código de producto")
        self.assertEqual(_etiqueta("producto", "sku"), "Producto")
        self.assertEqual(_etiqueta("familia", "sku"), "Familia")
        self.assertEqual(_etiqueta("agrupacion", "cliente"), "Cliente")
        self.assertEqual(_valor("periodo_actual", 8220381.85999997, "sku"), "8.220.382 €")
        self.assertEqual(_valor("variacion_pct", -24.05, "sku"), "-24,05 %")
        self.assertEqual(_valor("clientes", 1399, "cliente"), "1.399")
        self.assertEqual(_valor("periodo_actual", Decimal("12.50"), "ventas_unidades"), "12,5")
        self.assertEqual(_valor("periodo_actual", Decimal("12.50"), "sku", "ventas_unidades"), "12,5")
        self.assertEqual(_valor("periodo_anterior", None, "sku"), "N/D")

    def test_diferencias_provisionales_no_se_ocultan(self):
        filas = [{"referencia": "SKU", "periodo_actual": 100, "periodo_anterior": 90, "variacion_absoluta": None, "variacion_pct": None, "diferencia_observada": 10, "diferencia_observada_pct": 11.1, "comparacion_provisional": True}]
        columnas, _ = _columnas(filas, "sku")
        self.assertIn("diferencia_observada", columnas)
        self.assertIn("diferencia_observada_pct", columnas)
        self.assertNotIn("variacion_absoluta", columnas)

    def test_genera_pdf_con_los_datos_disponibles(self):
        informe = {"periodo_actual": {"inicio": "2026-10-01", "fin": "2026-10-24"}, "periodo_anterior": {"inicio": "2025-10-01", "fin": "2025-10-24"}, "resultados": {"sku": [{"referencia": "A1", "producto": "Portátil", "familia": "Informática", "periodo_actual": 1234.9, "periodo_anterior": 1000, "variacion_absoluta": 234.9, "variacion_pct": 23.49}]}}
        pdf = generar_pdf_informe(informe, 298)
        self.assertTrue(pdf.read(5).startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
