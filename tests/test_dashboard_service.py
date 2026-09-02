import unittest
from datetime import date

from sqlalchemy import create_engine, text

from app.dashboard_service import _breakdown, _month_starts, _pct, _shift_year, comparison_window


class FakeMappingsResult:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class FakeDashboardSession:
    def __init__(self, rows):
        self.rows = rows
        self.statement = ""

    def execute(self, statement, _params):
        self.statement = str(statement)
        return FakeMappingsResult(self.rows)


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

    def test_comparativa_interanual_conserva_dia_y_resuelve_bisiesto(self):
        self.assertEqual(_shift_year(date(2026, 8, 24)), date(2025, 8, 24))
        self.assertEqual(_shift_year(date(2024, 2, 29)), date(2023, 2, 28))

    def test_serie_mensual_incluye_todos_los_meses_del_rango(self):
        self.assertEqual(
            _month_starts(date(2026, 5, 5), date(2026, 8, 24)),
            [date(2026, 5, 1), date(2026, 6, 1), date(2026, 7, 1), date(2026, 8, 1)],
        )


class DashboardBreakdownTests(unittest.TestCase):
    @staticmethod
    def _row(entity_id, sales, previous):
        return {
            "entidad_id": entity_id,
            "entidad": f"Entidad {entity_id}",
            "ventas_eur": sales,
            "ventas_anterior_eur": previous,
            "unidades": 1,
            "margen_eur": 1,
            "mgd_eur": 1,
            "skus": 1,
        }

    def test_lideres_se_calculan_sobre_el_universo_antes_de_limitar_la_tabla(self):
        rows = [self._row("lider", 10000, 10000)]
        rows.extend(self._row(f"crecimiento-{index}", index, 0) for index in range(1, 102))
        session = FakeDashboardSession(rows)

        result = _breakdown(
            session, 1,
            (date(2026, 5, 1), date(2025, 5, 1)),
            (date(2026, 8, 24), date(2025, 8, 24)),
            {"familia": None, "marca": None, "familia_marca": None, "seccion": None},
            "familia", 20000,
        )

        self.assertEqual(result["resumen"]["mayor_facturacion"]["entidad_id"], "lider")
        self.assertEqual(result["resumen"]["mayor_crecimiento"]["variacion_eur"], 101)
        self.assertIsNone(result["resumen"]["mayor_caida"])
        self.assertEqual(len(result["filas"]), 100)
        self.assertNotIn("lider", {row["entidad_id"] for row in result["filas"]})

    def test_desglose_de_cliente_agrupa_por_cliente_pk(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE productos (
                    id INTEGER PRIMARY KEY, empresa_id INTEGER, familia TEXT, marca TEXT,
                    familia_marca TEXT, seccion TEXT
                );
            """))
            connection.execute(text("""
                CREATE TABLE clientes (id INTEGER PRIMARY KEY, cliente_pk TEXT, nombre TEXT);
            """))
            connection.execute(text("""
                CREATE TABLE ventas_historicas (
                    producto_id INTEGER, cliente_id INTEGER, fecha_venta DATE,
                    ingreso_total NUMERIC, cantidad_vendida INTEGER,
                    margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC,
                    comercial_factura TEXT
                );
            """))
            connection.execute(text("INSERT INTO productos VALUES (1, 1, 'F', 'M', 'F-M', 'S')"))
            connection.execute(text("""
                INSERT INTO clientes VALUES (1, 'CLI-1', 'Cliente homónimo'),
                                             (2, 'CLI-2', 'Cliente homónimo')
            """))
            connection.execute(text("""
                INSERT INTO ventas_historicas VALUES
                    (1, 1, '2026-06-01', 100, 1, 10, 8, 'C-1'),
                    (1, 2, '2026-06-01', 200, 1, 20, 16, 'C-1')
            """))

            result = _breakdown(
                connection, 1,
                (date(2026, 5, 1), date(2025, 5, 1)),
                (date(2026, 8, 24), date(2025, 8, 24)),
                {"familia": None, "marca": None, "familia_marca": None, "seccion": None},
                "cliente", 300,
            )

        self.assertEqual({row["entidad_id"] for row in result["filas"]}, {"CLI-1", "CLI-2"})
        self.assertEqual({row["entidad"] for row in result["filas"]}, {
            "CLI-1 · Cliente homónimo", "CLI-2 · Cliente homónimo",
        })

    def test_no_inventa_crecimiento_ni_caida_si_no_existe_el_signo(self):
        positive = FakeDashboardSession([self._row("positivo", 120, 100)])
        negative = FakeDashboardSession([self._row("negativo", 80, 100)])
        args = (
            1,
            (date(2026, 5, 1), date(2025, 5, 1)),
            (date(2026, 8, 24), date(2025, 8, 24)),
            {"familia": None, "marca": None, "familia_marca": None, "seccion": None},
            "familia", 100,
        )

        self.assertIsNone(_breakdown(positive, *args)["resumen"]["mayor_caida"])
        self.assertIsNone(_breakdown(negative, *args)["resumen"]["mayor_crecimiento"])


if __name__ == "__main__":
    unittest.main()
