import unittest
from datetime import date

from sqlalchemy import create_engine, text

from app.analitica_ventas import (
    crear_plan_analitico_ventas,
    crear_acciones_seguimiento,
    rango_clasificacion_abc,
    renderizar_respuesta_analitica,
    respuesta_analitica_cumple_contrato,
)
from app.copilot_orchestrator import IntentoSemantico, analizar_intencion, crear_consulta_semantica


class AnaliticaVentasTests(unittest.TestCase):
    def test_rango_abc_contiene_noventa_dias(self):
        inicio, fin = rango_clasificacion_abc(date(2026, 7, 24))

        self.assertEqual(inicio, date(2026, 4, 26))
        self.assertEqual(fin, date(2026, 7, 24))

    def test_intencion_comercial_abc_prepara_parametros_dinamicos(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "Dame las ventas de los productos clase A en los últimos 30 días"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.parametros["abc"], "A")
        self.assertIn("fecha_abc_inicio", intento.parametros)
        self.assertIn("fecha_abc_fin", intento.parametros)

    def test_pregunta_gerencial_activa_comparativa_mensual(self):
        intento, aclaracion = analizar_intencion([
            {"role": "user", "content": "¿Cómo va la empresa?"},
        ])

        self.assertIsNone(aclaracion)
        self.assertIsNotNone(intento)
        self.assertEqual(intento.tipo, "ventas")
        self.assertEqual(intento.periodo, "mes_actual")
        self.assertTrue(intento.comparacion)

    def test_respaldo_analitico_cumple_contrato_y_cita_evidencias(self):
        dossier = {
            "periodo_actual": {"inicio": "2026-07-01", "fin": "2026-07-24"},
            "periodo_anterior": {"inicio": "2026-06-07", "fin": "2026-06-30"},
            "resultados": {
                "resumen": [{
                    "ventas_periodo_actual": 947600,
                    "ventas_periodo_anterior": 1000000,
                    "ventas_variacion_absoluta": -52400,
                    "ventas_variacion_pct": -5.24,
                    "margen_variacion_absoluta": -8200,
                }],
                "impulsores_familia": [{
                    "agrupacion": "Portátiles",
                    "ventas_variacion_absoluta": -38900,
                    "ventas_variacion_pct": -40,
                }],
                "top_caidas_sku": [{
                    "sku": "POR-100",
                    "nombre": "Portátil Pro",
                    "familia": "Portátiles",
                    "abc": "A",
                    "ventas_periodo_actual": 12000,
                    "ventas_periodo_anterior": 25000,
                    "ventas_variacion_absoluta": -13000,
                }],
                "abc_ventas": [{
                    "abc": "A",
                    "productos": 12,
                    "ventas_periodo_actual": 700000,
                    "ventas_variacion_absoluta": -42000,
                }],
            },
        }

        respuesta = renderizar_respuesta_analitica(dossier)

        self.assertTrue(respuesta_analitica_cumple_contrato(respuesta))
        self.assertIn("-€52.400,00", respuesta)
        self.assertIn("Portátiles", respuesta)
        self.assertIn("POR-100", respuesta)
        self.assertNotIn("potenciar ventas", respuesta.casefold())

        acciones = crear_acciones_seguimiento(dossier)
        self.assertEqual(len(acciones), 4)
        self.assertIn("Portátiles", acciones[0]["label"])
        self.assertIn("POR-100", acciones[1]["prompt"])
        self.assertIn("clase A", acciones[2]["prompt"])

    def test_filtro_abc_usa_ventas_reales_sin_producto_metricas(self):
        motor = create_engine("sqlite://")
        with motor.begin() as conexion:
            conexion.execute(text("""
                CREATE TABLE productos (
                    id INTEGER PRIMARY KEY,
                    empresa_id INTEGER NOT NULL,
                    nombre TEXT,
                    familia TEXT,
                    marca TEXT,
                    familia_marca TEXT,
                    seccion TEXT,
                    product_manager TEXT,
                    sku TEXT
                )
            """))
            conexion.execute(text("""
                CREATE TABLE ventas_historicas (
                    producto_id INTEGER NOT NULL,
                    fecha_venta DATE NOT NULL,
                    ingreso_total FLOAT NOT NULL,
                    cantidad_vendida INTEGER NOT NULL,
                    margen_bruto_eur FLOAT NOT NULL,
                    margen_destino_eur FLOAT NOT NULL
                )
            """))
            conexion.execute(text("""
                INSERT INTO productos (id, empresa_id, sku) VALUES
                    (1, 7, 'A-100'), (2, 7, 'B-100'), (3, 7, 'C-100'), (4, 8, 'OTRA')
            """))
            conexion.execute(text("""
                INSERT INTO ventas_historicas
                    (producto_id, fecha_venta, ingreso_total, cantidad_vendida, margen_bruto_eur, margen_destino_eur)
                VALUES
                    (1, '2026-07-24', 800, 1, 80, 70),
                    (2, '2026-07-24', 150, 1, 15, 12),
                    (3, '2026-07-24', 50, 1, 5, 4),
                    (4, '2026-07-24', 9000, 1, 900, 800)
            """))

            intento = IntentoSemantico(
                tipo="ventas",
                medida="ventas_eur",
                periodo="ultimos_30_dias",
                fecha_inicio=date(2026, 7, 1),
                fecha_fin=date(2026, 7, 24),
                parametros={
                    "fecha_inicio": date(2026, 7, 1),
                    "fecha_fin": date(2026, 7, 24),
                    "fecha_abc_inicio": date(2026, 4, 26),
                    "fecha_abc_fin": date(2026, 7, 24),
                    "abc": "A",
                },
            )
            consulta, parametros = crear_consulta_semantica(intento)
            filas = conexion.execute(text(consulta), {"empresa_id": 7, **parametros}).mappings().all()

        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]["ventas_eur"], 800)

        plan = crear_plan_analitico_ventas(intento)
        self.assertIsNotNone(plan)
        self.assertEqual(len(plan.consultas), 9)
        with motor.begin() as conexion:
            resultados = {
                consulta_analitica.nombre: conexion.execute(
                    text(consulta_analitica.sql),
                    {"empresa_id": 7, **consulta_analitica.parametros},
                ).mappings().all()
                for consulta_analitica in plan.consultas
            }
        self.assertIn("ventas_periodo_actual", resultados["resumen"][0])
        self.assertEqual(resultados["resumen"][0]["ventas_periodo_actual"], 1000)
        self.assertEqual(len(resultados["top_caidas_sku"]), 3)


if __name__ == "__main__":
    unittest.main()
