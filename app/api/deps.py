from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
import urllib.request
import json
from ..database import get_db
from ..models import Usuario
from ..core.security import SUPABASE_JWT_SECRET

security = HTTPBearer()

# Cargar las llaves publicas de Supabase para soportar firmas asimetricas (ES256)
try:
    JWKS_URL = "https://rygviqehzmtsenphncig.supabase.co/auth/v1/.well-known/jwks.json"
    req = urllib.request.Request(JWKS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    response = urllib.request.urlopen(req) # nosec B310
    SUPABASE_JWKS = json.loads(response.read())
except Exception as e:
    print(f"Warning: No se pudo cargar JWKS: {e}")
    SUPABASE_JWKS = None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        header = jwt.get_unverified_header(credentials.credentials)
        alg = header.get("alg", "HS256")
        
        if alg == "HS256":
            key = SUPABASE_JWT_SECRET
        else:
            if not SUPABASE_JWKS:
                raise JWTError("JWKS no disponible para firma asimétrica")
            key = SUPABASE_JWKS

        payload = jwt.decode(
            credentials.credentials, 
            key, 
            algorithms=["HS256", "ES256", "RS256"], 
            audience="authenticated"
        )
        sub: str = payload.get("sub")
        print(f"DEBUG AUTH: JWT decode success. alg={alg}, sub={sub}", flush=True)
        if sub is None:
            raise credentials_exception
    except Exception as e:
        print(f"DEBUG AUTH ERROR: {type(e).__name__}: {str(e)}", flush=True)
        raise credentials_exception
        
    user = db.query(Usuario).filter(Usuario.supabase_uid == sub).first()
    if user is None:
        print(f"DEBUG AUTH: User not found in DB for sub={sub}", flush=True)
        raise credentials_exception
        
    print(f"DEBUG AUTH: User matched: {user.email}", flush=True)
    return user

def get_current_active_admin(current_user: Usuario = Depends(get_current_user)):
    if current_user.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permisos insuficientes"
        )
    return current_user
