# Predicción Demanda

## Estado verificado · 08/10/2026 · v1.60

- Verificado `DemandForecasting.tsx`: recupera hasta 1.000 SKU, suma ADS por Product Manager/familia/artículo, calcula unidades = ADS × días e importe = suma(ADS × precio_unit) × días para 30/60/90 días.
- Ordena por unidades proyectadas a 90 días y conserva los 20 primeros grupos. Los dos KPI se calculan sobre esos 20 grupos, no sobre todo el catálogo. No describirlos como total global.
- Limitación actual: el fallo de API se registra en consola y puede dejar la vista sin datos; el requisito de mostrar un error explícito sigue pendiente. La documentación no implica que se haya implementado.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/forecast`; componente: `frontend/src/pages/DemandForecasting.tsx`.
- Objetivo: proyecciones descriptivas a 30, 60 y 90 días a partir de ADS y precio unitario.
- Consume `getInventoryAbc(1, 1000)` y agrega localmente por Product Manager, familia o código de artículo.
- La proyección actual es una extrapolación de la demanda media diaria; no prometer un modelo estadístico de forecasting ni causalidad que el código no calcula.
- Las gráficas muestran los 20 grupos de mayor proyección. Si se cambia el tamaño de muestra, revisar el rendimiento y explicar su cobertura.
- Depende de ventas e inventario disponibles en las métricas; manejar estado vacío y errores de API sin presentar ceros como resultado real.

## Actualización v1.43

- Los grupos de previsión y los tooltips usan tipos explícitos; conservar el cálculo memoizado y no recurrir a `any` para admitir nuevas dimensiones.
