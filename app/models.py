from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Date, DateTime
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Empresa(Base):
    __tablename__ = "empresas"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    contexto_negocio = Column(String, nullable=True)
    productos = relationship("Producto", back_populates="empresa")

class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    supabase_uid = Column(String, unique=True, index=True, nullable=False)
    nombre = Column(String, nullable=False)
    rol = Column(String, default="user")

    empresa = relationship("Empresa")

class Producto(Base):
    __tablename__ = "productos"
    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"))
    sku = Column(String, index=True, nullable=False)
    nombre = Column(String, nullable=False)
    costo_unitario = Column(Float, nullable=False)
    precio_venta = Column(Float, nullable=False)
    lead_time_dias = Column(Integer, nullable=False, default=7)
    part_number = Column(String, index=True, nullable=True)
    ean = Column(String, index=True, nullable=True)
    peso = Column(Float, nullable=True)
    familia = Column(String, nullable=True)
    marca = Column(String, nullable=True)
    product_manager = Column(String, nullable=True)
    seccion = Column(String, nullable=True)
    
    empresa = relationship("Empresa", back_populates="productos")
    inventario = relationship("InventarioSnapshot", back_populates="producto", uselist=False)

class InventarioSnapshot(Base):
    __tablename__ = "inventario_snapshot"
    producto_id = Column(Integer, ForeignKey("productos.id"), primary_key=True)
    stock_disponible = Column(Integer, nullable=False, default=0)
    
    producto = relationship("Producto", back_populates="inventario")

class Registro_PO(Base):
    __tablename__ = "registro_po"
    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    fecha_orden = Column(Date, nullable=False)
    cantidad_sugerida_algoritmo = Column(Integer, nullable=False)
    cantidad_aprobada_usuario = Column(Integer, nullable=False)
    motivo_modificacion = Column(String, nullable=True)
    estado = Column(String, nullable=False, default="Pendiente")
    
    producto = relationship("Producto")

class VentaHistorica(Base):
    __tablename__ = "ventas_historicas"
    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"))
    fecha_venta = Column(Date, nullable=False)
    cantidad_vendida = Column(Integer, nullable=False)
    precio_unitario = Column(Float, nullable=False)
    ingreso_total = Column(Float, nullable=False)
    stock_disponible = Column(Integer, nullable=False, default=0)

class CopilotChat(Base):
    __tablename__ = "copilot_chats"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    titulo = Column(String, nullable=False, default="Nuevo Chat")
    creado_en = Column(DateTime, default=datetime.utcnow)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario")
    mensajes = relationship("CopilotMessage", back_populates="chat", cascade="all, delete-orphan")

class CopilotMessage(Base):
    __tablename__ = "copilot_messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("copilot_chats.id"), nullable=False)
    rol = Column(String, nullable=False) # 'user' o 'assistant'
    contenido = Column(String, nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow)
    chat = relationship("CopilotChat", back_populates="mensajes")

class ProductoMetricas(Base):
    __tablename__ = "producto_metricas"
    producto_id = Column(Integer, ForeignKey("productos.id"), primary_key=True)
    abc = Column(String)
    xyz = Column(String)
    matriz_abc = Column(String)
    dias_cobertura = Column(Integer)
    riesgo_rotura = Column(Boolean, default=False)
    
    producto = relationship("Producto")

class EmpresaConfiguracion(Base):
    __tablename__ = "empresa_configuraciones"
    empresa_id = Column(Integer, ForeignKey("empresas.id"), primary_key=True)
    contexto_negocio = Column(String, default="")
    
class AgentSettings(Base):
    __tablename__ = "agent_settings"
    empresa_id = Column(Integer, ForeignKey("empresas.id"), primary_key=True)
    fase1_active = Column(Boolean, default=False)
    fase2_active = Column(Boolean, default=False)

class AgentInsights(Base):
    __tablename__ = "agent_insights"
    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    fecha = Column(DateTime, default=datetime.utcnow)
    fase1_raw_json = Column(String, nullable=True) # JSON con las alertas de los 3 agentes (Legacy)
    fase1_maria_md = Column(String, nullable=True) # Informe de María (Inventario)
    fase1_lucia_md = Column(String, nullable=True) # Informe de Lucía (Ventas)
    fase1_mattia_md = Column(String, nullable=True) # Informe de Mattia (Finanzas)
    fase2_ceo_markdown = Column(String, nullable=True) # Informe final del CEO

class EmpresaEstadisticas(Base):
    __tablename__ = "empresa_estadisticas"
    empresa_id = Column(Integer, ForeignKey("empresas.id"), primary_key=True)
    total_skus = Column(Integer, default=0)
    volumen_total = Column(Integer, default=0)
    costo_promedio = Column(Float, default=0.0)
    familia_top = Column(String, nullable=True)
    valor_total_inventario = Column(Float, default=0.0)
    total_alertas_criticas = Column(Integer, default=0)
    salud_stock_clase_a = Column(Integer, default=0)
    abc_data = Column(String, nullable=True) # JSON array serialized
    family_data = Column(String, nullable=True) # JSON array serialized
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    empresa = relationship("Empresa")

class AgentChat(Base):
    __tablename__ = "agent_chats"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    agent_name = Column(String, nullable=False) # 'maria', 'lucia', 'mattia', 'ceo'
    creado_en = Column(DateTime, default=datetime.utcnow)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario = relationship("Usuario")
    mensajes = relationship("AgentMessage", back_populates="chat", cascade="all, delete-orphan")

class AgentMessage(Base):
    __tablename__ = "agent_messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("agent_chats.id"), nullable=False)
    rol = Column(String, nullable=False) # 'user' o 'assistant'
    contenido = Column(String, nullable=False)
    creado_en = Column(DateTime, default=datetime.utcnow)
    
    chat = relationship("AgentChat", back_populates="mensajes")

class LibreriaDocumento(Base):
    __tablename__ = "libreria_documentos"
    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    filename = Column(String, nullable=False)
    department = Column(String, nullable=False)
    content_text = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow)
    
    empresa = relationship("Empresa")
