import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.agent_metrics import build_agent_dossier, build_agent_followups, build_company_data_readiness


class AgentMetricsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        with self.engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE productos (
                    id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
                    sku TEXT, nombre TEXT, familia TEXT, costo_unitario FLOAT NOT NULL
                )
            """))
            connection.execute(text("""
                CREATE TABLE ventas_historicas (
                    id INTEGER PRIMARY KEY, producto_id INTEGER NOT NULL,
                    cliente_id INTEGER, fecha_venta DATE NOT NULL,
                    ingreso_total FLOAT NOT NULL, cantidad_vendida INTEGER NOT NULL,
                    margen_bruto_eur FLOAT NOT NULL, margen_destino_eur FLOAT NOT NULL,
                    kd TEXT, comercial_factura TEXT
                )
            """))
            connection.execute(text("""
                CREATE TABLE clientes (
                    id INTEGER PRIMARY KEY, cliente_pk TEXT, nombre TEXT, tipo_cliente TEXT
                )
            """))
            connection.execute(text("""
                CREATE TABLE inventario_snapshot (
                    producto_id INTEGER PRIMARY KEY, stock_disponible INTEGER NOT NULL
                )
            """))
            connection.execute(text("""
                CREATE TABLE producto_metricas (
                    producto_id INTEGER PRIMARY KEY, abc TEXT, xyz TEXT, dias_cobertura INTEGER
                )
            """))
            connection.execute(text("""
                INSERT INTO productos (id, empresa_id, sku, nombre, familia, costo_unitario) VALUES
                    (1, 7, 'MOV-1', 'Móvil', 'Móviles', 10),
                    (2, 7, 'AUD-1', 'Altavoz', 'Audio', 20),
                    (3, 8, 'OTR-1', 'Otro', 'Otra', 999)
            """))
            connection.execute(text("""
                INSERT INTO clientes (id, cliente_pk, nombre, tipo_cliente) VALUES
                    (10, 'C-10', 'Cliente 10', 'Retail'),
                    (11, 'C-11', 'Cliente 11', 'Distribuidor'),
                    (99, 'C-99', 'Otra empresa', 'Retail')
            """))
            connection.execute(text("""
                INSERT INTO inventario_snapshot (producto_id, stock_disponible) VALUES
                    (1, 5), (2, 3), (3, 100)
            """))
            connection.execute(text("""
                INSERT INTO producto_metricas (producto_id, abc, xyz, dias_cobertura) VALUES
                    (1, 'A', 'X', 8), (2, 'B', 'Y', 90), (3, 'A', 'X', 2)
            """))
            connection.execute(text("""
                INSERT INTO ventas_historicas
                    (id, producto_id, cliente_id, fecha_venta, ingreso_total,
                     cantidad_vendida, margen_bruto_eur, margen_destino_eur, kd, comercial_factura)
                VALUES
                    (1, 1, 10, '2026-07-31', 100, 2, 20, 15, 'SI', 'Ana'),
                    (2, 2, 11, '2026-07-20', 300, 3, 30, 21, '', 'Luis'),
                    (3, 1, 10, '2026-06-20', 200, 4, 10, 4, 'NO', 'Ana'),
                    (4, 3, 99, '2026-07-31', 9999, 1, 999, 999, 'SI', 'Otro')
            """))

    def test_readiness_esta_aislada_por_empresa(self):
        with Session(self.engine) as session:
            readiness = build_company_data_readiness(session, 7)

        self.assertEqual(readiness["registros_ventas"], 3)
        self.assertEqual(readiness["clientes_con_ventas"], 2)
        self.assertEqual(readiness["inventario_eur"], 110)
        self.assertFalse(readiness["compras_disponibles"])
        self.assertEqual(readiness["completitud_dimensiones_pct"], 100)

    def test_dossier_calcula_ratios_ponderados_y_periodos(self):
        with Session(self.engine) as session:
            dossier = build_agent_dossier(session, 7, "lucia")

        metrics = dossier["metricas"]
        self.assertEqual(metrics["ventas_30d"], 400)
        self.assertEqual(metrics["ventas_30d_anteriores"], 200)
        self.assertEqual(metrics["variacion_ventas_30d_pct"], 100)
        self.assertEqual(metrics["mg_pct_30d"], 12.5)
        self.assertEqual(metrics["mgd_pct_30d"], 9)
        self.assertEqual(metrics["peso_kd_30d_pct"], 25)
        self.assertEqual(metrics["clientes_activos_30d"], 2)
        self.assertEqual(metrics["familia_lider_30d"]["familia"], "Audio")
        self.assertEqual(metrics["variacion_ventas_30d_eur"], 200)
        self.assertAlmostEqual(metrics["variacion_ventas_7d_pct"], -66.666666, places=4)
        self.assertEqual(metrics["impulsores_familia"][0]["dimension"], "Audio")
        self.assertEqual(metrics["clientes_lideres"][0]["cliente"], "Cliente 11")
        self.assertTrue(any(signal["tipo"] == "momentum_30d" for signal in metrics["señales_priorizadas"]))

        followups = build_agent_followups(dossier, "lucia")
        self.assertEqual(len(followups), 3)
        self.assertIn("Audio", followups[0])


if __name__ == "__main__":
    unittest.main()
