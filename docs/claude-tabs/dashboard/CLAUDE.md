# Dashboard

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/`; componente: `frontend/src/pages/Home.tsx`.
- Objetivo: resumen operativo de inventario, alertas e insights, con filtros locales por ABC, familia, Product Manager y sección.
- Consume `getDashboardKpis`, `getInventoryAbc` y `getAiInsights` desde `frontend/src/services/api.ts`; backend: `app/routers/analytics.py`.
- Componentes principales: `DashboardMetrics`, `DashboardCharts`, `GaugeChart`, `ProductModal` e `InsightModal`.
- El listado cargado se limita a 500 registros para el resumen visual. No usarlo como fuente completa de catálogo: Intelligence ABCXYZ carga el catálogo analítico.
- Mantener los filtros coherentes entre KPIs, gráficos, tabla y modales. Los importes se formatean en formato europeo.

## Actualización v1.37 — centro de decisión gerencial

- La fuente principal es `getExecutiveDashboard` → `GET /analytics/dashboard-executive`; no reconstruir agregados financieros desde los 500 productos del resumen.
- Los períodos disponibles son FYTD, últimos 90 días y últimos 30 días. Toda variación debe indicar el período comparable exacto y advertir si su cobertura histórica es incompleta.
- KPIs principales: ventas netas, MGD y ratio sobre ventas, valor del último snapshot de inventario y disponibilidad de Clase A. Complementar con clientes/SKU con venta, margen bruto y capital Clase C.
- Los módulos de decisión muestran principal caída y crecimiento por familia, capital sin ventas 90D, evolución mensual y mapa ABCXYZ alternable por inventario EUR, ventas 90D o número de SKU.
- Las opciones del filtro de familia vienen del backend. No mantener catálogos o variaciones porcentuales ficticias en el componente.
- La caché del Dashboard dura cinco minutos y se invalida al finalizar una importación; su clave siempre incluye empresa, período y familia.
