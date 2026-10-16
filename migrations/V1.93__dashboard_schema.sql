-- Compatibilidad del Dashboard ejecutivo con instalaciones anteriores.
-- Solo añade columnas, índices y tablas ausentes; no modifica datos existentes.
BEGIN;

ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS marca VARCHAR,
    ADD COLUMN IF NOT EXISTS familia_marca VARCHAR,
    ADD COLUMN IF NOT EXISTS product_manager VARCHAR,
    ADD COLUMN IF NOT EXISTS seccion VARCHAR;

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_pk VARCHAR(120) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    tipo_cliente VARCHAR(120),
    comercial_cliente VARCHAR(255),
    CONSTRAINT uq_clientes_empresa_cliente_pk UNIQUE (empresa_id, cliente_pk)
);

ALTER TABLE ventas_historicas
    ADD COLUMN IF NOT EXISTS margen_bruto_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS margen_destino_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS comercial_factura VARCHAR(255);

CREATE TABLE IF NOT EXISTS producto_metricas (
    producto_id INTEGER PRIMARY KEY REFERENCES productos(id),
    abc VARCHAR,
    xyz VARCHAR,
    matriz_abc VARCHAR,
    dias_cobertura INTEGER,
    riesgo_rotura BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_clientes_empresa_id ON clientes (empresa_id);
CREATE INDEX IF NOT EXISTS ix_ventas_historicas_cliente_id ON ventas_historicas (cliente_id);

COMMIT;
