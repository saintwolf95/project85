import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Determinar si usamos Postgres o SQLite
DATABASE_URL = os.getenv("DATABASE_URL")
DATABASE_RO_URL = os.getenv("DATABASE_RO_URL")

def normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "?pgbouncer=true" in url:
        url = url.replace("?pgbouncer=true", "")
        if url.endswith("&"):
            url = url[:-1]
        if url.endswith("?"):
            url = url[:-1]
    return url

if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
    DATABASE_URL = normalize_postgres_url(DATABASE_URL)
    if DATABASE_RO_URL:
        DATABASE_RO_URL = normalize_postgres_url(DATABASE_RO_URL)
            
    print(f"[DATABASE] Conectando a PostgreSQL (Supabase) host: {DATABASE_URL.split('@')[-1].split('/')[0]}", flush=True)
    if not DATABASE_RO_URL:
        raise RuntimeError("DATABASE_RO_URL es obligatoria en PostgreSQL para ejecutar consultas IA en modo solo lectura.")
    engine = create_engine(DATABASE_URL)
    engine_ro = create_engine(DATABASE_RO_URL)
else:
    # Fallback a SQLite local
    print("[DATABASE] ATENCIÓN: DATABASE_URL no encontrada. Usando fallback a SQLite (supplychain.db).", flush=True)
    print("[DATABASE] Si estás en Producción (Render), añade DATABASE_URL en las variables de entorno.", flush=True)
    SQLALCHEMY_DATABASE_URL = "sqlite:///./supplychain.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False}
    )
    # Read-Only Engine for SQL Copilot execution (solo válido en SQLite)
    engine_ro = create_engine(
        "sqlite:///file:supplychain.db?mode=ro&uri=true",
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionLocalRO = sessionmaker(autocommit=False, autoflush=False, bind=engine_ro)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_db_ro():
    db = SessionLocalRO()
    try:
        yield db
    finally:
        db.close()
