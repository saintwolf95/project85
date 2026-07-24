from fastapi import FastAPI, Depends, HTTPException, status, Request
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from .api.deps import get_current_active_admin
from .core.security import IS_PRODUCTION
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import os
import logging
import uvicorn
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from .core.rate_limit import limiter

# Cargar variables de entorno (ej: OPENAI_API_KEY)
load_dotenv()

from . import models, seed_data
from .database import engine, engine_ro, get_db, SessionLocal, IS_POSTGRES
from .routers import analytics, copilot, data_import, inventory, settings, agents, libreria

logger = logging.getLogger(__name__)
ALLOW_SCHEMA_INIT = os.getenv("ALLOW_SCHEMA_INIT", "false" if IS_PRODUCTION else "true").strip().lower() in {"1", "true", "yes"}

@asynccontextmanager
async def lifespan(app: FastAPI):
    if IS_PRODUCTION and not ALLOW_SCHEMA_INIT:
        logger.info("[STARTUP] Produccion: se omiten create_all, auto-seed, migraciones manuales y sincronizacion de arranque.")
        yield
        return

    # Inicializa las tablas al iniciar la aplicación
    models.Base.metadata.create_all(bind=engine)
    
    # Auto-seed: si la base de datos está vacía, inyectar datos de demo
    db = SessionLocal()
    try:
        user_count = db.query(models.Usuario).count()
        print(f"[STARTUP] Usuarios en BD: {user_count}", flush=True)
        if user_count == 0:
            print("[STARTUP] BD vacía detectada. Ejecutando seed automático...", flush=True)
            seed_data.crear_datos_demo(db)
            print("[STARTUP] Seed completado exitosamente.", flush=True)
        else:
            correct_uid = os.getenv("ADMIN_SUPABASE_UID")
            admin = db.query(models.Usuario).filter(models.Usuario.email == "admin@demo.com").first()
            if admin and correct_uid and admin.supabase_uid != correct_uid:
                print("[STARTUP] Reparando UID admin configurado.", flush=True)
                admin.supabase_uid = correct_uid
                db.commit()
            print("[STARTUP] BD ya tiene datos.", flush=True)
            
        # Migración manual: Asegurar que exista la columna contexto_negocio (por si no se creó de cero)
        from sqlalchemy import text
        try:
            db.execute(text("SELECT contexto_negocio FROM empresas LIMIT 1"))
        except Exception:
            db.rollback()
            try:
                db.execute(text("ALTER TABLE empresas ADD COLUMN contexto_negocio VARCHAR"))
                db.commit()
                print("[STARTUP] Migración: Columna contexto_negocio añadida a empresas.", flush=True)
            except Exception as e:
                db.rollback()
                print(f"[STARTUP] Error añadiendo columna contexto_negocio: {e}", flush=True)
        # Migración manual: Añadir columnas markdown a agent_insights
        try:
            db.execute(text("SELECT fase1_maria_md FROM agent_insights LIMIT 1"))
        except Exception:
            db.rollback()
            try:
                db.execute(text("ALTER TABLE agent_insights ADD COLUMN fase1_maria_md VARCHAR"))
                db.execute(text("ALTER TABLE agent_insights ADD COLUMN fase1_lucia_md VARCHAR"))
                db.execute(text("ALTER TABLE agent_insights ADD COLUMN fase1_mattia_md VARCHAR"))
                db.commit()
                print("[STARTUP] Migración: Columnas MD añadidas a agent_insights.", flush=True)
            except Exception as e:
                db.rollback()
                print(f"[STARTUP] Error añadiendo columnas MD a agent_insights: {e}", flush=True)

        # Sincronizar métricas ABC/XYZ para el Copilot
        from .services import sync_metrics_to_db
        print("[STARTUP] Sincronizando métricas ABC/XYZ (Data Mart)...", flush=True)
        # Sincronizar cada empresa de forma independiente.
        empresas = db.query(models.Empresa).all()
        for empresa in empresas:
            sync_metrics_to_db(db, empresa.id)
        print(f"[STARTUP] Sincronización completada para {len(empresas)} empresa(s).", flush=True)
            
    except Exception as e:
        print(f"[STARTUP] Error durante auto-seed: {e}", flush=True)
    finally:
        db.close()
    
    yield
    # No eliminamos las tablas al cerrar para persistir durante la vida de la app

app = FastAPI(
    title="API de Supply Chain",
    description="Backend Multi-Tenant con FastAPI y SQLite in-memory",
    version="1.5.0",
    lifespan=lifespan
)

@app.get("/health")
@limiter.limit("30/minute")
def health_check(request: Request):
    """Health check sin credenciales ni detalles internos de conexión."""
    from sqlalchemy import text

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        with engine_ro.connect() as connection_ro:
            connection_ro.execute(text("SELECT 1"))
            if IS_POSTGRES:
                transaction_setting = connection_ro.execute(text("SHOW transaction_read_only")).scalar()
                has_write_privileges = connection_ro.execute(text(
                    """
                    SELECT has_schema_privilege(current_user, 'public', 'CREATE')
                       OR EXISTS (
                           SELECT 1
                           FROM pg_class c
                           JOIN pg_namespace n ON n.oid = c.relnamespace
                           WHERE n.nspname = 'public'
                             AND c.relkind IN ('r', 'p')
                             AND (
                                 has_table_privilege(current_user, c.oid, 'INSERT')
                                 OR has_table_privilege(current_user, c.oid, 'UPDATE')
                                 OR has_table_privilege(current_user, c.oid, 'DELETE')
                                 OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
                             )
                       )
                    """
                )).scalar()
                read_only_confirmed = (
                    str(transaction_setting).lower() in ("on", "true", "1")
                    or not bool(has_write_privileges)
                )
            else:
                read_only_confirmed = True
        if not read_only_confirmed:
            logger.error("[HEALTH] RO connection has write privileges.")
            raise RuntimeError("La conexión RO no está en modo read-only")
        return {
            "status": "ok",
            "database": "postgresql" if IS_POSTGRES else "sqlite",
            "copilot_read_only": True,
        }
    except Exception:
        logger.exception("[HEALTH] Database readiness check failed")
        raise HTTPException(status_code=503, detail="Servicio temporalmente no disponible")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

DEFAULT_CORS_ORIGINS = (
    ["https://fivemin-xi.vercel.app"]
    if IS_PRODUCTION
    else [
        "http://localhost:3000",
        "http://localhost:4000",
        "http://localhost:5173",
        "https://fivemin-xi.vercel.app",
    ]
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(analytics.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(libreria.router, prefix="/api/v1/libreria")
app.include_router(data_import.router, prefix="/api/v1")

@app.post("/api/v1/seed", status_code=status.HTTP_201_CREATED)
@limiter.limit("1/minute")
def seed_database(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_admin)
):
    """Rellena la base de datos con datos de demostración si está vacía."""
    from . import seed_data
    try:
        if db.query(models.Producto).count() > 0:
            return {"message": "La base de datos ya contiene datos. Usa otro endpoint para limpiar si es necesario."}
        
        seed_data.crear_datos_demo(db)
        return {"message": "Datos de demostración generados con éxito."}
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno durante la generación de datos.")

@app.get("/api/v1/empresas", response_model=List[dict])
def get_empresas(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_active_admin)
):
    empresas = db.query(models.Empresa).all()
    return [{"id": e.id, "nombre": e.nombre} for e in empresas]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080) # nosec B104
