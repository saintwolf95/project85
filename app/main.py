from fastapi import FastAPI, Depends, HTTPException, status, Request
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from .api.deps import get_current_active_admin
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
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
from .database import engine, get_db, SessionLocal
from .routers import analytics, copilot, inventory, settings

@asynccontextmanager
async def lifespan(app: FastAPI):
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
            # Reparar UIDs incorrectos
            import os
            correct_uid = os.getenv("ADMIN_SUPABASE_UID")
            admin = db.query(models.Usuario).filter(models.Usuario.email == "admin@demo.com").first()
            if admin and correct_uid and admin.supabase_uid != correct_uid:
                print(f"[STARTUP] Reparando UID admin: {admin.supabase_uid} -> {correct_uid}", flush=True)
                admin.supabase_uid = correct_uid
                db.commit()
            print(f"[STARTUP] BD ya tiene datos. Admin UID: {admin.supabase_uid if admin else 'N/A'}", flush=True)
            
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
        # Sincronizar métricas ABC/XYZ para el Copilot
        from .services import sync_metrics_to_db
        print("[STARTUP] Sincronizando métricas ABC/XYZ (Data Mart)...", flush=True)
        # Obtenemos la primera empresa (demo)
        empresa = db.query(models.Empresa).first()
        if empresa:
            sync_metrics_to_db(db, empresa.id)
            print("[STARTUP] Sincronización completada.", flush=True)
            
    except Exception as e:
        print(f"[STARTUP] Error durante auto-seed: {e}", flush=True)
    finally:
        db.close()
    
    yield
    # No eliminamos las tablas al cerrar para persistir durante la vida de la app

app = FastAPI(
    title="API de Supply Chain",
    description="Backend Multi-Tenant con FastAPI y SQLite in-memory",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000", "http://localhost:5173"],
    allow_origin_regex=r"https://fivemin(-[a-z0-9]+)?\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

app.include_router(analytics.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")

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
