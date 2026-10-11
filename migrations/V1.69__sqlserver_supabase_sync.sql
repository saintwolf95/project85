BEGIN;

CREATE SCHEMA IF NOT EXISTS sync;
CREATE SCHEMA IF NOT EXISTS app_sync;

CREATE TABLE IF NOT EXISTS sync.load_log (
    id UUID PRIMARY KEY,
    dataset TEXT NOT NULL CHECK (dataset IN ('ventas', 'inventario')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    source_rows BIGINT,
    staging_rows BIGINT,
    inserted_rows BIGINT NOT NULL DEFAULT 0,
    updated_rows BIGINT NOT NULL DEFAULT 0,
    deleted_rows BIGINT NOT NULL DEFAULT 0,
    source_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
    staging_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT
);

CREATE UNLOGGED TABLE IF NOT EXISTS sync.stg_ventas_diarias (
    empresa_id INTEGER NOT NULL,
    fecha_venta DATE NOT NULL,
    articulo_pk TEXT NOT NULL,
    nombre_articulo TEXT NOT NULL,
    cliente_pk TEXT NOT NULL,
    nombre_cliente TEXT,
    tipo_cliente TEXT,
    nombre_comercial TEXT,
    comercial_factura TEXT NOT NULL,
    kd TEXT NOT NULL,
    ventas_eur NUMERIC(18,2) NOT NULL,
    unidades_venta NUMERIC(18,4) NOT NULL,
    margen_bruto_eur NUMERIC(18,2) NOT NULL,
    margen_destino_eur NUMERIC(18,2),
    nombre_marca TEXT,
    familia_marca TEXT,
    nombre_familia TEXT,
    nombre_seccion TEXT,
    ean TEXT,
    product_manager TEXT
);

CREATE UNLOGGED TABLE IF NOT EXISTS sync.stg_inventario_diario (
    empresa_id INTEGER NOT NULL,
    fecha_inventario DATE NOT NULL,
    articulo_pk TEXT NOT NULL,
    nombre_articulo TEXT NOT NULL,
    inventario_eur NUMERIC(18,2) NOT NULL,
    unidades_inventario INTEGER NOT NULL,
    nombre_marca TEXT,
    familia_marca TEXT,
    nombre_familia TEXT,
    nombre_seccion TEXT,
    ean TEXT,
    product_manager TEXT
);

CREATE TABLE IF NOT EXISTS sync.ventas_diarias (
    source_record_key TEXT PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    fecha_venta DATE NOT NULL,
    articulo_pk TEXT NOT NULL,
    nombre_articulo TEXT NOT NULL,
    cliente_pk TEXT NOT NULL,
    nombre_cliente TEXT,
    tipo_cliente TEXT,
    nombre_comercial TEXT,
    comercial_factura TEXT NOT NULL,
    kd TEXT NOT NULL,
    ventas_eur NUMERIC(18,2) NOT NULL,
    unidades_venta NUMERIC(18,4) NOT NULL,
    margen_bruto_eur NUMERIC(18,2) NOT NULL,
    margen_destino_eur NUMERIC(18,2),
    nombre_marca TEXT,
    familia_marca TEXT,
    nombre_familia TEXT,
    nombre_seccion TEXT,
    ean TEXT,
    product_manager TEXT,
    row_hash TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    UNIQUE (empresa_id, fecha_venta, articulo_pk, cliente_pk, kd, comercial_factura)
);

CREATE TABLE IF NOT EXISTS sync.inventario_diario (
    source_record_key TEXT PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    fecha_inventario DATE NOT NULL,
    articulo_pk TEXT NOT NULL,
    nombre_articulo TEXT NOT NULL,
    inventario_eur NUMERIC(18,2) NOT NULL,
    unidades_inventario INTEGER NOT NULL,
    nombre_marca TEXT,
    familia_marca TEXT,
    nombre_familia TEXT,
    nombre_seccion TEXT,
    ean TEXT,
    product_manager TEXT,
    row_hash TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    UNIQUE (empresa_id, fecha_inventario, articulo_pk)
);

CREATE INDEX IF NOT EXISTS ix_sync_ventas_empresa_fecha ON sync.ventas_diarias (empresa_id, fecha_venta);
CREATE INDEX IF NOT EXISTS ix_sync_ventas_articulo ON sync.ventas_diarias (articulo_pk);
CREATE INDEX IF NOT EXISTS ix_sync_ventas_cliente ON sync.ventas_diarias (cliente_pk);
CREATE INDEX IF NOT EXISTS ix_sync_ventas_updated ON sync.ventas_diarias (source_updated_at);
CREATE INDEX IF NOT EXISTS ix_sync_inventario_empresa_fecha ON sync.inventario_diario (empresa_id, fecha_inventario);
CREATE INDEX IF NOT EXISTS ix_sync_inventario_articulo ON sync.inventario_diario (articulo_pk);
CREATE INDEX IF NOT EXISTS ix_sync_inventario_updated ON sync.inventario_diario (source_updated_at);

ALTER TABLE inventario_snapshot ADD COLUMN IF NOT EXISTS inventario_eur DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE ventas_historicas ADD COLUMN IF NOT EXISTS sync_source_key TEXT;
ALTER TABLE inventario_historico ADD COLUMN IF NOT EXISTS sync_source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_sku ON productos (empresa_id, sku);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_historicas_sync_source_key ON ventas_historicas (sync_source_key) WHERE sync_source_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_historico_sync_source_key ON inventario_historico (sync_source_key) WHERE sync_source_key IS NOT NULL;

CREATE OR REPLACE VIEW app_sync.vw_ventas_diarias WITH (security_invoker = true) AS
SELECT source_record_key, empresa_id, fecha_venta, articulo_pk, nombre_articulo,
       cliente_pk, nombre_cliente, tipo_cliente, nombre_comercial, comercial_factura, kd,
       ventas_eur, unidades_venta, margen_bruto_eur,
       CASE WHEN ventas_eur = 0 THEN 0 ELSE margen_bruto_eur / ventas_eur * 100 END AS margen_bruto_pct,
       margen_destino_eur,
       CASE WHEN ventas_eur = 0 OR margen_destino_eur IS NULL THEN 0 ELSE margen_destino_eur / ABS(ventas_eur) * 100 END AS margen_destino_pct,
       nombre_marca, familia_marca, nombre_familia, nombre_seccion, ean, product_manager,
       source_updated_at, is_deleted, deleted_at
FROM sync.ventas_diarias;

CREATE OR REPLACE VIEW app_sync.vw_inventario_diario WITH (security_invoker = true) AS
SELECT source_record_key, empresa_id, fecha_inventario, articulo_pk, nombre_articulo,
       inventario_eur, unidades_inventario, nombre_marca, familia_marca, nombre_familia,
       nombre_seccion, ean, product_manager, source_updated_at, is_deleted, deleted_at
FROM sync.inventario_diario;

CREATE OR REPLACE FUNCTION sync.materialize_application_data(p_empresa_id INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- Catálogo: el snapshot de inventario tiene prioridad para el coste medio.
    WITH dimensiones AS (
        SELECT empresa_id, articulo_pk, nombre_articulo, nombre_marca, familia_marca,
               nombre_familia, nombre_seccion, ean, product_manager,
               CASE WHEN unidades_inventario > 0 THEN inventario_eur / unidades_inventario ELSE 0 END AS costo_unitario,
               0::numeric AS precio_venta, fecha_inventario AS fecha_observacion,
               source_updated_at, 2 AS prioridad
        FROM sync.inventario_diario
        WHERE empresa_id = p_empresa_id AND NOT is_deleted
        UNION ALL
        SELECT empresa_id, articulo_pk, nombre_articulo, nombre_marca, familia_marca,
               nombre_familia, nombre_seccion, ean, product_manager,
               CASE WHEN unidades_venta <> 0 THEN GREATEST((ventas_eur - margen_bruto_eur) / unidades_venta, 0) ELSE 0 END,
               CASE WHEN unidades_venta <> 0 THEN ventas_eur / unidades_venta ELSE 0 END,
               fecha_venta, source_updated_at, 1
        FROM sync.ventas_diarias
        WHERE empresa_id = p_empresa_id AND NOT is_deleted
    ), ultimo_producto AS (
        SELECT DISTINCT ON (empresa_id, articulo_pk) *
        FROM dimensiones
        ORDER BY empresa_id, articulo_pk, prioridad DESC, fecha_observacion DESC, source_updated_at DESC
    )
    INSERT INTO productos (empresa_id, sku, nombre, costo_unitario, precio_venta, lead_time_dias,
                           ean, familia, marca, familia_marca, product_manager, seccion)
    SELECT empresa_id, articulo_pk, nombre_articulo, costo_unitario, precio_venta, 7,
           ean, nombre_familia, nombre_marca, familia_marca, product_manager, nombre_seccion
    FROM ultimo_producto
    ON CONFLICT (empresa_id, sku) DO UPDATE SET
        nombre = EXCLUDED.nombre, costo_unitario = EXCLUDED.costo_unitario,
        precio_venta = CASE WHEN EXCLUDED.precio_venta > 0 THEN EXCLUDED.precio_venta ELSE productos.precio_venta END,
        ean = EXCLUDED.ean, familia = EXCLUDED.familia, marca = EXCLUDED.marca,
        familia_marca = EXCLUDED.familia_marca, product_manager = EXCLUDED.product_manager,
        seccion = EXCLUDED.seccion;

    WITH ultimo_cliente AS (
        SELECT DISTINCT ON (empresa_id, cliente_pk) empresa_id, cliente_pk, nombre_cliente,
               tipo_cliente, nombre_comercial
        FROM sync.ventas_diarias
        WHERE empresa_id = p_empresa_id AND NOT is_deleted
        ORDER BY empresa_id, cliente_pk, source_updated_at DESC
    )
    INSERT INTO clientes (empresa_id, cliente_pk, nombre, tipo_cliente, comercial_cliente)
    SELECT empresa_id, cliente_pk, COALESCE(NULLIF(nombre_cliente, ''), 'Sin nombre cliente'),
           tipo_cliente, nombre_comercial
    FROM ultimo_cliente
    ON CONFLICT (empresa_id, cliente_pk) DO UPDATE SET
        nombre = EXCLUDED.nombre, tipo_cliente = EXCLUDED.tipo_cliente,
        comercial_cliente = EXCLUDED.comercial_cliente;

    INSERT INTO ventas_historicas (
        producto_id, cliente_id, fecha_venta, cantidad_vendida, precio_unitario, ingreso_total,
        margen_bruto_eur, margen_bruto_pct, margen_destino_eur, margen_destino_pct,
        kd, comercial_factura, stock_disponible, sync_source_key
    )
    SELECT p.id, c.id, v.fecha_venta, v.unidades_venta::INTEGER,
           CASE WHEN v.unidades_venta <> 0 THEN v.ventas_eur / v.unidades_venta ELSE 0 END,
           v.ventas_eur, v.margen_bruto_eur,
           CASE WHEN v.ventas_eur = 0 THEN 0 ELSE v.margen_bruto_eur / v.ventas_eur * 100 END,
           COALESCE(v.margen_destino_eur, 0),
           CASE WHEN v.ventas_eur = 0 OR v.margen_destino_eur IS NULL THEN 0 ELSE v.margen_destino_eur / ABS(v.ventas_eur) * 100 END,
           v.kd, v.comercial_factura, 0, v.source_record_key
    FROM sync.ventas_diarias v
    JOIN productos p ON p.empresa_id = v.empresa_id AND p.sku = v.articulo_pk
    JOIN clientes c ON c.empresa_id = v.empresa_id AND c.cliente_pk = v.cliente_pk
    WHERE v.empresa_id = p_empresa_id AND NOT v.is_deleted
      AND v.unidades_venta = trunc(v.unidades_venta)
    ON CONFLICT (sync_source_key) WHERE sync_source_key IS NOT NULL DO UPDATE SET
        producto_id = EXCLUDED.producto_id, cliente_id = EXCLUDED.cliente_id,
        fecha_venta = EXCLUDED.fecha_venta, cantidad_vendida = EXCLUDED.cantidad_vendida,
        precio_unitario = EXCLUDED.precio_unitario, ingreso_total = EXCLUDED.ingreso_total,
        margen_bruto_eur = EXCLUDED.margen_bruto_eur, margen_bruto_pct = EXCLUDED.margen_bruto_pct,
        margen_destino_eur = EXCLUDED.margen_destino_eur, margen_destino_pct = EXCLUDED.margen_destino_pct,
        kd = EXCLUDED.kd, comercial_factura = EXCLUDED.comercial_factura;

    DELETE FROM ventas_historicas v
    USING sync.ventas_diarias s
    WHERE v.sync_source_key = s.source_record_key
      AND s.empresa_id = p_empresa_id AND s.is_deleted;

    INSERT INTO inventario_historico (
        producto_id, fecha_inventario, inventario_eur, unidades_inventario, sync_source_key
    )
    SELECT p.id, i.fecha_inventario, i.inventario_eur, i.unidades_inventario, i.source_record_key
    FROM sync.inventario_diario i
    JOIN productos p ON p.empresa_id = i.empresa_id AND p.sku = i.articulo_pk
    WHERE i.empresa_id = p_empresa_id AND NOT i.is_deleted
    ON CONFLICT (sync_source_key) WHERE sync_source_key IS NOT NULL DO UPDATE SET
        producto_id = EXCLUDED.producto_id, fecha_inventario = EXCLUDED.fecha_inventario,
        inventario_eur = EXCLUDED.inventario_eur, unidades_inventario = EXCLUDED.unidades_inventario;

    DELETE FROM inventario_historico i
    USING sync.inventario_diario s
    WHERE i.sync_source_key = s.source_record_key
      AND s.empresa_id = p_empresa_id AND s.is_deleted;

    DELETE FROM inventario_snapshot i
    USING productos p
    WHERE i.producto_id = p.id AND p.empresa_id = p_empresa_id;

    INSERT INTO inventario_snapshot (producto_id, stock_disponible, inventario_eur)
    SELECT DISTINCT ON (ih.producto_id) ih.producto_id, ih.unidades_inventario, ih.inventario_eur
    FROM inventario_historico ih
    JOIN productos p ON p.id = ih.producto_id
    WHERE p.empresa_id = p_empresa_id
    ORDER BY ih.producto_id, ih.fecha_inventario DESC;
END;
$$;

COMMIT;
