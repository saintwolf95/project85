import unittest
from datetime import date

from app.dashboard_service import _pct, comparison_window


class DashboardPeriodTests(unittest.TestCase):
    def test_fytd_compara_mismos_dias_del_ejercicio_anterior(self):
        current_start, current_end, previous_start, previous_end = comparison_window(
            date(2026, 8, 24), "fytd"
        )

        self.assertEqual((current_start, current_end), (date(2026, 5, 1), date(2026, 8, 24)))
        self.assertEqual((previous_start, previous_end), (date(2025, 5, 1), date(2025, 8, 24)))

    def test_ventana_30d_usa_comparable_inmediatamente_anterior(self):
        current_start, current_end, previous_start, previous_end = comparison_window(
            date(2026, 8, 24), "30d"
        )

        self.assertEqual((current_start, current_end), (date(2026, 7, 26), date(2026, 8, 24)))
        self.assertEqual((previous_start, previous_end), (date(2026, 6, 26), date(2026, 7, 25)))

    def test_porcentaje_admite_comparable_negativo_sin_invertir_el_denominador(self):
        self.assertEqual(_pct(-50, -100), 50.0)
        self.assertIsNone(_pct(100, 0))


if __name__ == "__main__":
    unittest.main()
