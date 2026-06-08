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
    req = urllib.request.urlopen(JWKS_URL) # nosec B310: URL hardcoded a supabase
    SUPABASE_JWKS = json.loads(req.read())
except Exception:
    SUPABASE_JWKS = SUPABASE_JWT_SECRET

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            credentials.credentials, 
            SUPABASE_JWKS, 
            algorithms=["HS256", "ES256", "RS256"], 
            audience="authenticated"
        )
        sub: str = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except JWTError as e:
        print("JWTError:", e)
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
