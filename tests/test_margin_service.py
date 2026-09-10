from datetime import date
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.margin_service import concentration, margin_detail, overview, resolve_period
from app.models import Cliente, Empresa, Producto, VentaHistorica


class MarginServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Empresa.__table__.create(self.engine)
        Cliente.__table__.create(self.engine)
        Producto.__table__.create(self.engine)
        VentaHistorica.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(Empresa(id=1, nombre="Demo"))
        self.db.add_all([
            Producto(id=1, empresa_id=1, sku="A", nombre="A", costo_unitario=50, precio_venta=100, familia="F"),
            Producto(id=2, empresa_id=1, sku="B", nombre="B", costo_unitario=50, precio_venta=100, familia="F"),
        ])
        self.db.add_all([
            VentaHistorica(producto_id=1, fecha_venta=date(2026, 9, 1), cantidad_vendida=1, precio_unitario=100, ingreso_total=100, margen_bruto_eur=10, margen_destino_eur=5),
            VentaHistorica(producto_id=2, fecha_venta=date(2026, 9, 1), cantidad_vendida=1, precio_unitario=1000, ingreso_total=1000, margen_bruto_eur=100, margen_destino_eur=-10),
        ])
        for product_id in range(3, 12):
            self.db.add(Producto(id=product_id, empresa_id=1, sku=f"P{product_id}", nombre=f"P{product_id}", costo_unitario=5, precio_venta=10, familia="F"))
            self.db.add(VentaHistorica(producto_id=product_id, fecha_venta=date(2026, 9, 1), cantidad_vendida=1, precio_unitario=10, ingreso_total=10, margen_bruto_eur=1, margen_destino_eur=1))
        self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_percentages_are_weighted_and_not_line_averages(self):
        result = overview(self.db, 1, "custom", date(2026, 9, 1), date(2026, 9, 1))
        self.assertAlmostEqual(result["actual"]["mg_pct"], 10.0)
        self.assertNotEqual(result["actual"]["mg_pct"], 7.5)
        self.assertAlmostEqual(result["actual"]["mgd_pct"], 4 / 1190 * 100)

    def test_concentration_keeps_negative_effect_and_unclamped_top_weight(self):
        result = concentration(self.db, 1, "mgd", "custom", date(2026, 9, 1), date(2026, 9, 1))
        self.assertGreater(result["top10_total_pct"], 100)
        self.assertAlmostEqual(result["top10_positivos_pct"], 100.0)

    def test_detail_uses_dash_equivalent_none_for_non_positive_sales(self):
        self.db.add(VentaHistorica(producto_id=1, fecha_venta=date(2026, 9, 2), cantidad_vendida=-1, precio_unitario=-100, ingreso_total=-100, margen_bruto_eur=-10, margen_destino_eur=-5))
        self.db.commit()
        result = margin_detail(self.db, 1, "sku", "mg", "custom", 1, 50, "entidad", "asc", start=date(2026, 9, 2), end=date(2026, 9, 2))
        self.assertIsNone(result["filas"][0]["mg_pct"])

    def test_fiscal_year_to_date_starts_on_may_first(self):
        current_start, current_end, previous_start, previous_end = resolve_period(self.db, 1, "fytd")

        self.assertEqual((current_start, current_end), (date(2026, 5, 1), date(2026, 9, 1)))
        self.assertEqual((previous_start, previous_end), (date(2025, 12, 28), date(2026, 4, 30)))


if __name__ == "__main__":
    unittest.main()
