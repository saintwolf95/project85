# Data Engineering

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/integrations`; componente: `frontend/src/pages/DataEngineering.tsx`; backend: `app/routers/data_import.py`.
- Es la entrada de datos reales. Orden recomendado: `fivemin_ventas`, `fivemin_inventario` y catálogo independiente opcional.
- Ventas crea/actualiza catálogo, clientes y `ventas_historicas`. Inventario crea/actualiza catálogo, guarda `inventario_historico` y actualiza el snapshot actual con la fecha más reciente.
- La carga incluye validación previa, plantilla descargable, progreso, ámbito de ventas operativas/FY anterior y opción controlada de reemplazo.
- Las filas de totales/filtros de Power BI se ignoran y se informa cuántas. No convertirlas en errores de campos obligatorios.
- Tras una carga correcta, invalidar caché y sincronizar métricas para Dashboard, ABCXYZ, previsión, Copilot y agentes. No dejar una carga que solo actualice una pestaña.
- El porcentaje MG/MGD fuera de rango negativo se ancla a `-200%`; no se descarta la línea ni se borra el margen EUR subyacente.

## Actualización v1.32

- Se admiten CSV/XLSX de hasta 50 MB y XLSX con hasta 512 MB internos. La protección inspecciona también un máximo de 2.000 componentes y ratio de compresión 200:1.
- El límite de filas continúa en 100.000 para proteger la memoria durante validación y carga. Los mensajes de interfaz deben coincidir con estos límites.
