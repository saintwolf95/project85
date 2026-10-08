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

## Actualización v1.45 — estilo visual del modo claro

- La actualización es exclusivamente visual: conserva la matriz, las consultas, filtros, reglas ABCXYZ, detalle por cuadrante, alertas y exportación XLSX existentes.
- Aplicar tipografía de sistema, superficies blancas, fondo secundario `#F5F5F7`, azul `#0071E3` para navegación y acciones, y bordes de baja opacidad. El modo oscuro actual se mantiene sin rediseñarlo.
- Los KPIs, matriz, distribución, catálogo y alertas se leen como una herramienta de decisión: tarjetas con profundidad mínima, pestañas segmentadas, tablas de encabezado en frase y cifras con `tabular-nums`.
- No teñir las filas de catálogo por estado. Los riesgos permanecen diferenciados mediante badges y valores semánticos, por lo que las comparativas de datos conservan su legibilidad.

## Actualización v1.53 — recordatorio de clasificación

- El botón `Cómo se clasifica` abre una guía con los cortes reales definidos en `app/semantic_metrics.py`: ABC usa ventas netas EUR acumuladas de 90 días (A 80 %, B hasta 95 %, C restante) y XYZ el valor actual de inventario con los mismos cortes (X, Y, Z).
- La explicación debe indicar que se trata de contribución acumulada, no de porcentaje individual por SKU; los artículos sin ventas son C y los que no tienen snapshot son `N/D` para XYZ.

## Actualización v1.59 — leyenda permanente y foco de gestión

- `Matrix3x3` muestra los literales de prioridad dentro de cada celda y una leyenda visible 80/15/5 para ventas e inventario. `AbcxyzLegend` ofrece un desplegable accesible para leer el significado de todas las letras y colores, incluido el estado sin inventario real.
- Los ejes corresponden a la disposición real: filas ABC por ventas 90D y columnas XYZ por inventario actual. XYZ no representa variabilidad de demanda.
- La paleta semántica compartida en `content/abcxyz.ts` se adapta a claro y oscuro. AX es prioridad estratégica; CX requiere revisar exceso potencial, sin afirmar una alerta confirmada. AY/AZ indican atención a disponibilidad, BX a capital y CY a rotación.
