# AI Copilot

## Estado verificado · 27/10/2026 · v2.03

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
