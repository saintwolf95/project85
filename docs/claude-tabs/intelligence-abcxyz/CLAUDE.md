# Intelligence ABCXYZ

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/inventory`; componente: `frontend/src/pages/Intelligence.tsx`.
- Objetivo: catálogo interactivo, matriz 3x3 y alertas de riesgo para decisiones de inventario.
- Consume `getInventoryAbc` y `getDashboardKpis`; backend: `app/routers/analytics.py` y cálculo en `app/services.py`.
- Pestañas internas: vista general, catálogo y alertas de riesgo. Incluye filtros, paginación local, detalle por cuadrante y exportación XLSX seleccionando columnas.
- La página necesita el catálogo completo para matriz y filtros; solicita hasta 20.000 SKU. No rebajar el límite de la API por debajo de las cargas reales.
- ABC representa ventas EUR de 90 días; XYZ usa inventario EUR actual. Explicar la falta de XYZ si no existe inventario cargado, sin simularlo.
- Mantener sin animación los gráficos de chat y evitar recargas visuales al escribir en el Copilot; los avisos de tamaño de Recharts no son un error de datos.

## Actualización v1.43

- Los filtros del catálogo son datos derivados de `inventoryData` mediante `useMemo`; no conservar una segunda copia sincronizada en estado.
- Agregar una sola vez por familia los datos del gráfico de riesgos y reutilizar el resultado para barras y colores.
- Las exportaciones XLSX deben usar claves tipadas de `ProductMetrics`, sin accesos dinámicos mediante `any`.
