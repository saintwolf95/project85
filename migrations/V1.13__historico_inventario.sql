BEGIN;

CREATE TABLE IF NOT EXISTS inventario_historico (
    id SERIAL PRIMARY KEY,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    fecha_inventario DATE NOT NULL,
    inventario_eur DOUBLE PRECISION NOT NULL DEFAULT 0,
    unidades_inventario INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_inventario_historico_producto_fecha UNIQUE (producto_id, fecha_inventario)
);

CREATE INDEX IF NOT EXISTS ix_inventario_historico_producto_fecha
    ON inventario_historico (producto_id, fecha_inventario);
CREATE INDEX IF NOT EXISTS ix_inventario_historico_fecha
    ON inventario_historico (fecha_inventario);

COMMIT;
