import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Determinar si usamos Postgres o SQLite
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
    # Fix for newer SQLAlchemy versions that expect postgresql:// instead of postgres://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    # Remove unsupported pgbouncer argument for psycopg2
    if "?pgbouncer=true" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("?pgbouncer=true", "")
        # Remove trailing ampersand if it was the first parameter
        if DATABASE_URL.endswith("&"):
            DATABASE_URL = DATABASE_URL[:-1]
        # Remove trailing question mark if it was the only parameter
        if DATABASE_URL.endswith("?"):
            DATABASE_URL = DATABASE_URL[:-1]
            
    engine = create_engine(DATABASE_URL)
    engine_ro = create_engine(DATABASE_URL) # En Postgres la seguridad debe hacerse a nivel de usuario (Rol)
else:
    # Fallback a SQLite local
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
