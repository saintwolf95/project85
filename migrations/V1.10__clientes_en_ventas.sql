BEGIN;

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_pk VARCHAR(120) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    tipo_cliente VARCHAR(120),
    comercial_cliente VARCHAR(255),
    CONSTRAINT uq_clientes_empresa_cliente_pk UNIQUE (empresa_id, cliente_pk)
);

CREATE INDEX IF NOT EXISTS ix_clientes_empresa_id ON clientes (empresa_id);
CREATE INDEX IF NOT EXISTS ix_clientes_cliente_pk ON clientes (cliente_pk);

ALTER TABLE ventas_historicas
    ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kd VARCHAR(120),
    ADD COLUMN IF NOT EXISTS comercial_factura VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_ventas_historicas_cliente_id
    ON ventas_historicas (cliente_id);
CREATE INDEX IF NOT EXISTS ix_ventas_cliente_periodo
    ON ventas_historicas (cliente_id, fecha_venta);
CREATE INDEX IF NOT EXISTS ix_ventas_producto_fecha_cliente
    ON ventas_historicas (producto_id, fecha_venta, cliente_id);

COMMIT;
