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
- Por definición de negocio, cada línea debe cumplir `MGD <= MG`. La importación de ventas debe rechazar un MGD superior al MG (tolerancia técnica de 0,01 €); no ocultar el error recortando el MGD en la interfaz o en consultas agregadas. Los datos históricos afectados se corrigen en PBI y se recargan por período.
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
