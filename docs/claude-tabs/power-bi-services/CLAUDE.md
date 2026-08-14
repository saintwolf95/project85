# Power BI Services

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/powerbi`; componente: `frontend/src/pages/PowerBiMock.tsx`.
- Es una maqueta visual de servicios y KPIs de Power BI; sus arrays locales no son fuente oficial de negocio.
- No mezclar estos datos de demostración con `fivemin_ventas` ni `fivemin_inventario`, ni usarlos para alimentar ABCXYZ o Copilot.
- Si se sustituye por una integración real, definir autenticación, aislamiento por empresa, refresco, manejo de errores y procedencia de cada KPI antes de retirar la etiqueta de maqueta.

