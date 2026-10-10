-- Historial durable del equipo y telemetría mínima de consumo LLM.
CREATE TABLE IF NOT EXISTS agent_execution_runs (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    run_id VARCHAR(36) NOT NULL,
    estado VARCHAR(24) NOT NULL,
    etapa_final VARCHAR(160) NOT NULL,
    inicio TIMESTAMP NOT NULL,
    fin TIMESTAMP,
    duracion_ms INTEGER,
    informe_id INTEGER,
    error_code VARCHAR(80),
    CONSTRAINT uq_agent_execution_run_company UNIQUE (empresa_id, run_id)
);
CREATE INDEX IF NOT EXISTS ix_agent_execution_runs_empresa_inicio ON agent_execution_runs (empresa_id, inicio DESC);

CREATE TABLE IF NOT EXISTS agent_execution_members (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    run_id VARCHAR(36) NOT NULL,
    agent_name VARCHAR(40) NOT NULL,
    estado VARCHAR(24) NOT NULL,
    etapa_final VARCHAR(160) NOT NULL,
    inicio TIMESTAMP,
    fin TIMESTAMP,
    duracion_ms INTEGER,
    error_code VARCHAR(80),
    CONSTRAINT uq_agent_execution_member UNIQUE (empresa_id, run_id, agent_name)
);
CREATE INDEX IF NOT EXISTS ix_agent_execution_members_run ON agent_execution_members (empresa_id, run_id);

CREATE TABLE IF NOT EXISTS llm_usage_events (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    run_id VARCHAR(36),
    agent_name VARCHAR(40),
    feature VARCHAR(80) NOT NULL,
    model VARCHAR(80) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_llm_usage_events_empresa_fecha ON llm_usage_events (empresa_id, created_at DESC);
