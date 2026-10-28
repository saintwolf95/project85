# Data Engineering

## Estado verificado · 11/10/2026 · v1.72

- Verificados `/data-import/template/{dataset}`, `/validate`, `/load`, `/refresh-metrics` y `/status`. La carga es manual de archivos; la propuesta SharePoint no está implementada.
- Mantener 200.000 filas y 50 MB por archivo, decimales XLSX nativos y sustitución acotada por fechas. `MGD > MG` es una advertencia de calidad, no un bloqueo; los porcentajes agregados se recalculan desde importes EUR.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/integrations`; componente: `frontend/src/pages/DataEngineering.tsx`; backend: `app/routers/data_import.py`.
- Es la entrada de datos reales. Los únicos flujos visibles son `fivemin_ventas` y `fivemin_inventario`; el catálogo se crea y actualiza automáticamente desde esas cargas.
- Ventas crea/actualiza catálogo, clientes y `ventas_historicas`. Inventario crea/actualiza catálogo, guarda `inventario_historico` y actualiza el snapshot actual con la fecha más reciente.
- La carga incluye validación previa, plantilla descargable, progreso, ámbito de ventas operativas/FY anterior y opción controlada de reemplazo.
- Las filas de totales/filtros de Power BI se ignoran y se informa cuántas. No convertirlas en errores de campos obligatorios.
- Tras una carga correcta, invalidar caché y sincronizar métricas para Dashboard, ABCXYZ, previsión, Copilot y agentes. No dejar una carga que solo actualice una pestaña.
- El porcentaje MG/MGD fuera de rango negativo se ancla a `-200%`; no se descarta la línea ni se borra el margen EUR subyacente.

## Actualización v1.69-v1.72 — carga manual SQL y lotes

- La ruta interina oficial es **Carga Manual SQL**: el equipo con acceso a `DATA01` ejecuta `scripts/export_sqlserver_manual_batches.ps1`, que lee exclusivamente `dbo.vw_ventas_supabase` y `dbo.vw_inventario_supabase`. La Conexión Oficial SQL sigue pendiente de trámite.
- El script crea ventas mensuales e inventario semanal con nombres `fivemin_ventas_YYYY-MM-DD_YYYY-MM-DD.csv` y `fivemin_inventario_YYYY-MM-DD_YYYY-MM-DD.csv`. Desde v1.72 normaliza la fecha exportada como ISO `YYYY-MM-DD`.
- `DataEngineering.tsx` admite varios CSV/XLSX. Ordena por la fecha inicial del nombre y llama a `/data-import/load` de forma secuencial. Cada archivo se confirma por separado; al terminar se llama una vez a `/data-import/refresh-metrics` para reconstruir métricas, cachés y superficies analíticas.
- Si falla un archivo, el lote se detiene sin borrar los anteriores, muestra las primeras incidencias y permite reanudar desde ese punto. La sustitución por periodo se desactiva para lotes; solo es válida en carga individual deliberada.
- El parser acepta fechas Excel, ISO, `DD/MM/YYYY`, `MM/DD/YYYY` y variantes con hora de `Export-Csv`. Para nombres estándar de lote, el rango del nombre resuelve fecha ambigua. No exigir al usuario regenerar un CSV histórico solo porque incluya `00:00:00`.
- `MGD > MG` se conserva y genera advertencia de calidad. Nunca recortar el valor de origen ni convertir esta advertencia en error bloqueante sin una decisión explícita de negocio.

## Actualización v1.32

- Se admiten CSV/XLSX de hasta 50 MB y XLSX con hasta 512 MB internos. La protección inspecciona también un máximo de 2.000 componentes y ratio de compresión 200:1.
- El límite de filas es 200.000 para proteger la memoria durante validación y carga y admitir lotes fiscales de Power BI. Los mensajes de interfaz deben coincidir con estos límites.

## Actualización v1.33

El lector CSV conserva correctamente campos entrecomillados con comas y pulgadas. Antes de una carga fraccionada, dividir siempre por fechas completas para que dos partes no compartan una misma clave diaria de venta.

## Actualización v1.34

Las ventas con celdas de cliente vacías son válidas: sin `ClientePK` se asigna el cliente técnico `SIN-CLIENTE` y el nombre `Sin nombre cliente`; si solo falta el nombre, se conserva el identificador original y se usa el nombre de respaldo.

Las ventas con `ArticuloPK` vacío también son válidas: se conservan bajo el SKU técnico único `SIN_SKU` y se muestra una advertencia. Esta excepción no aplica a inventario ni a catálogo, donde el SKU sigue siendo obligatorio.

Las ventas sin `Nombre Articulo` se conservan con `SIN_NOMBRE_ARTICULO` y advertencia. No aplicar esta normalización al catálogo ni al inventario.

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

## Actualización v2.10 local — recálculo de ventas compartidas

- Las cargas web de ventas marcan las fechas afectadas y recalculan la capa diaria dentro de la transacción de carga, incluso con el recálculo ABC/XYZ diferido. La migración marca los cambios externos y el proceso del backend reconstruye pendientes en segundo plano.
- El endpoint de estado incorpora `analitica_compartida`, con revisión de origen, revisión calculada, fechas y estado. No interpretar las fechas con movimientos como prueba de cobertura completa. Antes de publicar, validar la migración, los permisos del rol de escritura y los triggers en PostgreSQL con una copia representativa.
