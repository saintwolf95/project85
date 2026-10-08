# Power BI Services

## Estado verificado · 08/10/2026 · v1.60

- Verificado `PowerBiMock.tsx`: usa arrays locales y estado visual; no consulta una conexión productiva de Power BI.
- La propuesta botón Power Automate → SharePoint → validación/carga BBDD está pendiente de definición de conexión, permisos y ejecución. No presentar como operativos el refresco, la exportación o la sincronización por ver controles en la maqueta.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/powerbi`; componente: `frontend/src/pages/PowerBiMock.tsx`.
- Es una maqueta visual de servicios y KPIs de Power BI; sus arrays locales no son fuente oficial de negocio.
- No mezclar estos datos de demostración con `fivemin_ventas` ni `fivemin_inventario`, ni usarlos para alimentar ABCXYZ o Copilot.
- Si se sustituye por una integración real, definir autenticación, aislamiento por empresa, refresco, manejo de errores y procedencia de cada KPI antes de retirar la etiqueta de maqueta.

## Actualización v1.43

- Los controles visuales de la maqueta que no correspondan a campos de formulario no deben representarse mediante etiquetas `label`; conservar semántica accesible aun cuando no tengan funcionalidad real.
