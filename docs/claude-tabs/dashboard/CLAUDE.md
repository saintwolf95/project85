# Dashboard

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/`; componente: `frontend/src/pages/Home.tsx`.
- Objetivo: resumen operativo de inventario, alertas e insights, con filtros locales por ABC, familia, Product Manager y sección.
- Consume `getDashboardKpis`, `getInventoryAbc` y `getAiInsights` desde `frontend/src/services/api.ts`; backend: `app/routers/analytics.py`.
- Componentes principales: `DashboardMetrics`, `DashboardCharts`, `GaugeChart`, `ProductModal` e `InsightModal`.
- El listado cargado se limita a 500 registros para el resumen visual. No usarlo como fuente completa de catálogo: Intelligence ABCXYZ carga el catálogo analítico.
- Mantener los filtros coherentes entre KPIs, gráficos, tabla y modales. Los importes se formatean en formato europeo.

