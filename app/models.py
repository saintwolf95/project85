from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Date, DateTime
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Empresa(Base):
    __tablename__ = "empresas"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
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
    dias_cobertura = Column(Float)
    riesgo_rotura = Column(Boolean, default=False)
    
    producto = relationship("Producto")
