# Marginalidad

Hereda las reglas del `CLAUDE.md` raíz, incluido el versionado obligatorio.

- Ruta principal: `/marginalidad`; ficha de entidad: `/marginalidad/:tipo/:id`.
- Backend: `app/margin_service.py` y `app/routers/margin.py`. No trasladar líneas de venta a Python para agregarlas.
- MG usa `margen_bruto_eur`; MGD usa `margen_destino_eur` e incorpora gastos financieros, de transporte y logística de almacén.
- MGD nunca puede superar MG en una línea: si sucede, la exportación de PBI es inconsistente. El importador la rechaza con tolerancia técnica de 0,01 €; no compensar ni limitar los importes en esta pestaña. Las líneas ya cargadas se muestran con una advertencia y deben corregirse y recargarse por período.
- Todo porcentaje es ponderado: suma de margen / suma de ventas netas del mismo conjunto. Con ventas cero o negativas se devuelve nulo y la interfaz muestra `—`.
- Las ventanas visibles son Año fiscal a la fecha (1 de mayo a última venta), Últimos 90 días y Últimos 30 días. La comparación anterior conserva exactamente la misma duración.
- La concentración usa euros. Los negativos no se ocultan ni se recortan: el Top 10 puede superar el 100 % del total.
- Reutilizar señales de margen de Control IA; no duplicar detectores ni permitir SQL generado por IA.
