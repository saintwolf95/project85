-- Fase 3 de Oficina Viva: decisiones con pasos y destinatarios de avisos por empresa.
ALTER TABLE agent_signals ADD COLUMN IF NOT EXISTS office_status VARCHAR(20) NOT NULL DEFAULT 'abierta';
ALTER TABLE agent_signals ADD COLUMN IF NOT EXISTS office_owner VARCHAR(255);

CREATE TABLE IF NOT EXISTS agent_decision_steps (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    decision_id INTEGER NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    etiqueta VARCHAR(500) NOT NULL,
    completado BOOLEAN NOT NULL DEFAULT FALSE,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_decision_step_order UNIQUE (decision_id, orden)
);
CREATE INDEX IF NOT EXISTS ix_agent_decision_steps_empresa_decision ON agent_decision_steps (empresa_id, decision_id);

CREATE TABLE IF NOT EXISTS agent_notification_recipients (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    product_manager VARCHAR(255),
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_notification_recipient UNIQUE (empresa_id, product_manager, email)
);
CREATE INDEX IF NOT EXISTS ix_agent_notification_recipients_empresa_pm ON agent_notification_recipients (empresa_id, product_manager);

CREATE TABLE IF NOT EXISTS agent_notification_logs (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    product_manager VARCHAR(255) NOT NULL,
    destinatarios TEXT NOT NULL,
    enviada_por INTEGER NOT NULL REFERENCES usuarios(id),
    enviada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_agent_notification_logs_empresa_pm_fecha ON agent_notification_logs (empresa_id, product_manager, enviada_en DESC);
