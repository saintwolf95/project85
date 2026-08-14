# Guía de Importación

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/import-guide`; componente: `frontend/src/pages/DataImportGuide.tsx`.
- Objetivo: documentación visual de archivos, columnas, formatos y secuencia de carga. No ejecuta importaciones.
- Debe mantenerse sincronizada con `DataEngineering.tsx` y las definiciones/validadores de `app/routers/data_import.py`.
- Documentar los dos archivos reales de Power BI: ventas e inventario, sus cabeceras exactas y el tratamiento de filas de totales y filtros.
- Indicar que ventas puede cubrir el ejercicio fiscal y que inventario tiene histórico desde el 06/08/2026; no afirmar disponibilidad previa de stock histórico.
- Cualquier cambio de requisito, plantilla, validación o cálculo debe actualizar también esta guía en la misma versión.

