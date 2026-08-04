import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.agents_service import daily_utc_window
from app.daily_agents import seconds_until_next_report


class DailyAgentReportsTests(unittest.TestCase):
    def test_ventana_diaria_respeta_horario_de_verano_de_madrid(self):
        start, end = daily_utc_window(date(2026, 7, 20))

        self.assertEqual(start, datetime(2026, 7, 19, 22, 0))
        self.assertEqual(end, datetime(2026, 7, 20, 22, 0))

    def test_ventana_diaria_respeta_horario_de_invierno_de_madrid(self):
        start, end = daily_utc_window(date(2026, 1, 20))

        self.assertEqual(start, datetime(2026, 1, 19, 23, 0))
        self.assertEqual(end, datetime(2026, 1, 20, 23, 0))

    def test_planificador_apunta_a_las_seis_del_siguiente_dia(self):
        madrid = ZoneInfo("Europe/Madrid")
        delay = seconds_until_next_report(datetime(2026, 7, 20, 7, 0, tzinfo=madrid))

        self.assertEqual(delay, 23 * 60 * 60)


if __name__ == "__main__":
    unittest.main()
