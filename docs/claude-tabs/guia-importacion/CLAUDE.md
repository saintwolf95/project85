# Guía de Importación

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/import-guide`; componente: `frontend/src/pages/DataImportGuide.tsx`.
- Objetivo: documentación visual de archivos, columnas, formatos y secuencia de carga. No ejecuta importaciones.
- Debe mantenerse sincronizada con `DataEngineering.tsx` y las definiciones/validadores de `app/routers/data_import.py`.
- Documentar los dos archivos reales de Power BI: ventas e inventario, sus cabeceras exactas y el tratamiento de filas de totales y filtros.
- Indicar que ventas puede cubrir el ejercicio fiscal y que inventario tiene histórico desde el 06/08/2026; no afirmar disponibilidad previa de stock histórico.
- Cualquier cambio de requisito, plantilla, validación o cálculo debe actualizar también esta guía en la misma versión.

## Actualización v1.32

La guía y Data Engineering informan un máximo de 50 MB por CSV/XLSX y 100.000 filas. El XLSX puede ocupar hasta 512 MB internamente siempre que no presente un patrón de compresión anómalo.

## Actualización v1.33

Los CSV pueden contener nombres con comas y medidas en pulgadas siempre que estén correctamente entrecomillados. La importación debe conservar las 21 columnas de ventas sin desplazamientos.

## Actualización v1.34

La guía debe explicar que las columnas `ClientePK` y `Nombre Cliente` deben existir, aunque sus celdas pueden estar vacías. La importación asigna `SIN-CLIENTE` y `Sin nombre cliente` cuando no hay identificación disponible.
