# Plan de mejora UX — áreas analíticas

## Objetivo

Hacer que las cuatro vistas analíticas ayuden a decidir con menos pasos: el
usuario debe saber qué datos está viendo, qué filtros están activos y qué
acción puede realizar a continuación, sin alterar cálculos ni fuentes de datos.

## Principios aplicados

1. **Contexto visible.** Período, cobertura, recuento y filtros activos se
   muestran junto al resultado que afectan.
2. **Controles predecibles.** Los selectores segmentados indican el estado con
   `aria-pressed`; los botones de reinicio y recarga tienen texto o etiqueta
   accesible.
3. **Filtros recuperables.** Cada superficie presenta el número de criterios
   activos y permite limpiarlos en un paso, sin perder datos ni ejecutar una
   operación destructiva.
4. **Datos reales antes que decoración.** PM y sección del catálogo se derivan
   del inventario cargado. Las métricas, rangos y comparables continúan llegando
   de las APIs existentes.
5. **Estados explícitos.** Carga, error, cero resultados y datos parciales se
   distinguen con texto accionable, además de color.

## Entrega aplicada en esta versión

| Área | Mejora | Resultado esperado |
| --- | --- | --- |
| Dashboard | Resumen de filtros activos y limpieza inmediata | La lectura ejecutiva deja claro el segmento que gobierna KPIs y gráficos. |
| Catálogo ABCXYZ | Opciones PM/sección derivadas del catálogo, resumen de criterios y restablecimiento | No hay filtros ficticios ni necesidad de recargar para volver al universo. |
| Ventas | Resumen visible de consulta, filtros activos y controles accesibles de tabla | Se diferencia el total global del conjunto filtrado y se recupera una exploración. |
| Marginalidad | Contexto MG/MGD y ventana, botones semánticos y reintento seguro | La métrica financiera activa y su comparable son inequívocos. |

## Próximas mejoras priorizadas

1. Persistir filtros en la URL para compartir una misma lectura entre usuarios.
2. Añadir presets guardados por usuario (por ejemplo, “PM crítico” o “últimos
   30 días”) sin mezclar empresas ni exponer filtros globales.
3. Ofrecer exportación contextual en Ventas y Marginalidad solo sobre datos que
   el backend haya calculado y autorizado para la empresa activa.
4. Validar las cuatro superficies en móvil y con lectores de pantalla sobre una
   sesión autenticada de producción antes de modificar el modo oscuro.
