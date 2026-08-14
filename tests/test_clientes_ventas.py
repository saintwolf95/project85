import csv
import io
import unittest

from app.routers.data_import import DATASET_CONFIG, _canonicalize_headers, _margin_percentage_with_loss_floor, _read_csv, _validate_rows


class ClientesVentasTests(unittest.TestCase):
    def test_fivemin_ventas_exige_dimensiones_de_cliente(self):
        required = DATASET_CONFIG["sales"]["required"]

        self.assertTrue({
            "cliente_pk",
            "nombre_cliente",
            "kd",
            "tipo_cliente",
            "comercial_cliente",
            "comercial_factura",
        }.issubset(required))

        normalized = _canonicalize_headers(DATASET_CONFIG["sales"]["headers"], "sales")
        self.assertIn("cliente_pk", normalized)
        self.assertIn("comercial_cliente", normalized)
        self.assertIn("comercial_factura", normalized)

    def test_valida_y_normaliza_una_venta_con_cliente(self):
        rows = [{
            "fecha_venta": "01/08/2026",
            "ingreso_total": "100,50",
            "cantidad_vendida": "2",
            "margen_bruto_pct": "20%",
            "margen_bruto_eur": "20,10",
            "margen_destino_pct": "15%",
            "margen_destino_eur": "15,08",
            "nombre": "Producto",
            "sku": "SKU-1",
            "marca": "Marca",
            "familia_marca": "Familia/Marca",
            "familia": "Familia",
            "seccion": "Seccion",
            "ean": "1234567890123",
            "product_manager": "PM",
            "cliente_pk": "CLI-1",
            "nombre_cliente": "Cliente Uno",
            "kd": "si",
            "tipo_cliente": "Distribuidor",
            "comercial_cliente": "Ana",
            "comercial_factura": "Luis",
        }]

        valid, errors, warnings = _validate_rows("sales", rows)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(valid[0]["cliente_pk"], "CLI-1")
        self.assertEqual(valid[0]["nombre_cliente"], "Cliente Uno")
        self.assertEqual(valid[0]["kd"], "SI")
        self.assertEqual(valid[0]["comercial_cliente"], "Ana")
        self.assertEqual(valid[0]["comercial_factura"], "Luis")

    def test_ignora_total_y_filtros_de_power_bi_al_final(self):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(DATASET_CONFIG["sales"]["headers"])
        writer.writerow(DATASET_CONFIG["sales"]["sample"])
        writer.writerow(["Total", "22.949.634 €", "398.862", "4,8%", "1.107.955 €", "3,8%", "880.562 €"])
        writer.writerow(["Filtros aplicados: Periodo es Current FY; Kit Digital es No"])
        writer.writerow(["Nombre Familia no es Marketing o Gestión"])

        rows, metadata = _read_csv(output.getvalue().encode("utf-8"), "sales")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fecha_venta"], "01/05/2026")
        self.assertEqual(metadata["ignored_powerbi_rows"], 3)

    def test_ancla_perdida_sin_venta_a_menos_doscientos_por_ciento(self):
        self.assertEqual(_margin_percentage_with_loss_floor(-12.0, 0.0), -200.0)
        self.assertEqual(_margin_percentage_with_loss_floor(-300.0, 100.0), -200.0)
        self.assertEqual(_margin_percentage_with_loss_floor(-12.0, 100.0), -12.0)


if __name__ == "__main__":
    unittest.main()
