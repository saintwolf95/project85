from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Date, DateTime, Text, UniqueConstraint
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


class UsuarioOnboarding(Base):
    __tablename__ = "usuario_onboarding"
    __table_args__ = (
        UniqueConstraint("usuario_id", "empresa_id", "flujo", name="uq_usuario_onboarding_flujo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    flujo = Column(String(80), nullable=False)
    estado = Column(String(20), nullable=False, default="pendiente")
    paso_ultimo = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UsuarioOnboardingEvento(Base):
    __tablename__ = "usuario_onboarding_eventos"

    id = Column(Integer, primary_key=True, index=True)
    onboarding_id = Column(Integer, ForeignKey("usuario_onboarding.id", ondelete="CASCADE"), nullable=False, index=True)
    evento = Column(String(30), nullable=False)
    paso = Column(Integer, nullable=True)
    detalle = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Cliente(Base):
    __tablename__ = "clientes"
    __table_args__ = (
        UniqueConstraint("empresa_id", "cliente_pk", name="uq_clientes_empresa_cliente_pk"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    cliente_pk = Column(String(120), nullable=False, index=True)
    nombre = Column(String(255), nullable=False)
    tipo_cliente = Column(String(120), nullable=True)
    comercial_cliente = Column(String(255), nullable=True)

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
    familia_marca = Column(String, nullable=True)
    product_manager = Column(String, nullable=True)
    seccion = Column(String, nullable=True)
    
    empresa = relationship("Empresa", back_populates="productos")
    inventario = relationship("InventarioSnapshot", back_populates="producto", uselist=False)

class InventarioSnapshot(Base):
    __tablename__ = "inventario_snapshot"
    producto_id = Column(Integer, ForeignKey("productos.id"), primary_key=True)
    stock_disponible = Column(Integer, nullable=False, default=0)
    
    producto = relationship("Producto", back_populates="inventario")


class InventarioHistorico(Base):
    """Valor y unidades de inventario observados para un SKU en una fecha."""
    __tablename__ = "inventario_historico"
    __table_args__ = (
        UniqueConstraint("producto_id", "fecha_inventario", name="uq_inventario_historico_producto_fecha"),
    )

    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True)
    fecha_inventario = Column(Date, nullable=False, index=True)
    inventario_eur = Column(Float, nullable=False, default=0.0)
    unidades_inventario = Column(Integer, nullable=False, default=0)

    producto = relationship("Producto")

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
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True, index=True)
    fecha_venta = Column(Date, nullable=False)
    cantidad_vendida = Column(Integer, nullable=False)
    precio_unitario = Column(Float, nullable=False)
    ingreso_total = Column(Float, nullable=False)
    margen_bruto_eur = Column(Float, nullable=False, default=0.0)
    margen_bruto_pct = Column(Float, nullable=True)
    margen_destino_eur = Column(Float, nullable=False, default=0.0)
    margen_destino_pct = Column(Float, nullable=True)
    kd = Column(String(120), nullable=True)
    comercial_factura = Column(String(255), nullable=True)
    stock_disponible = Column(Integer, nullable=False, default=0)

    cliente = relationship("Cliente")

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


class EmpresaReglaNegocio(Base):
    """Parámetros verificables que modifican detectores sin depender del texto libre."""
    __tablename__ = "empresa_reglas_negocio"
    __table_args__ = (
        UniqueConstraint("empresa_id", "clave", "ambito_tipo", "ambito_id", "vigente_desde", name="uq_regla_negocio_vigencia"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    clave = Column(String(80), nullable=False, index=True)
    ambito_tipo = Column(String(20), nullable=True)
    ambito_id = Column(String(255), nullable=True)
    valor_num = Column(Float, nullable=True)
    valor_texto = Column(String(255), nullable=True)
    valor_json = Column(Text, nullable=True)
    vigente_desde = Column(Date, nullable=False)
    vigente_hasta = Column(Date, nullable=True)
    actualizado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
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

class AgentStudySnapshot(Base):
    __tablename__ = "agent_study_snapshots"
    __table_args__ = (
        UniqueConstraint("empresa_id", "agent_name", "report_date", name="uq_agent_study_company_agent_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    agent_name = Column(String(40), nullable=False)
    report_date = Column(Date, nullable=False, index=True)
    source_date = Column(Date, nullable=True)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AgentSignal(Base):
    """Hallazgo determinista persistente; la IA solo puede narrar su evidencia."""
    __tablename__ = "agent_signals"
    __table_args__ = (
        UniqueConstraint("empresa_id", "fingerprint", name="uq_agent_signals_empresa_fingerprint"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    agente = Column(String(40), nullable=False, index=True)
    detector = Column(String(120), nullable=False, index=True)
    entidad_tipo = Column(String(40), nullable=True)
    entidad_id = Column(String(255), nullable=True)
    periodo_inicio = Column(Date, nullable=True)
    periodo_fin = Column(Date, nullable=True)
    severidad = Column(Integer, nullable=False, default=1)
    impacto_eur = Column(Float, nullable=False, default=0.0)
    impacto_tipo = Column(String(20), nullable=False, default="en_riesgo")
    impacto_ponderado_eur = Column(Float, nullable=False, default=0.0)
    naturaleza = Column(String(20), nullable=False, default="riesgo", index=True)
    confianza = Column(Float, nullable=False, default=0.0)
    valor_actual = Column(Float, nullable=True)
    valor_esperado = Column(Float, nullable=True)
    desviacion = Column(Float, nullable=True)
    evidencia = Column(Text, nullable=False, default="{}")
    fingerprint = Column(String(64), nullable=False)
    estado = Column(String(20), nullable=False, default="nueva")
    primera_deteccion = Column(DateTime, default=datetime.utcnow, nullable=False)
    ultima_deteccion = Column(DateTime, default=datetime.utcnow, nullable=False)
    episodio_id = Column(Integer, ForeignKey("agent_episodes.id"), nullable=True, index=True)
    descartada_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    descartada_motivo = Column(Text, nullable=True)
    descartada_en = Column(DateTime, nullable=True)


class AgentSignalLink(Base):
    __tablename__ = "agent_signal_links"
    __table_args__ = (
        UniqueConstraint("empresa_id", "signal_origen_id", "signal_destino_id", "regla", name="uq_agent_signal_links_rule"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    signal_origen_id = Column(Integer, ForeignKey("agent_signals.id", ondelete="CASCADE"), nullable=False, index=True)
    signal_destino_id = Column(Integer, ForeignKey("agent_signals.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo_relacion = Column(String(20), nullable=False)
    regla = Column(String(120), nullable=False)
    solape_dias = Column(Integer, nullable=False, default=0)
    detalle = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AgentEpisode(Base):
    __tablename__ = "agent_episodes"
    __table_args__ = (
        UniqueConstraint("empresa_id", "fingerprint", name="uq_agent_episodes_empresa_fingerprint"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fingerprint = Column(String(64), nullable=False)
    titulo = Column(String(500), nullable=False)
    entidad_tipo = Column(String(40), nullable=True)
    entidad_id = Column(String(255), nullable=True)
    severidad_max = Column(Integer, nullable=False, default=1)
    impacto_realizado_eur = Column(Float, nullable=False, default=0.0)
    impacto_en_riesgo_eur = Column(Float, nullable=False, default=0.0)
    impacto_capital_eur = Column(Float, nullable=False, default=0.0)
    impacto_ponderado_eur = Column(Float, nullable=False, default=0.0)
    estado = Column(String(20), nullable=False, default="abierto")
    primera_deteccion = Column(DateTime, default=datetime.utcnow, nullable=False)
    ultima_deteccion = Column(DateTime, default=datetime.utcnow, nullable=False)


class AgentSignalFeedback(Base):
    __tablename__ = "agent_signal_feedback"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    signal_id = Column(Integer, ForeignKey("agent_signals.id", ondelete="CASCADE"), nullable=False, index=True)
    veredicto = Column(String(20), nullable=False)
    motivo = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AgentDecision(Base):
    __tablename__ = "agent_decisions"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    episodio_id = Column(Integer, ForeignKey("agent_episodes.id", ondelete="SET NULL"), nullable=True, index=True)
    signal_id = Column(Integer, ForeignKey("agent_signals.id", ondelete="SET NULL"), nullable=True, index=True)
    titulo = Column(String(500), nullable=False)
    descripcion = Column(Text, nullable=False, default="")
    responsable = Column(String(255), nullable=False, default="Sin asignar")
    metrica_objetivo = Column(String(500), nullable=False, default="Sin métrica definida")
    valor_objetivo = Column(Float, nullable=True)
    horizonte_fecha = Column(Date, nullable=False)
    origen = Column(String(20), nullable=False)
    estado = Column(String(20), nullable=False, default="propuesta")
    resultado_texto = Column(Text, nullable=True)
    creada_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    cerrada_en = Column(DateTime, nullable=True)

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
