"""Conciliación del motor compartido con hechos diarios de prueba."""
import unittest
from datetime import date
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.shared_sales import comparar_ventas_por_dimension, comprobar_extremos_periodos
from app.copilot_service import process_copilot_chat, extract_signed_report_artifact
from app.shared_sales_materialized import estado_ventas_compartidas, marcar_fechas, recalcular_ventas_compartidas


class SharedSalesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as db:
            db.execute(text("CREATE TABLE productos (id INTEGER PRIMARY KEY, empresa_id INTEGER, sku TEXT, nombre TEXT, familia TEXT, marca TEXT, familia_marca TEXT, seccion TEXT, product_manager TEXT)"))
            db.execute(text("CREATE TABLE clientes (id INTEGER PRIMARY KEY, empresa_id INTEGER, cliente_pk TEXT, nombre TEXT)"))
            db.execute(text("CREATE TABLE ventas_historicas (producto_id INTEGER, cliente_id INTEGER, fecha_venta DATE, ingreso_total NUMERIC, cantidad_vendida NUMERIC)"))
            db.execute(text("INSERT INTO productos VALUES (1, 7, 'A', 'Caída', 'F', 'Marca', 'F-Marca', 'S1', 'PM'), (2, 7, 'B', 'Subida', 'F', 'Marca', 'F-Marca', 'S2', 'PM'), (3, 7, 'C', 'Nuevo', 'F', 'Otra', 'F-Otra', 'S3', 'PM'), (4, 8, 'X', 'Otra empresa', 'F', 'Marca', 'F-Marca', 'S1', 'PM')"))
            db.execute(text("INSERT INTO clientes VALUES (1, 7, 'C1', 'Cliente uno'), (2, 7, 'C2', 'Cliente dos'), (3, 8, 'C3', 'Ajeno')"))
            db.execute(text("INSERT INTO ventas_historicas VALUES (1, 1, '2025-05-01', 100, 2), (2, 2, '2025-05-10', 20, 1), (1, 1, '2026-05-01', 50, 1), (2, 2, '2026-05-10', 70, 2), (3, 2, '2026-05-10', 20, 1), (4, 3, '2026-05-10', 9999, 1)"))
        self.actual = (date(2026, 5, 1), date(2026, 5, 10))
        self.anterior = (date(2025, 5, 1), date(2025, 5, 10))

    def tearDown(self):
        self.engine.dispose()

    def test_signos_impacto_base_cero_filtros_y_aislamiento(self):
        with Session(self.engine) as db:
            self.assertTrue(comprobar_extremos_periodos(db, 7, self.actual, self.anterior))
            caidas = comparar_ventas_por_dimension(db, 7, self.actual, self.anterior, "sku", direccion="caidas", limite=10)
            subidas = comparar_ventas_por_dimension(db, 7, self.actual, self.anterior, "sku", direccion="subidas", limite=10)
            filtradas = comparar_ventas_por_dimension(db, 7, self.actual, self.anterior, "seccion", {"marca": "Marca"})
        self.assertEqual([(x["codigo"], x["variacion_eur"]) for x in caidas], [("A", -50)])
        self.assertEqual([(x["codigo"], x["variacion_eur"]) for x in subidas], [("B", 50), ("C", 20)])
        self.assertIsNone(subidas[1]["variacion_pct"])
        self.assertEqual({x["entidad"] for x in filtradas}, {"S1", "S2"})

    def test_correccion_historica_se_refleja_en_la_siguiente_consulta(self):
        with self.engine.begin() as db:
            db.execute(text("UPDATE ventas_historicas SET ingreso_total=150 WHERE producto_id=1 AND fecha_venta='2025-05-01'"))
        with Session(self.engine) as db:
            caidas = comparar_ventas_por_dimension(db, 7, self.actual, self.anterior, "sku", direccion="caidas")
        self.assertEqual(caidas[0]["variacion_eur"], -100)

    def test_copilot_entrega_todas_las_dimensiones_y_signos(self):
        pregunta = "Ventas desde 01/05/2026 hasta 10/05/2026: caídas y subidas por clientes, secciones y productos respecto al año anterior"
        with Session(self.engine) as db, patch("app.copilot_context.construir_resumen_operativo", return_value=""):
            respuesta = process_copilot_chat(db, [{"role": "user", "content": pregunta}], 7)
        informe = extract_signed_report_artifact(respuesta)
        self.assertIsNotNone(informe, respuesta)
        for dimension in ("cliente", "seccion", "sku"):
            for direccion in ("caidas", "subidas"):
                self.assertIn(f"{direccion}_{dimension}", informe["resultados"])
        self.assertNotIn("Otra empresa", respuesta)
        self.assertIn("base no positiva", respuesta)

    def test_copilot_no_mezcla_revisiones_durante_una_consulta(self):
        pregunta = "Ventas desde 01/05/2026 hasta 10/05/2026: caídas y subidas por clientes y productos respecto al año anterior"
        with Session(self.engine) as db, patch("app.copilot_context.construir_resumen_operativo", return_value=""), patch("app.shared_sales.revision_ventas", side_effect=[1, 2]):
            respuesta = process_copilot_chat(db, [{"role": "user", "content": pregunta}], 7)
        self.assertIn("datos de ventas cambiaron", respuesta)
        self.assertIsNone(extract_signed_report_artifact(respuesta))


class MaterializacionVentasTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as db:
            db.execute(text("CREATE TABLE productos (id INTEGER PRIMARY KEY, empresa_id INTEGER, sku TEXT, nombre TEXT, familia TEXT, marca TEXT, familia_marca TEXT, seccion TEXT, product_manager TEXT)"))
            db.execute(text("CREATE TABLE ventas_historicas (producto_id INTEGER, cliente_id INTEGER, fecha_venta DATE, ingreso_total NUMERIC, cantidad_vendida NUMERIC, margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC)"))
            db.execute(text("CREATE TABLE shared_sales_state (empresa_id INTEGER PRIMARY KEY, source_revision INTEGER NOT NULL DEFAULT 0, built_revision INTEGER NOT NULL DEFAULT 0, initialized BOOLEAN NOT NULL DEFAULT 0, calculated_at DATETIME, coverage_start DATE, coverage_end DATE)"))
            db.execute(text("CREATE TABLE shared_sales_dirty (empresa_id INTEGER NOT NULL, fecha_venta DATE NOT NULL, PRIMARY KEY (empresa_id, fecha_venta))"))
            db.execute(text("CREATE TABLE shared_sales_daily (empresa_id INTEGER, fecha_venta DATE, producto_id INTEGER, cliente_key INTEGER, ingreso_total NUMERIC, cantidad_vendida NUMERIC, margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC, PRIMARY KEY (empresa_id, fecha_venta, producto_id, cliente_key))"))
            db.execute(text("""CREATE VIEW shared_sales_effective AS
                SELECT d.empresa_id,d.fecha_venta,d.producto_id,NULLIF(d.cliente_key,0) cliente_id,d.ingreso_total,d.cantidad_vendida,d.margen_bruto_eur,d.margen_destino_eur
                FROM shared_sales_daily d JOIN shared_sales_state s ON s.empresa_id=d.empresa_id
                WHERE s.initialized AND s.source_revision=s.built_revision AND NOT EXISTS (SELECT 1 FROM shared_sales_dirty x WHERE x.empresa_id=d.empresa_id)
                UNION ALL
                SELECT p.empresa_id,v.fecha_venta,v.producto_id,v.cliente_id,v.ingreso_total,v.cantidad_vendida,v.margen_bruto_eur,v.margen_destino_eur
                FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
                WHERE NOT EXISTS (SELECT 1 FROM shared_sales_state s WHERE s.empresa_id=p.empresa_id AND s.initialized AND s.source_revision=s.built_revision AND NOT EXISTS (SELECT 1 FROM shared_sales_dirty x WHERE x.empresa_id=s.empresa_id))"""))
            db.execute(text("INSERT INTO productos VALUES (1, 7, 'A', 'Producto', 'F', 'M', 'F-M', 'S', 'PM'), (2, 8, 'B', 'Ajeno', 'F', 'M', 'F-M', 'S', 'PM')"))
            db.execute(text("INSERT INTO ventas_historicas VALUES (1, NULL, '2025-05-01', 100, 2, 10, 8), (1, NULL, '2026-05-01', 60, 1, 6, 5), (1, NULL, '2026-05-01', 10, 1, 1, 1), (2, NULL, '2026-05-01', 999, 1, 1, 1)"))

    def tearDown(self):
        self.engine.dispose()

    def test_publicacion_incremental_y_fallback_mientras_hay_cambios(self):
        actual, anterior = (date(2026, 5, 1), date(2026, 5, 1)), (date(2025, 5, 1), date(2025, 5, 1))
        with Session(self.engine) as db:
            marcar_fechas(db, 7, *actual)
            self.assertTrue(recalcular_ventas_compartidas(db, 7))
            db.commit()
            self.assertEqual(estado_ventas_compartidas(db, 7)["estado"], "actualizada")
            self.assertEqual(db.execute(text("SELECT COUNT(*) FROM shared_sales_daily WHERE empresa_id=7")).scalar(), 2)
            self.assertEqual(comparar_ventas_por_dimension(db, 7, actual, anterior, "sku")[0]["variacion_eur"], -30)
            db.execute(text("UPDATE ventas_historicas SET ingreso_total=80 WHERE producto_id=1 AND fecha_venta='2025-05-01'"))
            marcar_fechas(db, 7, *anterior)
            self.assertEqual(estado_ventas_compartidas(db, 7)["estado"], "pendiente")
            # Antes de recalcular, la vista lee la fuente, no el agregado viejo.
            self.assertEqual(comparar_ventas_por_dimension(db, 7, actual, anterior, "sku")[0]["variacion_eur"], -10)
            recalcular_ventas_compartidas(db, 7)
            db.commit()
            self.assertEqual(comparar_ventas_por_dimension(db, 7, actual, anterior, "sku")[0]["variacion_eur"], -10)
            estado = db.execute(text("SELECT source_revision,built_revision,coverage_start,coverage_end FROM shared_sales_state WHERE empresa_id=7")).one()
            self.assertEqual(estado[0], estado[1])
            self.assertEqual(tuple(map(str, estado[2:])), ("2025-05-01", "2026-05-01"))
            self.assertEqual(db.execute(text("SELECT COUNT(*) FROM shared_sales_dirty WHERE empresa_id=7")).scalar(), 0)

    def test_rollback_no_publica_revision_parcial(self):
        with Session(self.engine) as db:
            marcar_fechas(db, 7, date(2026, 5, 1), date(2026, 5, 1))
            recalcular_ventas_compartidas(db, 7)
            db.commit()
            db.execute(text("UPDATE ventas_historicas SET ingreso_total=999 WHERE producto_id=1 AND fecha_venta='2026-05-01'"))
            marcar_fechas(db, 7, date(2026, 5, 1), date(2026, 5, 1))
            recalcular_ventas_compartidas(db, 7)
            db.rollback()
            total = db.execute(text("SELECT SUM(ingreso_total) FROM shared_sales_effective WHERE empresa_id=7 AND fecha_venta='2026-05-01'" )).scalar()
            self.assertEqual(total, 70)


if __name__ == "__main__":
    unittest.main()
