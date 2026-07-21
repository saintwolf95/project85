from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

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

class AgentInsightResponse(BaseModel):
    id: int
    fecha: datetime
    fase1_raw_json: Optional[str] = None
    fase1_maria_md: Optional[str] = None
    fase1_lucia_md: Optional[str] = None
    fase1_mattia_md: Optional[str] = None
    fase2_ceo_markdown: Optional[str] = None
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
    unidades_venta_90d: float
    ventas_90d: float
    abc: str
    xyz: str
    cv: float
    matriz_abc: str
    ads: float
    dias_cobertura: int
    riesgos_categorizados: List[str]

class InventoryAnalyticsResponse(BaseModel):
    data: List[ProductMetrics]
    total_records: int
    total_pages: int
    current_page: int

class DashboardKPIsResponse(BaseModel):
    total_skus: int
    volumen_total: int
    costo_promedio: float
    familia_top: Optional[str] = None
    valor_total_inventario: float
    total_alertas_criticas: int
    salud_stock_clase_a: int
    abc_data: list
    family_data: list

class ProductHistoryDaily(BaseModel):
    fecha: str
    ventas_eur: float
    inventario_eur: float

class ProductHistoryResponse(BaseModel):
    producto_id: int
    nombre: str
    historico: List[ProductHistoryDaily]

class AgentSettingsUpdate(BaseModel):
    fase1_active: bool
    fase2_active: bool

class AgentSettingsResponse(BaseModel):
    empresa_id: int
    fase1_active: bool
    fase2_active: bool
    
    class Config:
        from_attributes = True

class AgentChatMessage(BaseModel):
    role: str
    content: str = Field(..., max_length=2000)

class AgentChatRequest(BaseModel):
    chat_id: Optional[int] = None
    history: List[AgentChatMessage] = Field(..., max_length=20)

class LibreriaDocumentoResponse(BaseModel):
    id: int
    filename: str
    department: str
    upload_date: datetime
    
    class Config:
        from_attributes = True

class LibreriaChatRequest(BaseModel):
    department_filter: Optional[str] = Field(default=None, max_length=80)
    question: str = Field(..., max_length=2000)

class LibreriaChatResponse(BaseModel):
    answer: str
    context_docs: int
