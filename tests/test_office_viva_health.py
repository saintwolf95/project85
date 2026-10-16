import unittest
from datetime import date

from app.office_viva_service import DEAD_DAYS, _days_without_sale, _health, _inventory_health, _linear_score, office_filter_options, office_viva_drill


class OfficeVivaHealthTests(unittest.TestCase):
    def test_escala_lineal_se_acota_en_los_extremos(self):
        self.assertEqual(_linear_score(-20, -10, 10), 0)
        self.assertEqual(_linear_score(20, -10, 10), 100)
        self.assertEqual(_linear_score(0, -10, 10), 50)

    def test_salud_normaliza_pesos_si_un_factor_no_tiene_dato(self):
        result = _health([
            {"label": "A", "score": 100, "weight": .35},
            {"label": "B", "score": None, "weight": .25},
            {"label": "C", "score": 50, "weight": .40},
        ])
        self.assertEqual(result["score"], 73)
        self.assertAlmostEqual(sum(item["weight"] for item in result["components"]), 1.0)

    def test_salud_inventario_usa_los_cuatro_factores_de_v6(self):
        result = _inventory_health({
            "coverageDays": 30, "valueEur": 100, "deadEur": 10, "deadDays": 180,
            "aging": [("0-30", 60), ("31-90", 40)],
        }, [{"score": 80}])

        self.assertEqual(result["score"], 76)
        self.assertEqual([item["label"] for item in result["components"]], [
            "Cobertura", "Aging muerto (>180 d)", "Stock de menos de 30 días", "Sanidad media de PM",
        ])

    def test_aging_sin_venta_supera_el_umbral_unico(self):
        self.assertEqual(_days_without_sale(date(2026, 10, 16), None), DEAD_DAYS + 1)

    def test_buscador_corto_no_consulta_la_base_de_datos(self):
        self.assertEqual(office_filter_options(None, 1, "a"), {"articulo": []})

    def test_drill_no_admite_un_grafico_fuera_de_lista(self):
        with self.assertRaisesRegex(ValueError, "no válido"):
            office_viva_drill(None, 1, chart="anything", key="x")


if __name__ == "__main__":
    unittest.main()
