# AI Copilot

## Estado verificado · 27/10/2026 · v2.06

- Verificado `AiCopilot.tsx` y `app/routers/copilot.py`: chats creables, renombrables y eliminables; conversación exportable a PDF/XLSX/CSV mediante `/copilot/chats/{chat_id}/export`.
- La exportación de datos de un mensaje es independiente de exportar la conversación. Conserva contexto de negocio, selector de documentos LibrerIA, capacidades y modelo elegido.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

## Actualización v2.01 — perfiles Luna, Terra y Sol

- El selector presenta tres perfiles con nombres y objetivos explícitos: **Luna** (`gpt-5.6-luna`, razonamiento `none`) para consultas frecuentes; **Terra** (`gpt-5.6-terra`, `medium`) para análisis equilibrado y predeterminado; y **Sol** (`gpt-5.6-sol`, `high`) para análisis complejos.
- Los perfiles se resuelven exclusivamente en `app/copilot_service.py`; el navegador solo puede enviar `luna`, `terra` o `sol`. Durante el despliegue se normalizan los valores heredados `fast`, `thinking` y `ultra_thinking` para no romper una pestaña en caché.
- Si una cuenta no tiene acceso a un perfil, el servidor solo usa `COPILOT_MODEL_FALLBACK` (por defecto `gpt-4o`) ante un error explícito de modelo o permisos y registra el modelo efectivo; no oculta fallos de red ni de cuota con reintentos.
- Luna conserva respuestas concisas. Terra y Sol habilitan el dossier analítico para consultas gerenciales sobre ventas y rentabilidad, sin modificar consultas parametrizadas, límites, exportaciones ni aislamiento por `empresa_id`.

- Ruta: `/copilot`; componente: `frontend/src/pages/AiCopilot.tsx`; API: `app/routers/copilot.py`; lógica: `app/copilot_service.py` y `app/copilot_orchestrator.py`.
- Todos los perfiles deben responder desde los mismos datos verificados.
- Las consultas semánticas frecuentes se resuelven de forma determinista y parametrizada. Para SQL generado, conservar la validación estricta de solo lectura y `empresa_id`.
- El parser debe conservar el contexto en aclaraciones: métrica, período, agrupación, filtros y comparación. Admite fechas explícitas, año fiscal, últimos N días y meses escritos/abreviados, incluidos rangos entre años.
- Terra y Sol deben producir análisis de negocio con importes, comparación, impulsores por familia/marca/sección y Top 5 SKU cuando proceda. Evitar lenguaje genérico e inferencias causales no demostradas.
- Los mensajes están persistidos hasta 30 días en `copilot_chats` y `copilot_messages`; `creado_en` se guarda en UTC y se visualiza como `HH:mm dd-MM-yyyy` en local.
- Las marcas ocultas de exportación, tarjetas métricas y seguimientos clicables no deben exponerse en texto. Mantener exportación CSV/XLSX autorizada solo desde el mensaje correspondiente.
# Actualización v1.25

Cuando el Copilot o Cerebro del Negocio consuma hallazgos de Control IA, debe citar su evidence bundle verificado; no debe pedir al LLM que los calcule ni que invente explicaciones.

## Actualización v1.28 — herramientas compartidas

- `app/copilot_business_tools.py` es la única capa de herramientas de lectura compartida con Control IA: buscar señales, puente precio/volumen/mix y serie temporal usan consultas parametrizadas.
- Inyectar el diccionario semántico relevante antes de interpretar una pregunta. El catálogo de consultas validadas existente actúa como few-shot dinámico; no sustituirlo por SQL generado libremente.

## Actualización v1.29

`descomponer_variacion` devuelve el puente de precio, volumen y mix de SKU, además de los cinco clientes que más explican la variación por entidad.

## Actualización v1.30

El módulo no mantiene un catálogo de herramientas decorativo: las funciones compartidas se invocan desde las rutas deterministas reales del Copilot.

## Actualización v1.31

- Las respuestas gerenciales de Thinking usan ventanas comparables de igual duración, muestran sus fechas y ordenan el contenido como resumen, impulsores, movimientos, ABC, acciones y calidad.
- El frontend presenta KPI en tarjetas y las tablas Markdown con bordes, separación, ancho útil y desplazamiento horizontal. Mantener `copilot-markdown` al cambiar el renderizador.
- Limitar el cuerpo a hallazgos que cambien una decisión. No repetir tablas en prosa ni atribuir ventas negativas a precio, inventario o demanda sin evidencia adicional.

## Actualización v1.35

- Un desglose mensual devuelve en una sola consulta ventas netas, unidades, margen, MGD, SKU con venta, fecha mínima y fecha máxima de cada mes.
- La salida mensual es determinista: separa ejercicios fiscales, muestra cobertura por fila, suma las métricas y declara el último día real con datos. No permitir tablas con `N/D` si existen ventas diarias.
- El parser admite días expresados con meses naturales y no confunde `número de SKU con venta` con un filtro de artículo.

## Actualización v1.43

- La carga inicial recupera historial, contexto de negocio y capacidades en un único flujo; evita carreras entre el saludo y la disponibilidad de inventario.
- Los gráficos embebidos, errores de carga y componentes Markdown deben permanecer tipados y accesibles. No introducir `any`, bloques `catch` vacíos ni fondos clicables sin semántica de botón.
- Mantener identificadores locales estables con `crypto.randomUUID()` cuando la API todavía no haya devuelto un identificador persistente.

## Actualización v1.48 — interfaz Apple UI

- La presentación de AI Copilot usa superficies blancas/neutras, azul único para acciones y tipografía de sistema. No volver a introducir degradados, brillos decorativos ni colores por modelo.
- Los mensajes, gráficos, tablas Markdown, selector de modelo, exportaciones y modal Cerebro del negocio conservan su funcionalidad y accesibilidad; las variaciones y errores mantienen colores semánticos.
- El modo oscuro usa las mismas jerarquías visuales con superficies oscuras y foco visible, sin alterar la semántica de las respuestas.

## Actualización v2.02 — Copilot analítico verificable

- `copilot_chats.contexto_analitico` conserva el último `IntentoSemantico` validado (métrica, fechas, comparación, agrupación, filtros y límite). Un seguimiento reutiliza ese contrato, no cifras ni períodos extraídos de la prosa generada.
- El Copilot reconoce rankings de referencias/SKU, incluido “las 5 mejores referencias por margen absoluto”, y conserva el límite tras aclarar el período. La salida muestra SKU, producto, familia, ventas, MG, MGD y porcentaje de margen.
- Las comparativas explícitas `FY2025 vs FY2026` se traducen a ventanas equivalentes mayo–abril; cuando se solicita un corte, cada FY usa el mismo mes/día. Un día imposible se normaliza y se declara, por ejemplo 31 de septiembre → 30 de septiembre.
- Las comparativas mensuales y los totales conjuntos de ventas, MG y MGD se renderizan de forma determinista. Incluyen meses sin registros como cero, cobertura registrada y conciliación de la suma mensual.
- Las preguntas no reconocidas ya no pasan por una ruta de SQL libre generada por IA. El usuario recibe una orientación en lenguaje de negocio y las consultas conocidas siguen usando plantillas parametrizadas y aisladas por `empresa_id`.

### Comparativas visuales verificadas

- Las comparativas mensuales deterministas incluyen un gráfico doble `FY actual` frente a `FY comparable`, además de la tabla con cobertura y los totales conciliados.
- La serie del gráfico se genera en backend desde las mismas filas SQL autorizadas que construyen la tabla, conserva explícitamente los meses sin registros con valor cero y se transporta como marcador interno. El LLM no construye ni formatea esta visualización.
- El frontend elimina el marcador antes de renderizar, muestra leyenda, colores semánticos y valores formateados en euros, unidades o porcentaje. La exportación continúa usando exactamente la consulta parametrizada original.
- Los rankings de referencias/SKU se presentan también de forma determinista: tabla con SKU, producto, familia, ventas, MG, MGD y MG %, más un gráfico del criterio solicitado. No se delega al LLM la selección, suma ni ordenación de las filas.
- Ante un error de ejecución, no culpar al usuario ni pedir nombres de columnas o términos técnicos. La respuesta debe conservar la seguridad, indicar que se reintente y orientar a registrar la hora para diagnóstico si persiste.
- Los modelos de lenguaje no generan configuraciones JSON de gráficos. El frontend solo interpreta el marcador de gráfico emitido por backend, construido desde una consulta semántica autorizada; un bloque JSON del modelo permanece como texto y no se convierte en una visualización.
- Los informes gerenciales del dossier pasan un control de evidencia adicional: cada importe o porcentaje narrado debe existir en las filas del dossier SQL. Si no supera el control, se publica el informe determinista con las mismas secciones y tablas, no una aproximación del modelo.
- Los desgloses comerciales de ventas o rentabilidad por familia, marca, sección, Product Manager, cliente, tipo de cliente, comercial, KD o cuadrante se renderizan directamente desde SQL: tabla de hasta 20 segmentos por impacto, gráfico de los 12 principales y exportación completa. No dejar que Thinking resuma u omita segmentos por iniciativa propia.

### Seguimientos analíticos coherentes

- El siguiente mensaje de un chat reutiliza el contrato estructurado del último análisis validado. Si pide un nuevo desglose, mantiene el período y los filtros activos; un filtro o período explícito posterior los sustituye.
- La expresión «mismo período del año anterior», «ejercicio anterior» o «interanual» desplaza ambas fechas un año de forma equivalente; no la reemplaza por los 30/90 días inmediatamente anteriores.
- Las frases naturales de ranking («muéstrame los cinco peores») se resuelven como SKU, límite 5 y orden ascendente SQL. «Mejores» y «mayores» conservan el orden descendente.

### Puente comercial verificable

- Una pregunta sobre precio y volumen, o una solicitud de descomposición, muestra un puente determinista: ventas comparables, efecto volumen, mix, precio, variación observada y diferencia sin explicar.
- La diferencia sin explicar es la conciliación aritmética entre la variación observada y los tres efectos. Si excede 0,01 €, se etiqueta como pendiente de revisar, no como explicación de negocio.
- El gráfico de barras por familia, marca o sección se firma en backend a partir del puente calculado. Para otros desgloses comerciales se usa familia; no se filtran clientes o comerciales con una columna de producto por error.

### Visualizaciones y artefactos

- «Serie temporal» y «tendencia diaria» generan tabla determinista, cobertura, máximo, mínimo y gráfico de línea desde las filas diarias autorizadas. Las fechas del gráfico se formatean en español.
- Los informes gerenciales añaden un marcador firmado de evidence bundle. La interfaz ofrece «Descargar informe Excel» y «Descargar informe PDF» sin depender de la prosa generada por IA.
- El XLSX separa trazabilidad y cada bloque de evidencia en hojas; el PDF muestra hasta 20 filas por bloque e indica cuándo el Excel conserva filas adicionales. El exportador rechaza un marcador ausente o alterado.

### Informe ejecutivo presentable

- El PDF abre con período actual, comparable y trazabilidad; muestra KPI de ventas, variación, MG y MGD disponibles, además de un gráfico de ventas comparable frente a actual cuando ambos valores son no negativos.
- La hoja Resumen del XLSX incluye las mismas KPI antes de las pestañas de evidencia. Los estilos mejoran legibilidad sin modificar ningún valor calculado.
- `reportlab` es una dependencia declarada. Si faltase en un entorno, el endpoint devuelve 503 explicando que el Excel sigue disponible, en vez de entregar un 500 opaco.

## Actualización v2.03 — ejecución estable del dossier

- `execute_sql` no recibe ni registra `usage_context`: no invoca modelos y su contrato queda limitado a consulta parametrizada de solo lectura.
- El dossier pasa la telemetría a `interpret_results`, donde se ejecuta la llamada LLM. Así se registra el consumo real sin provocar un `TypeError` en los bloques SQL.

## Actualización v2.04 — acciones bajo preguntas

- Iconos Reintentar y Editar con nombre accesible, tooltip, foco de teclado y deshabilitados mientras se responde. Reintentar añade una pregunta con el modelo/contexto actuales: no reproduce una rama histórica ni sobreescribe respuestas.
- Editar prepara una copia en el editor y explica que se enviará como pregunta nueva. Permite cancelar; cambiar de chat limpia la edición. Antes de reemplazar un borrador se solicita confirmación.

## Diagnóstico y plan propuesto — pendiente de implementación

Actualización v2.05: inicio parcial del punto 1. Preguntas de ventas con dos o más de «clientes», «secciones», «familias», «marcas», «productos/artículos/referencias/SKU» o comerciales (asignado al cliente o de factura) ejecutan total y bloques separados usando el período y filtros compartidos. Si no se identifica el tipo de comercial, se pide aclaración. Los fallos aparecen explícitamente por bloque. Los desgloses combinados por meses y los rankings ascendentes se declaran no implementados en vez de omitirse o ordenarse incorrectamente. Se pueden combinar ventas, unidades, margen bruto y MGD; porcentajes de margen combinados requieren una pregunta separada. El caso de una sola dimensión mantiene la ruta anterior. Los límites explícitos por dimensión se conservan en el contrato y se aplican a SQL, con un máximo de 50; si no se indica uno se muestran hasta 20. XLSX/PDF reutilizan exactamente los bloques calculados y sus estados en un bundle firmado. El total muestra fechas extremas y días con registros, sin tratar la ausencia de movimientos diarios como prueba de un hueco de importación. Cuando no hay ningún registro en uno de los períodos se muestra N/D y no se calcula la variación; detectar la cobertura parcial sigue pendiente. Las siguientes fases siguen pendientes.

En comparaciones multidimensionales, los extremos de los registros se contrastan con las posiciones relativas de cada período. Si no coinciden, no se publica ni exporta una variación: se informa que puede ser consecuencia de actividad comercial o carga incompleta. Esto es una comprobación conservadora, no prueba de datos ausentes ni de integridad; el importador aún no registra cobertura certificada por fecha.

## Actualización v2.06 — avance de los puntos 1 y 2

- Las consultas múltiples admiten el desglose mensual junto a otras dimensiones: máximo 50 meses sin comparación o 12 al comparar; se informa si el rango excede el límite. Los meses ausentes no se rellenan como cero. Continúan pendientes los rankings ascendentes combinados y la certificación de cobertura.
- La pregunta gerencial se compara por defecto con el mismo tramo del año anterior y recorta el período al último día con ventas disponible; una comparación explícita se respeta. Las preguntas con filtros que el dossier global no aplica no deben usarlo. El resumen presenta hasta seis tarjetas: ventas, variación porcentual cuando es evaluable, MG, MGD, unidades y clientes activos identificados. Clientes activos: cliente distinto con al menos una venta positiva, sin contar la clave `SIN-CLIENTE`. El usuario ve fechas y último día con registros.
- Las tablas de clientes y productos se ordenan por venta actual; la de secciones recoge las diez menores variaciones. Proceden del dossier parametrizado. Si el resumen o un bloque falla, se informa en lugar de sustituirlo por cero. Ante tramos no equivalentes o base anterior no positiva no se publica una variación ni una interpretación comparativa. La coincidencia de extremos no garantiza que no existan huecos de importación.
- Esta actualización es parcial: las tarjetas todavía no se fuerzan para cada tipo de consulta ni se completan las demás fases del plan. Verificar el despliegue antes de darla por activa.

### Límites confirmados en código

- `detectar_agrupacion` devuelve un solo valor y prioriza SKU ante «Top 10 productos». La petición «Dame un resumen de ventas para este mes, con clientes, secciones y Top 10 productos» se reduce a SKU; `es_pregunta_gerencial` no reconoce «resumen de ventas» como dossier.
- `DIMENSIONES_VENTAS` del dossier no incluye clientes. Sus consultas de impulsores ordenan variación ascendente y limitan a 10; el detalle SKU a 5. No existen bloques simétricos de subidas ni cálculo de demanda caliente ligado a stock en ese plan.
- El plan gerencial calcula por defecto el período anterior con `_rango_anterior`, sin usar las fechas comparativas explícitas del contrato. Un plan nuevo debe respetar el contrato y distinguir YoY de MoM.
- Las tarjetas ya existen (`build_metrics_marker` y `CopilotMetricCards`), pero la evidencia del dossier no llega siempre al frontend: el respaldo por ausencia de API añade tarjetas; el respaldo por excepción de API retorna solo texto. El camino normal con LLM pasa un dossier a un constructor de tarjetas pensado también para ese formato, pero se deben comprobar todos los retornos y completar MG/MGD, comparables y cobertura.
- Hay caché TTL de contexto operativo en `copilot_context.py`; no equivale a precálculos persistentes multidimensionales. Reutilizar las métricas y señales compartidas, no crear una segunda definición de ABC, cobertura o márgenes.

### Orden de implementación recomendado

1. **Contrato multiconsulta y cobertura de la respuesta.** Añadir lista de dimensiones, bloques solicitados, límites por bloque y comparaciones al contrato persistido. Consultas parametrizadas de totales, clientes, secciones y productos para una sola petición. Un validador debe exigir cada bloque; un bloque fallido se declara como fallo, nunca como cero o ausencia de datos. Modelo narra después de recuperar evidencia.
2. **Resumen ejecutivo determinista.** Tarjetas grandes con ventas, variación YoY, MG, MGD, unidades y clientes activos, fechas exactas, último dato y cobertura comparable. Tablas de cada dimensión solicitada; subidas y caídas separadas. Los bloques visuales se producen en backend independientemente de la narración. No ocultar que falta histórico ni comparar un mes parcial con un mes completo.
3. **Capa compartida de métricas preparadas.** Agregados diarios por empresa y por SKU, cliente y sección, con dimensiones históricas definidas. Guardar revisión de dataset, fecha de cálculo y cobertura. Upsert/recalcular solo fechas afectadas tras importación, también correcciones históricas; publicar la nueva revisión de forma atómica. Resumen y Top 10 cacheados por empresa, alcance, período, comparación y revisión. Misma capa para Copilot, Dashboard y Control IA; no almacenar rankings globales reutilizados erróneamente después de filtrar.
4. **Demanda y suficiencia.** SKU: ADS 28d = unidades positivas / días cubiertos (incluyendo ceros de días realmente cubiertos); ventas netas se mantienen aparte con abonos. Cobertura = stock actual / ADS. Propuesta inicial configurable de caliente: ventas recientes positivas y aceleración ADS 7d / ADS de los 21d previos, con mínimos de actividad e impacto; declarar base cero como producto nuevo, no crecimiento infinito. Contrastar demanda con lead time conocido; si falta, mostrar cobertura y «lead time no disponible», no garantizar suficiencia. Añadir ABC, fecha del snapshot y discrepancia temporal entre ventas y stock. No tratar aging por última venta como edad física del stock.
5. **Profundización controlada y evaluaciones.** Catálogo de herramientas parametrizadas para desgloses adicionales y artefactos desde la evidencia; máximo de pasos y presupuesto. Tests de extremo a extremo del endpoint real, no solo del parser: multidimensión, conciliación, filtros, aislamiento multiempresa, SQL sin argumentos inválidos, caché invalidada, histórico parcial, abonos, base cero y ausencia de inventario. Exportaciones reutilizan el mismo bundle, no la prosa.

### Fórmulas y reglas propuestas

- Para YoY: actual desde inicio de período hasta corte real disponible; comparable mismas fechas del año anterior, declarando días ausentes y 29 de febrero. No reemplazar por mes anterior salvo petición expresa.
- Delta EUR = ventas actuales − ventas comparables. Delta % = delta / ABS(ventas comparables) × 100 cuando la base sea distinta de cero; etiqueta explícita para bases negativas o cero. Top caídas solo delta < 0; Top subidas solo delta > 0, ordenados por impacto EUR, máximo 10 por dimensión.
- Clientes activos = clientes distintos con venta positiva, con criterio explícito para el cliente sin identificar. Nunca asignar el stock completo a cada cliente; medir su exposición sobre SKU compartidos sin duplicar inventario. Secciones requieren cobertura ponderada coherente, no media simple de días de cobertura de sus SKU.
- No imponer límites de porcentaje a las variaciones de negocio por analogía con el suelo de importación de MG/MGD. Cada fórmula debe conciliar con detalle y considerar cobertura y devoluciones.
