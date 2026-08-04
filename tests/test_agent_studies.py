import unittest
from datetime import date

from app.agent_studies import _distribution, _fill_daily_series, _linear_regression


class AgentStudiesTests(unittest.TestCase):
    def test_regresion_lineal_detecta_tendencia_perfecta(self):
        result = _linear_regression([100, 110, 120, 130, 140])

        self.assertTrue(result["available"])
        self.assertAlmostEqual(result["slope_eur_per_day"], 10)
        self.assertAlmostEqual(result["r_squared"], 1)
        self.assertAlmostEqual(result["slope_ci95_low"], 10)
        self.assertAlmostEqual(result["slope_ci95_high"], 10)

    def test_distribucion_calcula_media_mediana_y_variabilidad(self):
        result = _distribution([0, 100, 200, 300])

        self.assertEqual(result["n"], 4)
        self.assertEqual(result["mean"], 150)
        self.assertEqual(result["median"], 150)
        self.assertGreater(result["coefficient_variation_pct"], 70)

    def test_serie_diaria_rellena_dias_sin_registros_con_cero(self):
        rows = [{"fecha": date(2026, 7, 1), "ventas_eur": 100, "unidades": 2, "mgd_eur": 10}]

        result = _fill_daily_series(rows, date(2026, 7, 1), date(2026, 7, 3))

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["ventas_eur"], 100)
        self.assertEqual(result[1]["ventas_eur"], 0)
        self.assertEqual(result[2]["fecha"], "2026-07-03")


if __name__ == "__main__":
    unittest.main()
