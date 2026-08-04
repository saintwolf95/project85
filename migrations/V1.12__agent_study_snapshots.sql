BEGIN;

CREATE TABLE IF NOT EXISTS agent_study_snapshots (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    agent_name VARCHAR(40) NOT NULL,
    report_date DATE NOT NULL,
    source_date DATE,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_agent_study_company_agent_day UNIQUE (empresa_id, agent_name, report_date)
);

CREATE INDEX IF NOT EXISTS ix_agent_study_snapshots_empresa_id
    ON agent_study_snapshots (empresa_id);
CREATE INDEX IF NOT EXISTS ix_agent_study_snapshots_report_date
    ON agent_study_snapshots (report_date);

COMMIT;
