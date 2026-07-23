import os
from dotenv import load_dotenv

load_dotenv()

APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"production", "prod"} or os.environ.get("DATABASE_URL", "").startswith(("postgres://", "postgresql://"))

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
if IS_PRODUCTION and (not SUPABASE_JWT_SECRET or len(SUPABASE_JWT_SECRET) < 32):
    raise RuntimeError("SUPABASE_JWT_SECRET debe existir y tener al menos 32 caracteres en producción.")
if not SUPABASE_JWT_SECRET or len(SUPABASE_JWT_SECRET) < 32:
    print("CRITICAL WARNING: SUPABASE_JWT_SECRET no está configurado o es demasiado corto. La autenticación fallará o será insegura.", flush=True)

ALGORITHM = "HS256"
