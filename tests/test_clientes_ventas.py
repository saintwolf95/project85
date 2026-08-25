import csv
import hashlib
import io
import unittest
import zipfile

from fastapi import HTTPException

from app.routers.data_import import DATASET_CONFIG, _canonicalize_headers, _margin_percentage_with_loss_floor, _parse_percentage, _read_csv, _validate_rows, _validate_xlsx_archive


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
        self.assertEqual(_parse_percentage("-123018,6%", "% MGD"), -200.0)

    def test_xlsx_normal_no_se_rechaza_por_su_contenido_descomprimido(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            varied_content = b"".join(hashlib.sha256(str(index).encode()).digest() for index in range(500))
            archive.writestr("xl/worksheets/sheet1.xml", varied_content)

        _validate_xlsx_archive(output.getvalue())

    def test_xlsx_con_ratio_de_compresion_anomalo_se_bloquea(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/worksheets/sheet1.xml", b"0" * 1_000_000)

        with self.assertRaisesRegex(HTTPException, "compresión anómala"):
            _validate_xlsx_archive(output.getvalue())


if __name__ == "__main__":
    unittest.main()
