"""Aísla la suite de las credenciales y conexiones configuradas en el entorno local."""
import os


os.environ["DATABASE_URL"] = ""
os.environ["DATABASE_RO_URL"] = ""
os.environ["APP_ENV"] = "testing"
os.environ["SUPABASE_JWT_SECRET"] = "test-only-secret-with-32-characters"
os.environ["SUPABASE_PROJECT_URL"] = ""
os.environ["SUPABASE_ISSUER"] = ""
