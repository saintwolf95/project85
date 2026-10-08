# Guía de Importación

## Estado verificado · 08/10/2026 · v1.60

- Verificado `DataImportGuide.tsx`: guía visual independiente de la ejecución de cargas. Su contrato debe coincidir con plantillas y validadores de Data Engineering.
- Antes de cambiar cabeceras o ejemplos, contrastar `DATASET_CONFIG` en `app/routers/data_import.py`. Diferenciar error bloqueante (incluido MGD superior a MG) de advertencias de calidad y filas de pie ignoradas.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/import-guide`; componente: `frontend/src/pages/DataImportGuide.tsx`.
- Objetivo: documentación visual de archivos, columnas, formatos y secuencia de carga. No ejecuta importaciones.
- Debe mantenerse sincronizada con `DataEngineering.tsx` y las definiciones/validadores de `app/routers/data_import.py`.
- Documentar los dos archivos reales de Power BI: ventas e inventario, sus cabeceras exactas y el tratamiento de filas de totales y filtros.
- Indicar que ventas puede cubrir el ejercicio fiscal y que inventario tiene histórico desde el 06/08/2026; no afirmar disponibilidad previa de stock histórico.
- Cualquier cambio de requisito, plantilla, validación o cálculo debe actualizar también esta guía en la misma versión.

## Actualización v1.32

La guía y Data Engineering informan un máximo de 50 MB por CSV/XLSX y 200.000 filas. El XLSX puede ocupar hasta 512 MB internamente siempre que no presente un patrón de compresión anómalo.

## Actualización v1.33

Los CSV pueden contener nombres con comas y medidas en pulgadas siempre que estén correctamente entrecomillados. La importación debe conservar las 21 columnas de ventas sin desplazamientos.

## Actualización v1.34

La guía debe explicar que las columnas `ClientePK` y `Nombre Cliente` deben existir, aunque sus celdas pueden estar vacías. La importación asigna `SIN-CLIENTE` y `Sin nombre cliente` cuando no hay identificación disponible.
