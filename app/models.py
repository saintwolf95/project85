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
    hashed_password = Column(String, nullable=False)
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
    
    empresa = relationship("Empresa", back_populates="productos")
    inventario = relationship("Inventario", back_populates="producto", uselist=False)

class Inventario(Base):
    __tablename__ = "inventario"
    producto_id = Column(Integer, ForeignKey("productos.id"), primary_key=True)
    stock_disponible = Column(Integer, nullable=False, default=0)
    
    producto = relationship("Producto", back_populates="inventario")

class VentaHistorica(Base):
    __tablename__ = "ventas_historicas"
    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"))
    fecha_venta = Column(Date, nullable=False)
    cantidad_vendida = Column(Integer, nullable=False)
    ingreso_total = Column(Float, nullable=False)
