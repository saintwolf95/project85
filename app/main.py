from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import uvicorn
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address)

# Cargar variables de entorno (ej: OPENAI_API_KEY)
load_dotenv()

from . import models, seed_data
from .database import engine, get_db
from .routers import analytics, copilot, inventory

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializa las tablas al iniciar la aplicación
    models.Base.metadata.create_all(bind=engine)
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
    allow_origin_regex=r"https://.*\.vercel\.app",
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

@app.post("/api/v1/seed", status_code=status.HTTP_201_CREATED)
@limiter.limit("1/minute")
def seed_database(request: Request, db: Session = Depends(get_db)):
    """
    Endpoint para inicializar datos de demostración.
    Simula empresas, productos, inventario y ventas históricas.
    """
    try:
        # Validar si ya existen empresas para no duplicar en múltiples llamadas
        empresa_existente = db.query(models.Empresa).first()
        if empresa_existente:
            return {"message": "La base de datos ya contiene datos (Empresa encontrada)."}

        seed_data.crear_datos_demo(db)
        return {"message": "Datos de demostración generados exitosamente"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generando datos: {str(e)}"
        )

@app.get("/api/v1/empresas")
def get_empresas(db: Session = Depends(get_db)):
    """
    Endpoint de prueba para verificar que se cargaron las empresas.
    """
    empresas = db.query(models.Empresa).all()
    return {"empresas": empresas}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True) # nosec B104
