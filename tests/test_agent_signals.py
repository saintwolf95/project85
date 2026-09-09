import unittest
import json
from datetime import date, datetime
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.agent_signals import _signal, build_evidence_bundle, is_signal_suppressed, refresh_agent_signals
from app.models import AgentSignal, AgentSignalFeedback


class AgentSignalPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        AgentSignal.__table__.create(self.engine)
        AgentSignalFeedback.__table__.create(self.engine)

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

    def test_descartada_con_feedback_reciente_queda_suprimida(self):
        signal_data = _signal(
            "maria", "stock_muerto_90d", "sku", "SKU-2", date(2026, 5, 27), date(2026, 8, 25),
            4, 12500, 0.9, 0, 1, {"valor_inventario_eur": 12500},
        )
        signal_data["evidencia"] = json.dumps(signal_data["evidencia"])
        signal = AgentSignal(empresa_id=7, estado="descartada", descartada_en=datetime.utcnow(), **signal_data)
        with Session(self.engine) as session:
            session.add(signal)
            session.flush()
            session.add(AgentSignalFeedback(
                empresa_id=7, signal_id=signal.id, usuario_id=1,
                veredicto="falso_positivo", motivo="Revisado: no aplica.",
            ))
            session.commit()
        with Session(self.engine) as session:
            stored = session.query(AgentSignal).one()
            self.assertTrue(is_signal_suppressed(session, stored, datetime.utcnow()))

    def test_contexto_de_senal_no_puede_cruzar_empresas(self):
        local = _signal("lucia", "caida_facturacion_familia", "familia", "Local", date(2026, 8, 1), date(2026, 8, 31), 4, 1000, .9, 1, 2, {})
        external = _signal("lucia", "caida_facturacion_familia", "familia", "Externa", date(2026, 8, 1), date(2026, 8, 31), 4, 2000, .9, 1, 2, {})
        local["evidencia"], external["evidencia"] = json.dumps({}), json.dumps({})
        with Session(self.engine) as session:
            session.add_all([AgentSignal(empresa_id=7, **local), AgentSignal(empresa_id=8, **external)])
            session.commit()
            outsider_id = session.query(AgentSignal.id).filter(AgentSignal.empresa_id == 8).scalar()
            bundle = build_evidence_bundle(session, 7, "lucia", signal_id=outsider_id)
        self.assertIsNone(bundle["senal_contextual"])
        self.assertEqual([signal["entidad"]["id"] for signal in bundle["senales"]], ["Local"])


if __name__ == "__main__":
    unittest.main()
