import unittest

from app.office_viva_service import _health, _inventory_health, _linear_score


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


if __name__ == "__main__":
    unittest.main()
