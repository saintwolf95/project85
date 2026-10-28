-- Agregados aditivos. No modifica ni elimina los hechos de ventas originales.
BEGIN;

CREATE TABLE IF NOT EXISTS shared_sales_state (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id),
    source_revision BIGINT NOT NULL DEFAULT 0,
    built_revision BIGINT NOT NULL DEFAULT 0,
    initialized BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ,
    coverage_start DATE,
    coverage_end DATE
);
CREATE TABLE IF NOT EXISTS shared_sales_dirty (
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    fecha_venta DATE NOT NULL,
    PRIMARY KEY (empresa_id, fecha_venta)
);
CREATE TABLE IF NOT EXISTS shared_sales_daily (
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    fecha_venta DATE NOT NULL,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cliente_key INTEGER NOT NULL,
    ingreso_total DOUBLE PRECISION NOT NULL,
    cantidad_vendida DOUBLE PRECISION NOT NULL,
    margen_bruto_eur DOUBLE PRECISION NOT NULL,
    margen_destino_eur DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (empresa_id, fecha_venta, producto_id, cliente_key)
);
CREATE INDEX IF NOT EXISTS ix_shared_sales_producto_fecha ON shared_sales_daily (empresa_id, producto_id, fecha_venta);
CREATE INDEX IF NOT EXISTS ix_shared_sales_cliente_fecha ON shared_sales_daily (empresa_id, cliente_key, fecha_venta);

-- Las tablas de transición evitan un trigger por cada fila importada. El
-- bloqueo de state serializa la publicación frente a escritores concurrentes.
CREATE OR REPLACE FUNCTION public.shared_sales_mark_new() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.shared_sales_state (empresa_id, source_revision)
    SELECT DISTINCT p.empresa_id, 1 FROM changed_new v JOIN public.productos p ON p.id=v.producto_id
    WHERE p.empresa_id IS NOT NULL ORDER BY p.empresa_id
    ON CONFLICT (empresa_id) DO UPDATE SET source_revision = public.shared_sales_state.source_revision + 1;
    INSERT INTO public.shared_sales_dirty (empresa_id, fecha_venta)
    SELECT DISTINCT p.empresa_id, v.fecha_venta FROM changed_new v JOIN public.productos p ON p.id=v.producto_id
    WHERE p.empresa_id IS NOT NULL AND v.fecha_venta IS NOT NULL ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.shared_sales_mark_old() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.shared_sales_state (empresa_id, source_revision)
    SELECT DISTINCT p.empresa_id, 1 FROM changed_old v JOIN public.productos p ON p.id=v.producto_id
    WHERE p.empresa_id IS NOT NULL ORDER BY p.empresa_id
    ON CONFLICT (empresa_id) DO UPDATE SET source_revision = public.shared_sales_state.source_revision + 1;
    INSERT INTO public.shared_sales_dirty (empresa_id, fecha_venta)
    SELECT DISTINCT p.empresa_id, v.fecha_venta FROM changed_old v JOIN public.productos p ON p.id=v.producto_id
    WHERE p.empresa_id IS NOT NULL AND v.fecha_venta IS NOT NULL ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.shared_sales_mark_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    INSERT INTO public.shared_sales_state (empresa_id, source_revision)
    SELECT DISTINCT p.empresa_id, 1 FROM (SELECT producto_id FROM changed_old UNION SELECT producto_id FROM changed_new) v
    JOIN public.productos p ON p.id=v.producto_id WHERE p.empresa_id IS NOT NULL ORDER BY p.empresa_id
    ON CONFLICT (empresa_id) DO UPDATE SET source_revision = public.shared_sales_state.source_revision + 1;
    INSERT INTO public.shared_sales_dirty (empresa_id, fecha_venta)
    SELECT DISTINCT p.empresa_id, v.fecha_venta FROM
      (SELECT producto_id, fecha_venta FROM changed_old UNION SELECT producto_id, fecha_venta FROM changed_new) v
    JOIN public.productos p ON p.id=v.producto_id WHERE p.empresa_id IS NOT NULL AND v.fecha_venta IS NOT NULL ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.shared_sales_mark_truncate() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.shared_sales_state SET source_revision=source_revision+1, initialized=FALSE;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS shared_sales_insert ON ventas_historicas;
CREATE TRIGGER shared_sales_insert AFTER INSERT ON ventas_historicas REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.shared_sales_mark_new();
DROP TRIGGER IF EXISTS shared_sales_delete ON ventas_historicas;
CREATE TRIGGER shared_sales_delete AFTER DELETE ON ventas_historicas REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION public.shared_sales_mark_old();
DROP TRIGGER IF EXISTS shared_sales_update ON ventas_historicas;
CREATE TRIGGER shared_sales_update AFTER UPDATE ON ventas_historicas REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.shared_sales_mark_update();
DROP TRIGGER IF EXISTS shared_sales_truncate ON ventas_historicas;
CREATE TRIGGER shared_sales_truncate AFTER TRUNCATE ON ventas_historicas FOR EACH STATEMENT EXECUTE FUNCTION public.shared_sales_mark_truncate();

-- El primer cálculo se hace en segundo plano. Mientras no haya una revisión
-- completa, o haya fechas pendientes, la vista utiliza los hechos originales.
INSERT INTO shared_sales_state (empresa_id)
SELECT DISTINCT p.empresa_id FROM ventas_historicas v JOIN productos p ON p.id=v.producto_id
WHERE p.empresa_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.shared_sales_effective WITH (security_invoker = true) AS
SELECT d.empresa_id, d.fecha_venta, d.producto_id, NULLIF(d.cliente_key, 0) AS cliente_id,
       d.ingreso_total, d.cantidad_vendida, d.margen_bruto_eur, d.margen_destino_eur
FROM public.shared_sales_daily d JOIN public.shared_sales_state s ON s.empresa_id=d.empresa_id
WHERE s.initialized AND s.source_revision=s.built_revision
  AND NOT EXISTS (SELECT 1 FROM public.shared_sales_dirty x WHERE x.empresa_id=d.empresa_id)
UNION ALL
SELECT p.empresa_id, v.fecha_venta, v.producto_id, v.cliente_id,
       v.ingreso_total, v.cantidad_vendida, v.margen_bruto_eur, v.margen_destino_eur
FROM public.ventas_historicas v JOIN public.productos p ON p.id=v.producto_id
WHERE NOT EXISTS (SELECT 1 FROM public.shared_sales_state s WHERE s.empresa_id=p.empresa_id
  AND s.initialized AND s.source_revision=s.built_revision
  AND NOT EXISTS (SELECT 1 FROM public.shared_sales_dirty x WHERE x.empresa_id=s.empresa_id));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='copilot_readonly') THEN
    GRANT SELECT ON public.shared_sales_state, public.shared_sales_dirty, public.shared_sales_daily, public.shared_sales_effective TO copilot_readonly;
  END IF;
END $$;
COMMIT;
