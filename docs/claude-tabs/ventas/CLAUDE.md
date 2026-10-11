# Ventas

## Estado verificado · 11/10/2026 · v1.82

- Ruta: `/sales`; componente: `frontend/src/pages/Sales.tsx`.
- Objetivo: explorar la venta real por fecha, artículo, cliente y las dimensiones comerciales sin reconstruir cálculos desde una muestra del navegador.
- API: `GET /analytics/sales-explorer` y `GET /analytics/sales-explorer/options` en `app/routers/analytics.py`. Cliente: `frontend/src/services/api.ts`.
- El detalle se agrupa por fecha, artículo, cliente, KD y comercial de factura para evitar duplicar una misma combinación operativa. Se muestran como atributos producto, familia, marca, sección, Product Manager, tipo de cliente y comerciales.
- Los filtros son: rango de fechas, búsqueda por artículo/SKU/cliente, familia, marca, sección, Product Manager, tipo de cliente, KD, comercial asignado y comercial de factura. La búsqueda cubre los valores de alta cardinalidad; no cargar listas masivas de SKU o clientes.
- Los KPI se calculan sobre todos los hechos filtrados: ventas netas, unidades, margen bruto, MGD, SKU con venta y clientes. `margen_pct = SUM(margen) / SUM(ventas)` y `mgd_pct = SUM(MGD) / ABS(SUM(ventas))`; no promediar porcentajes de filas.
- El backend usa parámetros vinculados, lista blanca de ordenación, `empresa_id` y un máximo de 200 filas por página. No convertir estos controles en SQL generado desde el navegador.
- La cláusula `WHERE` añade solamente los filtros con valor. Así, una carga inicial no envía `NULL` sin tipo al pooler PostgreSQL; las columnas vienen de un catálogo cerrado y los valores siguen vinculados.

Índice común: [pestañas del sidebar](../README.md). Hereda las reglas de publicación, datos y seguridad del `CLAUDE.md` raíz.
