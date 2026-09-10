from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import date, datetime

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
    inventario_disponible: bool
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
    inventario_eur: Optional[float] = None

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
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)

class AgentChatRequest(BaseModel):
    chat_id: Optional[int] = None
    signal_id: Optional[int] = Field(default=None, ge=1)
    history: List[AgentChatMessage] = Field(..., min_length=1, max_length=20)

class AgentInvestigationRequest(BaseModel):
    question: str = Field(..., min_length=8, max_length=1200)


class AgentSignalFeedbackRequest(BaseModel):
    veredicto: Literal["util", "ya_conocida", "no_accionable", "falso_positivo"]
    motivo: Optional[str] = Field(default=None, max_length=1000)


class AgentDiscardRequest(BaseModel):
    motivo: str = Field(..., min_length=1, max_length=1000)
    veredicto: Literal["no_accionable", "falso_positivo"] = "no_accionable"


class AgentDecisionCreateRequest(BaseModel):
    episodio_id: Optional[int] = None
    signal_id: Optional[int] = None
    titulo: str = Field(..., min_length=1, max_length=500)
    descripcion: str = Field(default="", max_length=5000)
    responsable: str = Field(default="Sin asignar", max_length=255)
    metrica_objetivo: str = Field(default="Sin métrica definida", max_length=500)
    valor_objetivo: Optional[float] = None
    horizonte_fecha: date


class AgentDecisionUpdateRequest(BaseModel):
    estado: Optional[Literal["propuesta", "aceptada", "en_curso", "completada", "descartada"]] = None
    responsable: Optional[str] = Field(default=None, max_length=255)
    metrica_objetivo: Optional[str] = Field(default=None, max_length=500)
    valor_objetivo: Optional[float] = None
    horizonte_fecha: Optional[date] = None
    resultado_texto: Optional[str] = Field(default=None, max_length=5000)


class BusinessRuleRequest(BaseModel):
    clave: Literal["lead_time_dias", "margen_objetivo_pct", "cliente_estrategico", "sku_discontinuado", "familia_estacional", "umbral_detector"]
    ambito_tipo: Literal["empresa", "familia", "sku", "cliente", "comercial"]
    ambito_id: Optional[str] = Field(default=None, max_length=255)
    valor_num: Optional[float] = None
    valor_texto: Optional[str] = Field(default=None, max_length=255)
    valor_json: Optional[str] = Field(default=None, max_length=5000)
    vigente_desde: date
    vigente_hasta: Optional[date] = None


class OnboardingProgressRequest(BaseModel):
    estado: Literal["pendiente", "completado", "saltado"] = "pendiente"
    paso_ultimo: int = Field(default=0, ge=0, le=20)
    evento: Literal["inicio", "paso", "abandono", "finalizacion", "elemento_completado"]
    detalle: Optional[str] = Field(default=None, max_length=500)

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
