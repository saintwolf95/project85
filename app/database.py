from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# SQLite local file database configuration
SQLALCHEMY_DATABASE_URL = "sqlite:///./supplychain.db"

# check_same_thread=False is needed only for SQLite
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Read-Only Engine for SQL Copilot execution
engine_ro = create_engine(
    "sqlite:///file:supplychain.db?mode=ro&uri=true",
    connect_args={"check_same_thread": False}
)
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
