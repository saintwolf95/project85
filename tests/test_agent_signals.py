import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.agent_signals import _signal, refresh_agent_signals
from app.models import AgentSignal


class AgentSignalPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        AgentSignal.__table__.create(self.engine)

    def test_nueva_senal_se_asocia_a_la_empresa_que_ejecuta_el_detector(self):
        detected = [_signal(
            "maria",
            "stock_muerto_90d",
            "sku",
            "SKU-1",
            date(2026, 5, 27),
            date(2026, 8, 25),
            4,
            12500,
            0.9,
            0,
            1,
            {"valor_inventario_eur": 12500},
        )]

        with Session(self.engine) as session, patch(
            "app.agent_signals.collect_detected_signals",
            return_value=detected,
        ):
            active = refresh_agent_signals(session, empresa_id=7)
            session.commit()

        self.assertEqual(len(active), 1)
        with Session(self.engine) as session:
            stored = session.query(AgentSignal).one()
            self.assertEqual(stored.empresa_id, 7)
            self.assertEqual(stored.entidad_id, "SKU-1")


if __name__ == "__main__":
    unittest.main()
