import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.agent_correlation import refresh_agent_episodes, refresh_signal_links
from app.models import AgentEpisode, AgentSignal, AgentSignalLink, Producto


class AgentCorrelationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        AgentEpisode.__table__.create(self.engine)
        AgentSignal.__table__.create(self.engine)
        AgentSignalLink.__table__.create(self.engine)
        Producto.__table__.create(self.engine)

    @staticmethod
    def signal(detector, entity_type, entity_id, start, end, impact, fingerprint, impact_type="en_riesgo"):
        return AgentSignal(
            empresa_id=1, agente="maria" if entity_type == "sku" else "lucia", detector=detector,
            entidad_tipo=entity_type, entidad_id=entity_id, periodo_inicio=start, periodo_fin=end,
            severidad=4, impacto_eur=impact, impacto_tipo=impact_type,
            impacto_ponderado_eur=impact, confianza=0.9, valor_actual=1, valor_esperado=2,
            desviacion=-1, evidencia="{}", fingerprint=fingerprint, estado="nueva",
        )

    def test_r1_relaciona_rotura_y_caida_de_la_misma_familia_con_siete_dias(self):
        with Session(self.engine) as session:
            session.add(Producto(empresa_id=1, sku="SKU-A", nombre="A", costo_unitario=1, precio_venta=2, familia="Portátiles"))
            session.add_all([
                self.signal("rotura_stock_clase_a", "sku", "SKU-A", date(2026, 8, 1), date(2026, 8, 7), 1000, "rotura-a"),
                self.signal("caida_facturacion_familia", "familia", "Portátiles", date(2026, 8, 1), date(2026, 8, 31), 5000, "caida-a", "realizado"),
                self.signal("rotura_stock_clase_a", "sku", "SKU-A", date(2026, 8, 1), date(2026, 8, 6), 1000, "rotura-corta"),
            ])
            session.flush()
            links = refresh_signal_links(session, 1)
            self.assertEqual(len([link for link in links if link.regla == "R1_rotura_explica_caida"]), 1)
            self.assertEqual(links[0].solape_dias, 7)

    def test_episodio_no_duplica_dos_facetas_de_la_misma_senal(self):
        with Session(self.engine) as session:
            drop = self.signal("caida_facturacion_familia", "familia", "Monitores", date(2026, 8, 1), date(2026, 8, 31), 1000, "drop", "realizado")
            price = self.signal("precio_volumen_familia", "familia", "Monitores", date(2026, 8, 1), date(2026, 8, 31), 700, "price", "realizado")
            session.add_all([drop, price])
            session.flush()
            session.add(AgentSignalLink(
                empresa_id=1, signal_origen_id=price.id, signal_destino_id=drop.id,
                tipo_relacion="duplica", regla="manual_duplicate", solape_dias=31, detalle="{}",
            ))
            session.flush()
            episodes = refresh_agent_episodes(session, 1)
            self.assertEqual(len(episodes), 1)
            self.assertEqual(episodes[0].impacto_realizado_eur, 1000)
            self.assertEqual(episodes[0].impacto_ponderado_eur, 1000)


if __name__ == "__main__":
    unittest.main()
