# Data Engineering

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/integrations`; componente: `frontend/src/pages/DataEngineering.tsx`; backend: `app/routers/data_import.py`.
- Es la entrada de datos reales. Los únicos flujos visibles son `fivemin_ventas` y `fivemin_inventario`; el catálogo se crea y actualiza automáticamente desde esas cargas.
- Ventas crea/actualiza catálogo, clientes y `ventas_historicas`. Inventario crea/actualiza catálogo, guarda `inventario_historico` y actualiza el snapshot actual con la fecha más reciente.
- La carga incluye validación previa, plantilla descargable, progreso, ámbito de ventas operativas/FY anterior y opción controlada de reemplazo.
- Las filas de totales/filtros de Power BI se ignoran y se informa cuántas. No convertirlas en errores de campos obligatorios.
- Tras una carga correcta, invalidar caché y sincronizar métricas para Dashboard, ABCXYZ, previsión, Copilot y agentes. No dejar una carga que solo actualice una pestaña.
- El porcentaje MG/MGD fuera de rango negativo se ancla a `-200%`; no se descarta la línea ni se borra el margen EUR subyacente.

## Actualización v1.32

- Se admiten CSV/XLSX de hasta 50 MB y XLSX con hasta 512 MB internos. La protección inspecciona también un máximo de 2.000 componentes y ratio de compresión 200:1.
- El límite de filas es 200.000 para proteger la memoria durante validación y carga y admitir lotes fiscales de Power BI. Los mensajes de interfaz deben coincidir con estos límites.

## Actualización v1.33

El lector CSV conserva correctamente campos entrecomillados con comas y pulgadas. Antes de una carga fraccionada, dividir siempre por fechas completas para que dos partes no compartan una misma clave diaria de venta.

## Actualización v1.34

Las ventas con celdas de cliente vacías son válidas: sin `ClientePK` se asigna el cliente técnico `SIN-CLIENTE` y el nombre `Sin nombre cliente`; si solo falta el nombre, se conserva el identificador original y se usa el nombre de respaldo.

## Actualización v1.35

La sustitución de ventas se limita al intervalo entre la primera y la última fecha del archivo. Debe conservar ventas de otros ejercicios y no borrar clientes; la interfaz tiene que explicar este alcance antes de cargar.

## Actualización v1.46 — actualización incremental por periodo

- La interfaz debe ofrecer una sección explícita de actualización incremental para ventas e inventario. Admite desde un día hasta cualquier periodo personalizado; las fechas se infieren de `Fecha`, no de un selector manual separado.
- Antes de cargar se muestran las fechas detectadas; tras una carga correcta, se confirma ese intervalo y que los registros externos se han conservado.
- Ventas incrementales actualizan la misma clave diaria (fecha, artículo, cliente, KD y comercial). Inventario actualiza fecha y artículo, conserva snapshots históricos previos y usa la fecha más reciente como stock actual.

## Actualización v1.56 — decimales nativos en XLSX

- El lector XLSX debe mantener los valores numéricos nativos hasta validar las filas. Convertirlos a texto antes de `_parse_number` convierte erróneamente un decimal como `792.785` en `792785` bajo la heurística española de miles.
- La sustitución por período debe usarse para recargar los bloques históricos afectados, después de validar que los totales coinciden con Power BI.

## Actualización v1.57 — sustitución disponible para histórico FY

- El alcance “Histórico del año fiscal anterior” no bloquea la sustitución de ventas. El checkbox debe estar disponible para cualquier carga de ventas, incluidos los bloques FY2025.
- Con sustitución activa, se reemplazan solo las ventas entre la primera y la última fecha del archivo validado. Se mantienen ventas fuera del rango, clientes, catálogo e inventario.

## Actualización v1.58 — tamaño de lote FY2025

- El límite por archivo CSV/XLSX es 200.000 filas. No reducirlo sin una medición de capacidad que contemple los lotes fiscales exportados de Power BI.
- La validación sigue descartando pies de totales y filtros de Power BI antes de contabilizar los registros operativos.
