from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
import os
import urllib.request
import json
from ..database import get_db
from ..models import Usuario
from ..core.security import IS_PRODUCTION, SUPABASE_JWT_SECRET

security = HTTPBearer()
SUPABASE_PROJECT_URL = os.environ.get("SUPABASE_PROJECT_URL", "").rstrip("/")
SUPABASE_ISSUER = os.environ.get("SUPABASE_ISSUER") or (
    f"{SUPABASE_PROJECT_URL}/auth/v1" if SUPABASE_PROJECT_URL else ""
)
if IS_PRODUCTION and (not SUPABASE_PROJECT_URL or not SUPABASE_ISSUER):
    raise RuntimeError("SUPABASE_PROJECT_URL y SUPABASE_ISSUER son obligatorios en producción.")

# Cargar las llaves publicas de Supabase para soportar firmas asimetricas (ES256)
SUPABASE_JWKS = None
if SUPABASE_PROJECT_URL:
    try:
        JWKS_URL = f"{SUPABASE_PROJECT_URL}/auth/v1/.well-known/jwks.json"
        req = urllib.request.Request(os.environ.get("SUPABASE_JWKS_URL", JWKS_URL), headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req, timeout=5) # nosec B310
        SUPABASE_JWKS = json.loads(response.read())
    except Exception as e:
        if IS_PRODUCTION:
            raise RuntimeError("No se pudieron cargar las claves JWKS de Supabase en producción.") from e
        print(f"Warning: No se pudo cargar JWKS: {e}")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Extraer header sin verificar para decidir qué clave usar (HS256 vs Asimétrica)
        header = jwt.get_unverified_header(credentials.credentials)
        alg = header.get("alg", "HS256")
        
        if alg == "HS256":
            if not SUPABASE_JWT_SECRET or len(SUPABASE_JWT_SECRET) < 32:
                raise JWTError("SUPABASE_JWT_SECRET no disponible")
            key = SUPABASE_JWT_SECRET
            allowed_algs = ["HS256"]
        elif alg in ("ES256", "RS256"):
            if not SUPABASE_JWKS:
                raise JWTError("JWKS no disponible para firma asimétrica")
            key = SUPABASE_JWKS
            allowed_algs = ["ES256", "RS256"] # Forzar asimétricos

        else:
            raise JWTError("Algoritmo JWT no permitido")

        payload = jwt.decode(
            credentials.credentials, 
            key, 
            algorithms=allowed_algs, 
            audience="authenticated"
        )
        sub: str = payload.get("sub")
        if sub is None or payload.get("iss") != SUPABASE_ISSUER:
            raise credentials_exception
    except Exception:
        raise credentials_exception
        
    user = db.query(Usuario).filter(Usuario.supabase_uid == sub).first()
    if user is None:
        raise credentials_exception
        
    return user

def get_current_active_admin(current_user: Usuario = Depends(get_current_user)):
    if current_user.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes"
        )
    return current_user
