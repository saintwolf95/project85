import unittest

from app.routers.data_import import DATASET_CONFIG, _canonicalize_headers, _validate_rows


class InventarioHistoricoTests(unittest.TestCase):
    def test_acepta_las_columnas_del_archivo_real_de_inventario(self):
        normalized = _canonicalize_headers(DATASET_CONFIG["inventory"]["headers"], "inventory")

        self.assertIn("fecha_inventario", normalized)
        self.assertIn("inventario_eur", normalized)
        self.assertIn("stock_disponible", normalized)

    def test_valida_importe_euro_y_unidades_por_fecha(self):
        rows = [{
            "fecha_inventario": "13/08/2026",
            "nombre": "CONVERSOR USB",
            "sku": "CA16504172",
            "marca": "Aisens",
            "familia_marca": "Cables-Aisens",
            "familia": "Cables",
            "seccion": "AISENS",
            "ean": "8436574709780",
            "product_manager": "Lucia Simcenco",
            "inventario_eur": "1.110 €",
            "stock_disponible": "6",
        }]

        valid, errors, warnings = _validate_rows("inventory", rows)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(valid[0]["fecha_inventario"].isoformat(), "2026-08-13")
        self.assertEqual(valid[0]["inventario_eur"], 1110.0)
        self.assertEqual(valid[0]["stock_disponible"], 6)

    def test_rechaza_el_mismo_sku_en_la_misma_fecha(self):
        row = {
            "fecha_inventario": "13/08/2026", "nombre": "Producto", "sku": "SKU-1",
            "marca": "Marca", "familia_marca": "Familia-Marca", "familia": "Familia",
            "seccion": "Seccion", "ean": "123", "product_manager": "PM",
            "inventario_eur": "31 €", "stock_disponible": "6",
        }

        _valid, errors, _warnings = _validate_rows("inventory", [row, row])

        self.assertEqual(len(errors), 1)
        self.assertIn("Fecha + ArticuloPK", errors[0]["message"])


if __name__ == "__main__":
    unittest.main()
