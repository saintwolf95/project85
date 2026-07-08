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



def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            credentials.credentials, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
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
