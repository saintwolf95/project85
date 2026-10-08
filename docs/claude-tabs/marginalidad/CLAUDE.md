# Marginalidad

## Estado verificado · 08/10/2026 · v1.60

- Verificados `Marginality.tsx`, `MarginEntity.tsx` y `/margin/overview`, `/concentration`, `/detail`, `/bridge`, `/entity/{tipo}/{entity_id}`, `/signals`.
- Selector MG/MGD; KPI, serie temporal, puente, concentración y señales enlazadas. El servicio expone participación Top 10 sobre total neto y sobre total positivo: distinguir los denominadores al narrarlos.
- El puente actual separa precio, coste y mix residual. El residuo no demuestra causalidad por sí mismo.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las reglas del `CLAUDE.md` raíz, incluido el versionado obligatorio.

- Ruta principal: `/marginalidad`; ficha de entidad: `/marginalidad/:tipo/:id`.
- Backend: `app/margin_service.py` y `app/routers/margin.py`. No trasladar líneas de venta a Python para agregarlas.
- MG usa `margen_bruto_eur`; MGD usa `margen_destino_eur` e incorpora gastos financieros, de transporte y logística de almacén.
- MGD nunca puede superar MG en una línea: si sucede, la exportación de PBI es inconsistente. El importador la rechaza con tolerancia técnica de 0,01 €; no compensar ni limitar los importes en esta pestaña. Las líneas ya cargadas se muestran con una advertencia y deben corregirse y recargarse por período.
- Todo porcentaje es ponderado: suma de margen / suma de ventas netas del mismo conjunto. Con ventas cero o negativas se devuelve nulo y la interfaz muestra `—`.
- Las ventanas visibles son Año fiscal a la fecha (1 de mayo a última venta), Últimos 90 días y Últimos 30 días. La comparación anterior conserva exactamente la misma duración.
- Al importar XLSX, una celda numérica conserva sus decimales nativos; no aplicar a esos valores la heurística de separadores reservada para texto. Si una carga anterior infló importes por esta causa, recargar el período original tras publicar la corrección.
- La concentración usa euros. Los negativos no se ocultan ni se recortan: el Top 10 puede superar el 100 % del total.
- Reutilizar señales de margen de Control IA; no duplicar detectores ni permitir SQL generado por IA.
