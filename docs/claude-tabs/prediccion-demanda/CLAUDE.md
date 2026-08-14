# Predicción Demanda

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/forecast`; componente: `frontend/src/pages/DemandForecasting.tsx`.
- Objetivo: proyecciones descriptivas a 30, 60 y 90 días a partir de ADS y precio unitario.
- Consume `getInventoryAbc(1, 1000)` y agrega localmente por Product Manager, familia o código de artículo.
- La proyección actual es una extrapolación de la demanda media diaria; no prometer un modelo estadístico de forecasting ni causalidad que el código no calcula.
- Las gráficas muestran los 20 grupos de mayor proyección. Si se cambia el tamaño de muestra, revisar el rendimiento y explicar su cobertura.
- Depende de ventas e inventario disponibles en las métricas; manejar estado vacío y errores de API sin presentar ceros como resultado real.

