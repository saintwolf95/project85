-- Señales deterministas para los agentes: la IA narra evidencia, no la calcula.
CREATE TABLE IF NOT EXISTS agent_signals (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    agente VARCHAR(40) NOT NULL,
    detector VARCHAR(120) NOT NULL,
    entidad_tipo VARCHAR(40),
    entidad_id VARCHAR(255),
    periodo_inicio DATE,
    periodo_fin DATE,
    severidad SMALLINT NOT NULL DEFAULT 1,
    impacto_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
    confianza DOUBLE PRECISION NOT NULL DEFAULT 0,
    valor_actual DOUBLE PRECISION,
    valor_esperado DOUBLE PRECISION,
    desviacion DOUBLE PRECISION,
    evidencia TEXT NOT NULL DEFAULT '{}',
    fingerprint VARCHAR(64) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'nueva',
    primera_deteccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_deteccion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_signals_empresa_fingerprint UNIQUE (empresa_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS ix_agent_signals_empresa_estado ON agent_signals (empresa_id, estado);
CREATE INDEX IF NOT EXISTS ix_agent_signals_agente ON agent_signals (agente);
