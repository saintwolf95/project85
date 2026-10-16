# SupplyChain / Five Minutes — contexto de trabajo

## Propósito

Aplicación interna de analítica comercial, inventario y supply chain para Five Minutes. La empresa activa ve ventas, inventario, ABCXYZ, previsiones y asistentes de IA. La interfaz y todas las respuestas al usuario se mantienen en español.

## Arquitectura

- Frontend: React + TypeScript + Vite + Tailwind, en `frontend/`.
- Backend: FastAPI + SQLAlchemy, en `app/`; API bajo `/api/v1`.
- Datos: PostgreSQL en producción; SQLite se usa como alternativa local. Las consultas del Copilot se ejecutan mediante una sesión de solo lectura.
- Autenticación: Supabase/JWT. Todos los datos analíticos se aíslan por `empresa_id`.
- Rutas y pestañas: `frontend/src/App.tsx`; navegación visible: `frontend/src/components/Sidebar.tsx`.
- Cliente API: `frontend/src/services/api.ts`. No duplicar URLs ni contratos en las páginas.

## Dominio de datos

- `fivemin_ventas`: ventas detalladas por día. Es la fuente oficial de facturación, unidades, MG, MGD, producto, cliente y comercial. El año fiscal comienza el 1 de mayo.
- `fivemin_inventario`: snapshots diarios desde el 06/08/2026. Alimenta `inventario_historico` y actualiza el snapshot actual con la última fecha.
- Los exportes de Power BI pueden traer filas finales `Total`, `Subtotal` y `Filtros aplicados`; el importador debe ignorarlas, no tratarlas como registros.
- Los porcentajes de MG/MGD anómalos se conservan con límite mínimo de `-200%`, no se eliminan las pérdidas negativas válidas.
- ABC es una clasificación comercial basada en ventas EUR de los últimos 90 días. XYZ depende del valor de inventario actual; no presentar conclusiones XYZ si no hay inventario real.

## Copilot y calidad analítica

- El Copilot debe dar cifras, períodos, comparativas, familias/marcas/secciones/SKU y causas observables; evitar recomendaciones vacías como “potenciar ventas”.
- Las consultas agregadas frecuentes pasan por `app/copilot_orchestrator.py`, no por SQL generado libremente. Mantenerlas parametrizadas y con `empresa_id`.
- Las respuestas de continuación deben conservar medida, período, agrupación y filtros. El parser entiende rangos de fechas, meses nombrados, abreviaturas y rangos que cruzan año.
- Los mensajes se persisten en `copilot_messages.creado_en` en UTC y se muestran en el navegador como `HH:mm dd-MM-yyyy` en hora local.
- Fast es directo; Thinking/Ultra deben usar el mismo dato real y aportar análisis avanzado, no inventar conclusiones.

## Pestañas documentadas

Cada pestaña visible tiene su contexto en `docs/claude-tabs/<pestaña>/CLAUDE.md`:

1. Dashboard
2. Intelligence ABCXYZ
3. Predicción Demanda
4. AI Copilot
5. Control IA
6. Marginalidad
7. Data Engineering
8. Guía de Importación
9. LibrerIA
10. Power BI Services
11. Ventas

Índice navegable y mapa de rutas verificado: `docs/claude-tabs/README.md`. Leer el contexto de la pestaña afectada antes de trabajar en ella; estos archivos son memoria de referencia y el código sigue siendo la fuente de verdad.

La ruta interna `/alerts` también está documentada porque sigue registrada en el router aunque no está en el menú visible.

## Regla obligatoria de versionado y publicación

**Todo cambio funcional, de interfaz, API, datos, documentación operativa o corrección debe quedar versionado y publicado en GitHub antes de considerarse terminado.**

1. Incrementar versión en los cuatro puntos: `app/main.py`, `frontend/package.json`, `frontend/package-lock.json` y `frontend/src/config/version.ts`.
2. Ejecutar verificaciones proporcionales: `python -m unittest discover -s tests -t .`, `python -m compileall -q app`, `npm.cmd run build` y `git diff --check` cuando apliquen.
3. Crear commit en `main` con el formato acordado: `Tipo (v.1.XX) : Descripción breve en español`.
4. Subir con `git push origin main` y verificar que el hash local coincide con `refs/heads/main`.
5. Informar la versión publicada y que el redeploy puede requerir recarga forzada del navegador.

No modificar archivos ajenos a la solicitud ni usar operaciones destructivas de Git. Si una migración de producción fuese necesaria, incluir una ruta segura de inicialización o la migración correspondiente.

## Actualización v1.49 — episodios y decisiones de Control IA

- Control IA correlaciona señales deterministas en episodios, con enlaces declarados, solape mínimo de siete días y deduplicación de facetas. No sumar dos veces una misma incidencia por `duplica`.
- Conservar separados `impacto_realizado_eur`, `impacto_en_riesgo_eur` e `impacto_capital_eur`; `impacto_ponderado_eur` es solo la prioridad operativa y no una cifra que pueda presentarse como pérdida realizada.
- El CEO consume episodios y debe referirse a sus enlaces como explicación estructural, nunca como causalidad demostrada. Las decisiones propuestas necesitan episodio, responsable, métrica y horizonte; se persisten y se cierran con resultado.
- Toda señal descartada requiere motivo y feedback. Un `falso_positivo` o `no_accionable` suprime la misma señal durante 30 días; si reaparece después, vuelve como incidencia nueva con trazabilidad de reincidencia.

## Actualización v1.50 — profundidad de dominio de Control IA

- `agent_signals` diferencia `riesgo` y `oportunidad`. Cada agente admite como máximo cinco riesgos nuevos y dos oportunidades nuevas por día; las oportunidades se muestran y priorizan aparte y nunca desplazan un riesgo de severidad 5.
- `empresa_reglas_negocio` y `app/business_rules.py` son la única fuente de reglas configurables. La resolución sigue SKU → familia → empresa → constante, con ámbito específico de cliente/comercial cuando la métrica lo requiere; la evidencia debe declarar valor, origen y `regla_id`.
- Las reglas se administran en `/ai-control/reglas` y se validan tanto por tipo como por vigencia. No permitir solapes. Cada excepción de `umbral_detector` se aplica y queda citada por el detector.
- Los nuevos detectores B3 siguen siendo deterministas; los playbooks de investigación son cerrados por detector. No adelantar agentes de calidad, compras ni bloques posteriores sin una solicitud explícita.

## Versiones y precedentes relevantes

- v1.17 inicializa de forma segura la tabla de histórico de inventario en producción.
- v1.18 elevó el límite de catálogo analítico a 20.000 SKU para ABCXYZ y previsión.
- v1.19 corrigió la memoria de aclaraciones del Copilot.
- v1.20 amplió los períodos naturales y el formato de fecha/hora de mensajes.
# Actualización v1.25 — señales verificadas de Control IA

- El flujo de agentes usa `agent_signals`: detectores deterministas producen evidencia y el LLM solo narra, contextualiza y recomienda sobre ese JSON. No conceder SQL ni cálculo libre al LLM en este flujo.
- Cada señal mantiene entidad, ventana, severidad, impacto EUR, confianza, evidencia y `fingerprint`; se deduplica como `persistente` y se resuelve cuando deja de detectarse.
- El CEO consolida las 5-7 señales con mayor impacto/confianza. El inventario empieza el 06/08/2026: comprobar cobertura antes de inferir tendencias. XYZ por valor de inventario puede calcularse con snapshot; no mide variabilidad de demanda.

## Actualización v1.26 — filtro estadístico anti-ruido

- Para detectores temporales, usar mediana móvil y MAD en lugar de media y desviación típica; validar anomalías con CUSUM de nivel persistente y Benjamini-Hochberg con FDR del 10%.
- El p-valor solo filtra la entrada. La prioridad siempre es impacto EUR × confianza × severidad; no ordenar alertas por significación estadística.
- Máximo cinco señales nuevas por agente y día. Si el umbral genera más, seleccionar las cinco de mayor impacto y revisar el detector antes de ampliar el límite.

## Actualización v1.27 — investigaciones con contrato de evidencia

- Control IA investiga mediante cuatro fases: plan limitado a catálogo, recolección con consultas parametrizadas, redacción con referencias `[eN]` y verificación automática antes de publicar.
- La ruta `POST /agents/{agent_name}/investigations` nunca acepta SQL. Si una cifra o una cita no existe en el bundle, el informe se reintenta una vez y después se bloquea.

## Actualización v1.28 — motor único para Copilot

- Copilot reutiliza `app/copilot_business_tools.py`: `buscar_senales`, `descomponer_variacion`, `serie_temporal` y el ranking semántico existente. No crear un segundo motor ni habilitar SQL libre para estas funciones.
- El contexto del Copilot recupera definiciones del diccionario semántico de métricas (MG/MGD, ABC/XYZ, año fiscal, sección) según la pregunta.
- El informe de investigación exige además Hipótesis descartadas y Qué dato falta, en coherencia con la evidencia y readiness.

## Actualización v1.29 — cierre de contratos críticos

- El fingerprint de señal identifica detector y entidad, no una ventana móvil; una señal recurrente debe conservar su historial `persistente`.
- Mattia valida su detector temporal sobre MGD diario. Los informes solo se publican si cada línea con cifras cita un `[eN]` y cada valor existe en ese mismo bloque.
- El puente del Copilot debe incluir precio, volumen, mix de SKU y clientes impulsores. La investigación verificable debe estar disponible desde Control IA.

## Actualización v1.30 — consolidación operativa

- `app/agents_service.py` no conserva rutas SQL o informes manuales heredados: todos los agentes narran evidence bundles.
- La validación de evidencia reutilizable vive en `app/evidence_contract.py` y debe cubrirse con pruebas unitarias. El límite diario cuenta solo señales activas, no las resueltas.

## Actualización v1.31 — respuesta ejecutiva del Copilot

- “Este mes” se compara contra los mismos días transcurridos del mes anterior; nunca presentar un mes parcial frente a un mes completo como una variación válida.
- Thinking prioriza tres conclusiones por impacto EUR, KPI estructurados, tablas legibles y acciones verificables. La profundidad analítica no se mide por longitud ni permite causalidad no demostrada.
- Los recuentos distintos de producto se nombran “SKU con venta”. Las ventas negativas se tratan como devoluciones, abonos o ajustes pendientes de validar, no como una caída de demanda inferida.

## Actualización v1.32 — capacidad segura de importación

- Data Engineering admite archivos CSV/XLSX de hasta 50 MB y libros XLSX con hasta 512 MB de contenido interno, manteniendo el límite operativo de 200.000 filas.
- No volver a usar solo el tamaño descomprimido como detector de seguridad: validar además cantidad de componentes y ratio de compresión para distinguir un Excel comercial normal de una bomba ZIP.
- Mantener sincronizados los límites visibles en Data Engineering, Guía de Importación y backend.

## Actualización v1.33 — CSV comerciales con comillas

- El lector CSV fija `doublequote=True` tras detectar el delimitador. Los nombres de artículos con pulgadas y comas, como `27" IPS, HDMI`, no deben desplazar las dimensiones posteriores.
- La carga histórica FY2025 entregada cubre datos reales desde el 05/05/2025 hasta el 30/04/2026; no inventar actividad para el 01–04/05/2025, aunque el calendario fiscal general comience el 1 de mayo.

## Actualización v1.34 — ventas sin cliente identificado

- Las columnas `ClientePK` y `Nombre Cliente` siguen siendo obligatorias en la plantilla, pero sus celdas pueden venir vacías.
- Si falta `ClientePK`, la venta se vincula al cliente técnico `SIN-CLIENTE` con nombre `Sin nombre cliente`. Si existe el identificador y solo falta el nombre, se conserva el identificador y se aplica el mismo nombre de respaldo.

## Actualización v1.35 — evidencia mensual y conservación del histórico

- Las consultas mensuales del Copilot recuperan juntas ventas, unidades, margen, MGD, SKU con venta y cobertura real. La tabla se renderiza de forma determinista e indica siempre la última fecha disponible.
- Interpretar fechas naturales como `desde el 5 de mayo de 2025 hasta la última fecha disponible` para cualquier mes y año. La frase `número de SKU con venta` es una métrica, nunca un filtro por el SKU `con`.
- En ventas, `Sustituir` reemplaza solo las fechas comprendidas por el archivo. Nunca elimina FY anteriores ni clientes compartidos; una carga del ejercicio actual debe conservar el histórico interanual.

## Actualización v1.36 — persistencia multiempresa de señales

- Toda señal nueva de Control IA debe persistirse con el `empresa_id` de la ejecución. El identificador no forma parte del detector ni puede quedar implícito en el evidence bundle.
- Si una ejecución de agentes falla después de abrir una transacción, la ruta debe ejecutar `rollback` antes de devolver el error para no dejar la sesión en estado inválido.
- Mantener una prueba de regresión que cree una señal nueva y confirme su asociación con la empresa solicitante.

## Actualización v1.37 — Dashboard ejecutivo verificable

- El Dashboard consume `GET /analytics/dashboard-executive`; todas las cifras, períodos y comparables se calculan en backend con `empresa_id`. No introducir tendencias o porcentajes estáticos en el frontend.
- FYTD compara los mismos días naturales del ejercicio anterior; 30D y 90D usan la ventana inmediatamente anterior de igual duración. Mostrar un aviso cuando el histórico no cubra por completo el comparable.
- La vista gerencial integra ventas, MGD, inventario, disponibilidad Clase A, capital sin ventas 90D, impulsores por familia y matriz ABCXYZ. Los filtros de familia proceden del catálogo real.
- La respuesta ejecutiva usa caché de cinco minutos por empresa, período y familia; toda carga de Data Engineering debe invalidarla junto con las métricas ABCXYZ.

## Actualización v1.38 — legibilidad ejecutiva responsive

- Los KPI monetarios principales usan notación compacta en la cabecera (`24,39 M€`) y conservan el detalle exacto en comparativas y desgloses; no truncar importes críticos por falta de ancho.
- Los contenedores de Recharts deben admitir `min-width: 0` dentro del grid para evitar dimensiones negativas durante el render responsive.

## Actualización v1.39 — estabilidad inicial de gráficos

- Configurar también `minWidth={0}` en cada `ResponsiveContainer` del Dashboard. Evita el cálculo transitorio de ancho negativo que Recharts puede realizar antes de que el grid responsive quede dimensionado.

## Actualización v1.40 — primer render de gráficos

- Los gráficos del Dashboard declaran una `initialDimension` positiva. Recharts puede validar el contenedor antes de que `ResizeObserver` mida el grid; la dimensión inicial evita advertencias sin fijar el tamaño responsive definitivo.

## Actualización v1.41 — segmentación y comparativa gerencial

- El Dashboard filtra en backend por familia, marca, Familia/Marca y sección. Todas las consultas de ventas, inventario, ABCXYZ y desgloses deben aplicar simultáneamente esos filtros y `empresa_id`.
- La evolución mensual incluye comparación contra las mismas fechas del año anterior, con meses sin actividad a cero y variaciones calculadas en backend.
- La vista Detalle de ventas agrupa mediante una lista blanca SQL por comercial de factura, cliente, familia, marca o sección. Entrega ventas actuales/anteriores, variación, peso, unidades, margen, MGD y SKU; no calcular estos agregados desde una muestra del frontend.

## Actualización v1.42 — exactitud del detalle gerencial

- Los líderes de facturación, crecimiento y caída se calculan en backend sobre el universo completo de segmentos antes de limitar la tabla a los 100 de mayor variación absoluta.
- Un líder de crecimiento requiere variación positiva y uno de caída requiere variación negativa; si no existe el signo correspondiente, la interfaz debe indicarlo sin elegir un segmento contrario.
- El desglose por cliente usa `ClientePK` como identidad estable y muestra `ClientePK · Nombre Cliente`; nunca agrupar clientes distintos únicamente porque compartan nombre.
- Las pruebas que importan la aplicación deben aislar las variables de conexión locales para no depender de un `.env` de producción ni relajar la obligación de `DATABASE_RO_URL` en PostgreSQL real.

## Actualización v1.43 — rendimiento y calidad del frontend

- El Dashboard reutiliza durante 15 minutos las opciones de filtro por empresa y las invalida con cualquier carga de datos. Las comparativas consultan únicamente las dos ventanas exactas, no todo el intervalo intermedio.
- Cada mes de la serie comercial declara su cobertura real y si es parcial. La interfaz debe señalar todos los meses incompletos, no solo el último punto de la serie.
- El frontend debe conservar `npm run lint` sin errores ni advertencias: tipar tooltips y exportaciones, usar controles accesibles y no mantener estado que pueda derivarse con `useMemo`.
- Los contextos React separan el objeto de contexto, el proveedor y el hook consumidor para permitir Fast Refresh sin exportaciones incompatibles.

## Actualización v1.45 — interfaz clara de decisión

- El rediseño visual de Dashboard e Inteligencia ABCXYZ se limita a la interfaz: no altera APIs, filtros, períodos, métricas, exportaciones ni cálculos de backend.
- En modo claro, las dos vistas usan tipografía de sistema, superficies blancas, separadores sutiles, azul único para interacción, controles segmentados, tarjetas con profundidad mínima y tablas sin líneas verticales ni encabezados en mayúsculas.
- Mantener la semántica visual de los valores: las variaciones incluyen icono de dirección además de color; la matriz ABCXYZ usa intensidad azul contenida, mientras que las alertas conservan sus badges semánticos sin teñir toda la tabla.
- El modo oscuro existente se conserva como está hasta que se solicite su adaptación visual específica.

## Actualización v1.46 — cargas incrementales por periodo

- Data Engineering expone un flujo explícito para incorporar intervalos personalizados de ventas o inventario, sin requerir la recarga completa del histórico.
- La fecha real procede siempre de la columna `Fecha` del archivo. La validación debe mostrar el intervalo detectado antes de confirmar y el resultado debe confirmar el intervalo incorporado.
- Por defecto, la carga conserva los datos ajenos al archivo: ventas hace upsert por fecha, artículo, cliente, KD y comercial; inventario por fecha y artículo, actualizando el snapshot solo con la fecha más reciente.
- La sustitución de ventas del periodo sigue siendo una acción separada y controlada: solo se usa para recalcular todo el intervalo cubierto por el fichero.

## Actualización v1.47 — carga centrada en ventas e inventario

- Data Engineering solo muestra los flujos `fivemin_ventas` y `fivemin_inventario`. El catálogo independiente no forma parte de la experiencia de carga: ventas e inventario crean y actualizan el catálogo automáticamente.

## Actualización v1.48 — Apple UI para inteligencia asistida

- AI Copilot y Control IA usan tipografía de sistema, superficies neutras, separadores finos y azul único para acciones e interacción; conservar los colores semánticos exclusivamente para estados, variaciones y alertas.
- No cambiar APIs, modelos, historial, estudios, señales, chats ni cálculos por un ajuste visual. Las tablas de informes y respuestas deben conservar su accesibilidad, desplazamiento horizontal y cifras tabulares.
- Mantener la misma jerarquía en claro y oscuro: modal con fondo atenuado, tarjetas sin adornos cromáticos, controles segmentados y foco visible para teclado.

## Actualización v1.51 — guía de Control IA

- Control IA incorpora un glosario único, recorrido accesible y guía permanente en `/ai-control/guia`; las definiciones de la guía y los tooltips deben proceder de `frontend/src/content/glosario.ts`.
- El progreso del recorrido y de puesta en marcha se persiste por usuario, empresa y flujo en backend; no usar `localStorage` como fuente de verdad.
- La lista de puesta en marcha solo marca elementos comprobados en datos o configuración real. La síntesis semanal no existe todavía: debe indicarse como no disponible, sin simular una confirmación manual.
- Los estados sin datos explican la causa, el impacto y la siguiente acción. Esta capa no altera detectores, prioridades, evidencia ni cálculos de Control IA.

## Conocimiento de negocio — Marginalidad

- `MG` es el margen bruto registrado en `ventas_historicas.margen_bruto_eur`.
- `MGD` es el margen puesto en destino registrado en `ventas_historicas.margen_destino_eur`: a diferencia del MG incorpora gastos financieros, de transporte y de logística de almacén.
- Por regla analítica habitual `MGD <= MG`, pero las operaciones reales pueden incorporar ajustes o costes negativos. La importación conserva un `MGD` superior al `MG` como valor de origen y lo registra como advertencia de calidad; no recortar ni inventar una corrección. Las agregaciones siguen recalculando ambos porcentajes desde las sumas EUR.
- Cualquier porcentaje agregado de MG o MGD se calcula ponderado sobre las ventas netas del mismo conjunto de líneas; nunca se promedian porcentajes de línea.

## Actualización v1.52 — Marginalidad

- La pestaña `/marginalidad` usa `ventas_historicas`, `productos` y `clientes`, siempre anclada a la última fecha de ventas de la empresa activa, no a la fecha de sistema.
- Las agregaciones son SQL directo aislado por `empresa_id`; la concentración se ordena por euros de MG o MGD, nunca por porcentajes.
- Las señales visibles se reutilizan desde Control IA. No introducir detectores ni llamadas LLM para la pestaña.

## Actualización v1.53 — guía de lectura ABCXYZ

- Inteligencia ABCXYZ ofrece un recordatorio emergente accesible con las reglas reales de clasificación: ABC por ventas netas acumuladas de 90 días y XYZ por valor de inventario actual, ambos con cortes acumulados 80 % / 15 % / 5 %.
- No describir XYZ como variabilidad de demanda: en la matriz actual la letra XYZ representa concentración de valor de inventario. Los SKU sin snapshot permanecen en `N/D`.

## Actualización v1.54 — integridad de marginalidad

- Marginalidad permite Año fiscal a la fecha (desde el 1 de mayo hasta la última venta cargada), Últimos 90 días y Últimos 30 días, en ese orden.
- El resumen expone una advertencia de calidad cuando los registros ya cargados incumplen `MGD <= MG`; comunica número de líneas e importe excedido, sin alterar los valores fuente.

## Actualización v1.55 — decimales de Excel

- Las celdas numéricas de XLSX deben conservar su valor nativo. No convertir un `float` de Excel a texto antes de normalizarlo: `792.785` es un decimal cuando procede de una celda numérica, mientras que el texto `"792.785"` se interpreta con la configuración española como separador de miles.
- Una carga afectada por este error requiere recargar el período desde el XLSX original después de publicar la corrección; no corregir importes históricos estimando dónde había decimales.

## Actualización v1.56 — preservación de valores XLSX

- `_read_xlsx` conserva el valor nativo de cada celda hasta la validación. Usar una representación de texto solo para detectar pies de Power BI y filas vacías; nunca para los importes que acabarán en `_parse_number`.
- La garantía se prueba con un libro XLSX real que contiene `792.785` como número, no como texto.

## Actualización v1.57 — recarga segura de años fiscales

- Tanto la carga operativa como el histórico fiscal pueden activar “Sustituir las ventas del periodo del archivo”. La sustitución borra y repone solo las ventas comprendidas entre la fecha mínima y máxima validadas del fichero; no afecta a otros períodos, clientes, catálogo ni inventario.
- Antes de recargar FY2025, el usuario debe seleccionar “Histórico del año fiscal anterior”, validar cada fichero y marcar sustitución únicamente si ese mismo bloque de fechas ya existía y desea corregirlo.

## Actualización v1.58 — lotes fiscales de Power BI

- Data Engineering admite hasta 200.000 filas por CSV/XLSX. Se conserva el límite de 50 MB, la inspección de archivo XLSX y las protecciones de compresión para mantener la carga acotada.
- Esta capacidad permite cargar los cuatro bloques FY2025 sin dividirlos artificialmente. Validar y cargar cada bloque por separado, usando siempre el rango de fechas real detectado por el sistema.

## Actualización v1.59 — lectura y prioridades ABCXYZ

- Ambas matrices comparten `AbcxyzLegend` y `content/abcxyz.ts`: ABC ventas netas 90D y XYZ valor actual de inventario, con cortes acumulados 80/15/5 vigentes en `app/semantic_metrics.py`. Los tramos son aproximados por SKU, no porcentajes del número de artículos.
- Los colores identifican un foco de gestión y permanecen constantes al alternar métricas: AX azul estratégico; AY/AZ turquesa de disponibilidad; BX ámbar de capital; CX rojo suave de exceso potencial; CY naranja de rotación; BY/BZ/CZ neutros. Conservar contraste en claro y oscuro y etiquetas textuales.
- No inferir una rotura, estabilidad de demanda ni exceso confirmado únicamente de la letra XYZ. Las filas son A/B/C y las columnas X/Y/Z. La guía desplegable explica cada cuadrante y no cambia los cálculos.

## Actualización v1.60 — memoria por pestaña

- `docs/claude-tabs/README.md` enumera las diez pestañas reales del sidebar, sus contextos y subrutas. Cada `CLAUDE.md` incluye estado verificado el 08/10/2026; se corrigen descripciones antiguas de Dashboard y la entrada de Control IA.
- Predicción es una extrapolación sobre hasta 1.000 SKU y los KPI visibles suman los 20 grupos seleccionados. Power BI Services es una maqueta; SharePoint y oficina animada de agentes son propuestas pendientes.
- La progresión intermedia del gabinete es actualmente simulada por temporizador. Cualquier futura representación visual de trabajo individual necesita estados reales del backend.

## Actualización v1.61 — oficina de analistas con progreso real

- `/ai-control/oficina` añade cuatro escritorios SVG, acceso a expedientes, vista de tarjetas, pausa y movimiento reducido, con temas claro/oscuro. Reutiliza el flujo existente; no añade agentes ni llamadas al LLM.
- Sustituye la progresión simulada descrita en v1.60: `GET /agents/execution` expone estados reales de la empresa desde `agent_executions`, creada de forma aditiva al arrancar. Consulta cada 3 segundos en ejecución y cada 8 en reposo.
- Adquisición atómica por empresa, run_id para rechazar publicaciones obsoletas y caducidad de 30 minutos sin progreso. Solo administradores inician ejecuciones. La telemetría conserva la última ejecución, no es una cola de trabajos.
- Señales y episodios deterministas se confirman antes de narrar. Rechazar narraciones vacías o de error; publicar completado solo después del guardado del informe. Pruebas en `tests/test_agent_execution.py`.

## Actualización v1.62 — controlador PostgreSQL en Render

- `requirements.txt` incluye `psycopg[binary]>=3.3,<4`. Render utiliza Python 3.14 y SQLAlchemy selecciona el dialecto `psycopg`; `psycopg2-binary` por sí solo no satisface ese import.
- Conservar `psycopg2-binary` para conexiones que lo seleccionen explícitamente. Tras desplegar, verificar `/openapi.json` en backend y `GET /agents/execution` autenticado antes de considerar operativa la oficina.

## Actualización v1.63 — oficina isométrica, fase 1 con placeholders

- La ruta `/ai-control/oficina` reemplaza el SVG por PixiJS 8 y `@pixi/react` 8, compatibles con React 19. Mantiene el sondeo a `agent_executions`; no inventar SSE ni eventos de negocio. Pixi se carga solo al entrar en la ruta.
- El mapa textual, BFS, roster de cuatro agentes y máquina de estados viven en `frontend/src/agent-office/`. La actividad ambiental es explícitamente ilustrativa, con catálogo cerrado, baño y puestos reservados. Trabajo real interrumpe la animación ambiental; informes entregados y consolidación del CEO siguen los estados confirmados.
- Solo se publican placeholders dibujados. No incorporar sprites comerciales, Pixelify, fichas rápidas, historial ni modo pantalla en esta fase; detenerse para validar el comportamiento antes de invertir en gráficos.

## Actualización v1.64 — relevo para continuar desde casa

- `docs/RELEVO_OFICINA_AGENTES.md` reúne estado verificado, decisiones, fases pendientes, archivos clave, riesgos, validación y un primer prompt para retomar el trabajo en otro equipo. Leerlo antes de continuar la oficina.
- Esta versión solo añade documentación y sincroniza las cuatro marcas de versión; no implementa la fase 2 ni confirma un despliegue de producción.

## Actualización v1.65 — estado fiable de la oficina

- Si falla el polling de `GET /agents/execution`, la oficina neutraliza monitores, movimientos de trabajo e informes entregados; el último estado se conserva únicamente como referencia fechada en el HUD.
- Durante una desconexión se reintenta cada tres segundos. Al recuperar conexión, la escena reconstruye el estado confirmado del servidor sin representar entregas pasadas.

## Actualización v1.66 — ficha rápida de agentes

- Personajes y tarjetas de `/ai-control/oficina` abren una ficha lateral accesible con estado confirmado, etapa, última actualización, tarea genérica y un resumen del último informe autorizado de la empresa.
- María, Lucía y Mattia enlazan por separado a expediente y chat; CEO enlaza al informe ejecutivo. La ficha atrapa el foco, cierra con Escape y devuelve el foco al control de origen.
- `Iniciar análisis` solo se muestra al rol administrador y el backend conserva `get_current_active_admin` como autoridad. No se añaden aprobaciones ni acciones automáticas.

## Actualización v1.67 — historial, consumo y avisos

- `agent_execution_runs` y `agent_execution_members` son el historial durable por empresa y `run_id`; `agent_executions` continúa siendo únicamente la foto de estado actual para polling.
- `llm_usage_events` guarda solo funcionalidad, modelo y contadores de tokens. No añadir prompts, respuestas, SQL ni datos de negocio a esta telemetría.
- La Oficina presenta duración, estado final y error seguro de cada ejecución y agente. Sonido y notificaciones del navegador permanecen desactivados hasta una acción explícita del usuario.
- La migración PostgreSQL aditiva de esta fase es `migrations/V1.15__agent_execution_history.sql`. El flujo sigue siendo síncrono; el historial no es una cola de trabajos.

## Actualización v1.68 — legibilidad de los globos

- `Bubble` de la oficina usa texto oscuro para los mensajes ambientales porque su fondo es claro en ambos temas. Los mensajes de trabajo real continúan en blanco sobre azul.

## Actualización v1.69-v1.72 — sincronización manual SQL e importación por lotes

- La vía temporal de datos reales es **Carga Manual SQL**: `scripts/export_sqlserver_manual_batches.ps1` se ejecuta en el equipo de empresa con acceso de lectura a `DATA01`. Genera ventas mensuales e inventario semanal desde las vistas `dbo.vw_ventas_supabase` y `dbo.vw_inventario_supabase`; la Conexión Oficial SQL sigue pendiente.
- Data Engineering permite seleccionar varios CSV/XLSX de la misma fuente. Los ordena por fecha del nombre, los importa uno a uno, conserva los confirmados si hay un fallo y reanuda desde el pendiente. Al final ejecuta una única actualización de métricas y cachés para no recalcular ABCXYZ, Dashboard, Copilot y agentes por cada archivo.
- La carga por lote desactiva la sustitución por período. La sustitución sigue disponible solo para una corrección deliberada mediante carga individual.
- Las fechas procedentes de SQL Server pueden incluir hora y configuración regional. El importador acepta variantes ISO, españolas y estadounidenses con hora; para nombres estándar `fivemin_ventas_YYYY-MM-DD_YYYY-MM-DD.csv` y `fivemin_inventario_YYYY-MM-DD_YYYY-MM-DD.csv`, el rango del nombre resuelve la ambigüedad. El exportador nuevo genera fecha ISO.
- Si un lote falla, mostrar en la interfaz las primeras filas y mensajes de validación. No reducir el diagnóstico a un contador de errores.

## Actualización v1.74 — pooler de Supabase y psycopg

- La aplicación usa las URL del pooler de Supabase y `psycopg` como dialecto PostgreSQL. En `app/database.py`, tanto el motor de escritura como el de solo lectura deben incluir `prepare_threshold=None` en `connect_args`.
- El pooler por transacción puede asignar una conexión física distinta a cada operación. No reactivar las sentencias preparadas automáticas: provocan `psycopg.errors.DuplicatePreparedStatement` y pueden interrumpir una carga o un proceso de agentes aunque los datos sean válidos.

## Actualización v1.75 — respuesta segura de validación por lote

- Los límites de fecha extraídos del nombre estándar del archivo se usan internamente como fechas para resolver formatos ambiguos de SQL Server. Antes de incluirlos en una respuesta HTTP de validación deben serializarse como `YYYY-MM-DD`.
- Un error de calidad de un archivo nunca debe provocar un `TypeError` de serialización ni ocultar al usuario las filas concretas que debe revisar. El cambio de ejercicio fiscal no requiere ningún tratamiento especial: es un rango de fechas más.

## Actualización v1.76 — ventas sin referencia de artículo

- Si una fila de **ventas** llega con `ArticuloPK` vacío, la aplicación conserva sus importes bajo el SKU técnico único `SIN_SKU` y presenta una advertencia de calidad. No inventar referencias ni eliminar esas ventas de los totales financieros.
- Catálogo e inventario conservan `sku` como dato obligatorio: una existencia sin artículo identificado no se puede normalizar de la misma forma.

## Actualización v1.77 — ventas sin nombre de artículo

- Si una venta llega sin `Nombre Articulo`, se conserva con el nombre técnico `SIN_NOMBRE_ARTICULO` y una advertencia de calidad, igual que ocurre con el SKU técnico `SIN_SKU`.
- Esta normalización protege los totales de ventas y margen sin atribuir falsamente la operación a un producto conocido. Catálogo e inventario mantienen el nombre obligatorio.

## Actualización v1.80 — explorador operativo de ventas

- La pestaña `/sales` ofrece detalle comercial paginado por fecha, artículo, cliente, familia, marca, sección, Product Manager, tipo de cliente, KD y comerciales. Todas las consultas filtran obligatoriamente por `empresa_id`.
- Los KPI de ventas, unidades, margen, MGD, SKU y clientes se calculan sobre todo el universo filtrado en backend, nunca sobre la página visible. Los porcentajes se recalculan con las sumas: margen / ventas y MGD / ABS(ventas).
- Artículos y clientes se localizan mediante búsqueda de texto; los desplegables se reservan para dimensiones de cardinalidad razonable. La API limita el detalle a 200 filas por página y permite solamente las ordenaciones declaradas.

## Actualización v1.81 — filtros de fecha tipados en Ventas

- Los parámetros opcionales de fecha de `/analytics/sales-explorer` se vinculan explícitamente como `DATE`. PostgreSQL debe poder ejecutar la consulta completa con ambos filtros vacíos, además de los intervalos introducidos por el usuario.
- No sustituir esta vinculación por comparaciones con parámetros sin tipo: con `None`, el driver `psycopg` devuelve `AmbiguousParameter` antes de leer cualquier venta.

## Actualización v1.82 — filtros opcionales compatibles con pooler

- `/analytics/sales-explorer` construye la cláusula `WHERE` desde un catálogo interno de columnas y añade solamente filtros presentes. No enviar expresiones `:param IS NULL OR ...` al pooler: PostgreSQL puede rechazar un `NULL` sin tipo aunque la otra parte del predicado sea textual.
- Los valores siguen ligados como parámetros y las columnas siguen saliendo de una lista cerrada. La consulta sin filtros contiene solo el alcance obligatorio `empresa_id`.

## Actualización v1.83 — fichas y coherencia analítica de Control IA

- `frontend/src/content/agentProfiles.ts` centraliza la explicación visible de María, Lucía, Mattia y CEO: modelo efectivo, alcance, fórmulas, validaciones, priorización y límites. No duplicar esta información en la interfaz.
- La interfaz debe llamar al modelo configurado por su nombre real. En v1.83 los informes, chat e investigaciones usaban `gpt-4o`; desde v1.85 los analistas usan Terra y el CEO combina Terra/Sol. No etiquetar al CEO como `o1` mientras el backend no lo utilice.
- Las caídas por comercial pasan por el mismo filtro temporal robusto que las caídas por familia y SKU: mediana/MAD, CUSUM persistente y Benjamini–Hochberg con FDR del 10 %. El umbral se resuelve desde `empresa_reglas_negocio` y queda en evidencia.
- Antes de migrar el modelo de los agentes, mantener el contrato de evidencia y confirmar la compatibilidad del endpoint y el acceso de la cuenta. El modelo solo narra; los cálculos continúan siendo deterministas.

## Actualización v1.84 — modelos del CEO

- El CEO: su chat ejecutivo usa por defecto `gpt-5.6-terra` y la consolidación de episodios usa `gpt-6.1-sol`.
- Los valores se pueden ajustar sin redeploy mediante `CEO_CHAT_MODEL`, `CEO_REPORT_MODEL`, `CEO_CHAT_REASONING_EFFORT`, `CEO_REPORT_REASONING_EFFORT` y `CEO_MODEL_FALLBACK`. Los esfuerzos por defecto son medio para Terra y alto para Sol. Si la cuenta no dispone del modelo CEO y la API devuelve un error de disponibilidad o permisos, se usa `gpt-4o` y `llm_usage_events` registra el modelo efectivo.
- No usar la migración de modelo para relajar el contrato: las fórmulas, señales, episodios y decisiones siguen siendo deterministas; Terra y Sol solo redactan sobre el evidence bundle autorizado.

## Actualización v1.85 — Terra para agentes de área

- María, Lucía y Mattia usan `gpt-5.6-terra` con razonamiento medio en sus informes, chats e investigaciones verificables. El CEO conserva Terra para su chat y Sol con razonamiento alto para el informe ejecutivo.
- Las variables `ANALYST_MODEL`, `ANALYST_REASONING_EFFORT` y `ANALYST_MODEL_FALLBACK` controlan a los tres agentes de área. Un error explícito de disponibilidad o permisos usa `gpt-4o` como fallback y se registra el modelo efectivo.
- El contrato de evidencia, las consultas parametrizadas, las fórmulas y la verificación de cifras de investigación no cambian con la migración de modelo.

## Actualización v1.86 — oficina con perfil ampliado

- La oficina abre centrada y con mayor escala: no reservar espacio lateral dentro del canvas cuando la ficha aparece como modal sobre la escena. Conserva el reencuadre con doble clic, arrastre y rueda, y no recorta el mapa en móvil.
- Pulsar un personaje abre su perfil completo: retrato pixelado existente, modelo real, misión, enfoque, análisis, controles, fórmulas, prioridad, estado/etapa confirmados y el hallazgo verificado autorizado. Los datos del hallazgo siguen fuera del canvas.
- Las fichas reutilizan `frontend/src/content/agentProfiles.ts`; no duplicar funciones, fórmulas o modelos en la oficina. El panel mantiene Escape, foco atrapado, acciones de expediente/chat y diseño responsive.

## Actualización v1.87 — HUD de la Oficina Viva

- La oficina usa el HUD aportado en `hud-oficina/`: cabecera con reloj, controles, tarjetas sincronizadas y ficha rápida. La escena sigue siendo Canvas 2D; React posee todos los paneles y el canvas no muestra hallazgos, clientes, SKU ni importes.
- El contrato `OfficeHandle` expone `getSnapshot`, `subscribe`, `select`, `setDayNight` y `portrait`. El motor publica como máximo cuatro actualizaciones por segundo con hora, selección y estado/etapa/progreso/actividad de cada agente.
- La hora se obtiene de `Europe/Madrid`; `?hora=` solo puede afectar al ciclo en desarrollo. Vite no admite `next/font`, por lo que el HUD carga las mismas familias Pixelify Sans y Nunito desde su CSS. No alterar la estructura ni los textos del HUD de referencia.
- La ficha rápida sustituye al perfil anterior. Sus acciones navegan dentro de React hacia expediente, chat o informe ejecutivo; `POST /agents/run` continúa validando la autorización de administrador en servidor.

## Actualización v1.88 — Pasarela al almacén (Fase 1)

- La Oficina Viva incorpora la primera fase de conexión visual con el almacén: ascensor acristalado, pasarela elevada sobre carretera, cinta de cajas y fachada de almacén. Es escenografía operativa; no presenta aún métricas ni datos de inventario.
- El roster admite coordenada vertical `z` y pasos `lift`, `line` y `hide(..., 'store')`. Si una tarea real interrumpe una ronda, el agente vuelve primero por la pasarela y baja en ascensor; no puede teletransportarse desde el tramo elevado.
- La ronda por el almacén es ambiental, no revela clientes, SKU ni importes. María la recibe con mayor frecuencia y Mattia/CEO de forma ocasional. Las definiciones de aging, cobertura y valor de inventario quedan expresamente aplazadas a la fase de datos reales y requieren validación previa.

## Actualización v1.89 — módulo cerrado de Oficina Viva (Fase 1)

- La ruta `/ai-control/oficina` monta `frontend/src/agent-office-viva/OfficeViva.tsx`, wrapper sin cambios del módulo cerrado. Sus archivos `vendor/office-viva.js`, `.css` y `.d.ts` no se editan, formatean ni lintan; únicamente reciben opciones y callbacks desde React.
- La demo sin sesión `/oficina-demo` solo existe cuando `import.meta.env.DEV` es verdadero. Nunca exponerla en el build de producción ni convertirla en una ruta autenticada de datos reales.
- El Canvas/HUD anterior permanece como legado sin uso hasta validación del usuario. La Fase 2 cableará `OfficeAgentState[]`, etapas reales y navegación; la Fase 3 aportará `OfficeVivaData`. No anticipar esos datos con valores ficticios dentro de la ruta real.
- La oficina ocupa todo el ancho disponible y elimina el límite visual anterior de 680 px. El historial sigue debajo y las acciones de sonido/notificación mantienen las preferencias actuales.

## Actualización v1.90 — estados reales de Oficina Viva (Fase 2)

- `AgentOffice.tsx` transforma el estado confirmado de `useAgentExecution` en `OfficeAgentState[]` para María, Lucía, Mattia y CEO. Los estados del backend se limitan a `idle`, `working`, `done` y `error` dentro del módulo, sin inventar progreso ni datos de negocio.
- Las etapas registradas en `app/agents_service.py` se declaran en orden para cada agente. La etapa activa y la última tarea son mensajes genéricos; no muestran clientes, SKU, importes ni hallazgos en la escena.
- Los sondeos con el mismo estado reutilizan el mismo array de agentes; el módulo solo anima cambios confirmados. Inicio de análisis, permisos de administrador y navegación a expediente, chat e informe ejecutivo conservan sus callbacks React existentes.
