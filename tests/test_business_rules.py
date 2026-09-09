import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.business_rules import ensure_no_overlap, resolve_detector_threshold, resolve_rule
from app.models import EmpresaReglaNegocio


class BusinessRulesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        EmpresaReglaNegocio.__table__.create(self.engine)

    def test_resuelve_sku_familia_empresa_y_constante_en_ese_orden(self):
        with Session(self.engine) as session:
            session.add_all([
                EmpresaReglaNegocio(empresa_id=1, clave="lead_time_dias", ambito_tipo="empresa", valor_num=7, vigente_desde=date(2026, 1, 1)),
                EmpresaReglaNegocio(empresa_id=1, clave="lead_time_dias", ambito_tipo="familia", ambito_id="Portátiles", valor_num=14, vigente_desde=date(2026, 1, 1)),
                EmpresaReglaNegocio(empresa_id=1, clave="lead_time_dias", ambito_tipo="sku", ambito_id="SKU-1", valor_num=21, vigente_desde=date(2026, 1, 1)),
            ])
            session.commit()
            self.assertEqual(resolve_rule(session, 1, "lead_time_dias", sku="SKU-1", familia="Portátiles", default=5).value, 21)
            self.assertEqual(resolve_rule(session, 1, "lead_time_dias", sku="SKU-2", familia="Portátiles", default=5).value, 14)
            self.assertEqual(resolve_rule(session, 1, "lead_time_dias", sku="SKU-2", familia="Cables", default=5).value, 7)
            self.assertEqual(resolve_rule(session, 2, "lead_time_dias", sku="SKU-2", familia="Cables", default=5).value, 5)

    def test_rechaza_solape_de_vigencia_en_misma_regla_y_ambito(self):
        with Session(self.engine) as session:
            session.add(EmpresaReglaNegocio(empresa_id=1, clave="margen_objetivo_pct", ambito_tipo="familia", ambito_id="Monitores", valor_num=12, vigente_desde=date(2026, 1, 1), vigente_hasta=date(2026, 6, 30)))
            session.commit()
            candidate = EmpresaReglaNegocio(empresa_id=1, clave="margen_objetivo_pct", ambito_tipo="familia", ambito_id="Monitores", valor_num=10, vigente_desde=date(2026, 6, 1))
            with self.assertRaisesRegex(ValueError, "solapa"):
                ensure_no_overlap(session, candidate)

    def test_umbral_de_detector_nombrado_prevalece_sobre_el_global(self):
        with Session(self.engine) as session:
            session.add_all([
                EmpresaReglaNegocio(empresa_id=1, clave="umbral_detector", ambito_tipo="empresa", valor_num=250, vigente_desde=date(2026, 1, 1)),
                EmpresaReglaNegocio(empresa_id=1, clave="umbral_detector", ambito_tipo="empresa", ambito_id="caida_ventas_sku", valor_num=750, vigente_desde=date(2026, 1, 1)),
            ])
            session.commit()
            named = resolve_detector_threshold(session, 1, "caida_ventas_sku", default=500)
            generic = resolve_detector_threshold(session, 1, "otro_detector", default=500)
        self.assertEqual(named.value, 750)
        self.assertEqual(generic.value, 250)


if __name__ == "__main__":
    unittest.main()
