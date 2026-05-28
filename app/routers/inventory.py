from fastapi import APIRouter, Depends
from ..api.deps import get_current_active_admin
from ..models import Usuario

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.post("/product")
def create_product(current_user: Usuario = Depends(get_current_active_admin)):
    return {"message": "Producto creado", "admin": current_user.email}
