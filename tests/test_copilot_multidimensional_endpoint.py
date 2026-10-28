"""Prueba del endpoint real sin conexiones ni datos de producción."""
import os
import base64
import csv
import io
import json
import re
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# El router importa la configuración global de BD al cargar. No leer .env ni
# conectarse a la BD del usuario en esta prueba aislada.
with patch.dict(os.environ, {"DATABASE_URL": "", "DATABASE_RO_URL": "", "SUPABASE_PROJECT_URL": "", "SUPABASE_ISSUER": ""}), patch("dotenv.load_dotenv"):
    from app import database, models
    from app.api.deps import get_current_user
    from app.core.rate_limit import limiter
    from app.routers.copilot import router
    from app.routers.data_import import router as import_router, DATASET_CONFIG
    from app.api.deps import get_current_active_admin


class CopilotMultidimensionalEndpointTests(unittest.TestCase):
    def test_endpoint_retorna_y_persiste_todos_los_bloques(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        with factory() as session:
            session.add_all([
                models.Empresa(id=7, nombre="Empresa de prueba"),
                models.Usuario(id=1, empresa_id=7, email="test@example.invalid", supabase_uid="test", nombre="Test"),
                models.Cliente(id=1, empresa_id=7, cliente_pk="C1", nombre="Cliente prueba"),
                models.Producto(id=1, empresa_id=7, sku="S1", nombre="Producto prueba", costo_unitario=1, precio_venta=2, familia="Familia", seccion="Sección prueba"),
                models.VentaHistorica(producto_id=1, cliente_id=1, fecha_venta=date(2026, 5, 10), cantidad_vendida=2, precio_unitario=20, ingreso_total=40, margen_bruto_eur=8, margen_destino_eur=6),
            ])
            session.commit()

        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(router, prefix="/api/v1")

        def db_override():
            with factory() as session:
                yield session

        app.dependency_overrides[database.get_db] = db_override
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, empresa_id=7)
        with patch.object(database, "SessionLocalRO", factory), patch("app.copilot_context.construir_resumen_operativo", return_value=""):
            with TestClient(app) as client:
                response = client.post("/api/v1/copilot/chat", json={"history": [{"role": "user", "content": "Dame un resumen de ventas desde 01/05/2026 hasta 31/05/2026 con clientes, secciones y top 10 productos"}]})
        self.assertEqual(response.status_code, 200, response.text)
        reply = response.json()["reply"]
        for expected in ("### Total", "### Clientes", "Cliente prueba", "### Secciones", "Sección prueba", "### Productos", "Producto prueba"):
            self.assertIn(expected, reply)
        self.assertRegex(reply, r"\| --- \| ---: \| ---: \| ---: \| ---: \|\n\| S1 · Producto prueba")
        marker = re.search(r"<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->", reply)
        payload = json.loads(base64.b64decode(marker.group(1)))
        self.assertEqual(payload["data"]["ventas_eur"], 40)
        self.assertEqual(payload["data"]["clientes_activos"], 1)
        self.assertIsNone(payload["data"]["variacion_ventas_pct"])
        with factory() as session:
            self.assertEqual(session.query(models.CopilotMessage).count(), 2)
            self.assertEqual(session.get(models.CopilotMessage, response.json()["message_id"]).contenido, reply)
        engine.dispose()

    def test_carga_web_recalcula_agregados_aunque_abc_este_diferido(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        with engine.begin() as db:
            db.execute(text("CREATE TABLE shared_sales_state (empresa_id INTEGER PRIMARY KEY, source_revision INTEGER NOT NULL DEFAULT 0, built_revision INTEGER NOT NULL DEFAULT 0, initialized BOOLEAN NOT NULL DEFAULT 0, calculated_at DATETIME, coverage_start DATE, coverage_end DATE)"))
            db.execute(text("CREATE TABLE shared_sales_dirty (empresa_id INTEGER NOT NULL, fecha_venta DATE NOT NULL, PRIMARY KEY (empresa_id, fecha_venta))"))
            db.execute(text("CREATE TABLE shared_sales_daily (empresa_id INTEGER, fecha_venta DATE, producto_id INTEGER, cliente_key INTEGER, ingreso_total NUMERIC, cantidad_vendida NUMERIC, margen_bruto_eur NUMERIC, margen_destino_eur NUMERIC, PRIMARY KEY (empresa_id, fecha_venta, producto_id, cliente_key))"))
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        with factory() as session:
            session.add_all([models.Empresa(id=7, nombre="Empresa de prueba"), models.Usuario(id=1, empresa_id=7, email="admin@example.invalid", supabase_uid="admin", nombre="Admin", rol="admin")])
            session.commit()
        app = FastAPI()
        app.state.limiter = limiter
        app.include_router(import_router, prefix="/api/v1")
        def db_override():
            with factory() as session:
                yield session
        app.dependency_overrides[database.get_db] = db_override
        app.dependency_overrides[get_current_active_admin] = lambda: SimpleNamespace(id=1, empresa_id=7, rol="admin")
        def archivo(importe):
            salida = io.StringIO()
            writer = csv.writer(salida)
            writer.writerow(DATASET_CONFIG["sales"]["headers"])
            fila = list(DATASET_CONFIG["sales"]["sample"])
            fila[1] = importe
            writer.writerow(fila)
            return salida.getvalue().encode("utf-8")
        with TestClient(app) as client:
            for importe in ("100.50", "150.50"):
                response = client.post("/api/v1/data-import/load", data={"dataset": "sales", "sales_mode": "upsert_keys", "refresh_metrics": "false"}, files={"file": ("ventas.csv", archivo(importe), "text/csv")})
                self.assertEqual(response.status_code, 200, response.text)
            with patch("app.shared_sales_materialized.recalcular_ventas_compartidas", side_effect=RuntimeError("fallo simulado")):
                response = client.post("/api/v1/data-import/load", data={"dataset": "sales", "sales_mode": "upsert_keys", "refresh_metrics": "false"}, files={"file": ("ventas.csv", archivo("200.50"), "text/csv")})
            self.assertEqual(response.status_code, 500)
        with factory() as session:
            self.assertAlmostEqual(session.execute(text("SELECT SUM(ingreso_total) FROM shared_sales_daily WHERE empresa_id=7")).scalar(), 150.50)
            self.assertAlmostEqual(session.execute(text("SELECT SUM(ingreso_total) FROM ventas_historicas")).scalar(), 150.50)
            revision = session.execute(text("SELECT source_revision, built_revision FROM shared_sales_state WHERE empresa_id=7")).one()
            self.assertEqual(tuple(revision), (2, 2))
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
