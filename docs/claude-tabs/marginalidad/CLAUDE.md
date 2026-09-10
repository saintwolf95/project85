# Marginalidad

Hereda las reglas del `CLAUDE.md` raíz, incluido el versionado obligatorio.

- Ruta principal: `/marginalidad`; ficha de entidad: `/marginalidad/:tipo/:id`.
- Backend: `app/margin_service.py` y `app/routers/margin.py`. No trasladar líneas de venta a Python para agregarlas.
- MG usa `margen_bruto_eur`; MGD usa `margen_destino_eur` e incorpora gastos financieros, de transporte y logística de almacén.
- Todo porcentaje es ponderado: suma de margen / suma de ventas netas del mismo conjunto. Con ventas cero o negativas se devuelve nulo y la interfaz muestra `—`.
- La concentración usa euros. Los negativos no se ocultan ni se recortan: el Top 10 puede superar el 100 % del total.
- Reutilizar señales de margen de Control IA; no duplicar detectores ni permitir SQL generado por IA.
