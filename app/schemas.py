from pydantic import BaseModel
from typing import List, Optional

class Token(BaseModel):
    access_token: str
    token_type: str
    rol: str = "user"

class TokenData(BaseModel):
    email: Optional[str] = None

class UsuarioBase(BaseModel):
    email: str
    nombre: str
    rol: str = "user"
    empresa_id: int

class Usuario(UsuarioBase):
    id: int

    class Config:
        from_attributes = True

class ProductMetrics(BaseModel):
    producto_id: int
    fecha: str
    nombre_art: str
    cod_art: str
    pn: str
    ean: str
    costo_unit: float
    peso: float
    familia: str
    marca: str
    product_manager: Optional[str] = None
    seccion: Optional[str] = None
    precio_unit: float
    unidades: int
    valor_inv: float
    unidades_venta_60d: float
    ventas_60d: float
    abc: str
    xyz: str
    cv: float
    matriz_abc: str
    ads: float
    dias_cobertura: float
    riesgos_categorizados: List[str]

class InventoryAnalyticsResponse(BaseModel):
    data: List[ProductMetrics]
    total_records: int
    total_pages: int
    current_page: int

class DashboardKPIsResponse(BaseModel):
    valor_total_inventario: float
    total_alertas_criticas: int
    salud_stock_clase_a: int

class ProductHistoryDaily(BaseModel):
    fecha: str
    ventas_eur: float
    inventario_eur: float

class ProductHistoryResponse(BaseModel):
    producto_id: int
    nombre: str
    historico: List[ProductHistoryDaily]
