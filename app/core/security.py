import os

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
if not SUPABASE_JWT_SECRET or len(SUPABASE_JWT_SECRET) < 32:
    print("CRITICAL WARNING: SUPABASE_JWT_SECRET no está configurado o es demasiado corto. La autenticación fallará o será insegura.", flush=True)

ALGORITHM = "HS256"
