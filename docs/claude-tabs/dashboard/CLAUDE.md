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

## Actualización v1.38 — presentación de importes

- Mostrar ventas, MGD e inventario en notación compacta dentro de las tarjetas principales para mantenerlos legibles en escritorio estrecho y tablet. Las variaciones conservan el valor absoluto completo.
- Mantener `min-w-0` en los paneles de gráficos para que Recharts calcule correctamente el ancho disponible.

## Actualización v1.39 — contenedores de gráficos

- Cada `ResponsiveContainer` debe declarar `minWidth={0}` además del ancho y alto relativos, para evitar advertencias y renders transitorios con dimensiones negativas al montar la vista.

## Actualización v1.40 — dimensión inicial

- Mantener una `initialDimension` positiva en los gráficos responsive; se usa solo hasta la primera medición real del contenedor y evita avisos durante el montaje.

## Actualización v1.41 — filtros y detalle comercial

- Los filtros de familia, marca, Familia/Marca y sección son acumulativos y afectan KPIs, inventario, impulsores, serie mensual, matriz ABCXYZ y tabla de detalle.
- El interruptor de comparación anual del gráfico muestra ventas del mismo intervalo un año antes y una tabla mensual con diferencia absoluta y porcentual.
- La subvista Detalle de ventas permite alternar entre comercial de factura, cliente, familia, marca y sección. Mantener búsqueda, ordenación, formato condicional y un máximo de 100 segmentos devueltos por SQL.

## Actualización v1.42 — líderes y clientes inequívocos

- Las tarjetas de mayor facturación, crecimiento y caída proceden del resumen calculado por backend sobre todos los segmentos; las 100 filas visibles siguen priorizadas por variación absoluta.
- No mostrar una caída como crecimiento ni un crecimiento como caída cuando no existe un segmento del signo solicitado.
- En la dimensión Cliente, agrupar por `ClientePK` y mostrar el nombre como etiqueta complementaria para impedir que clientes homónimos se fusionen.
