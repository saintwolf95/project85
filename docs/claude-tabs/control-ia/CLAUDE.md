# Control IA

## Fase 3 v6 — desglose interactivo verificable

- `GET /agents/office-viva/drill` recibe `chart`, `key` y los filtros activos,
  y devuelve como máximo diez filas. Cubre salud/cobertura de PM, stock muerto
  por sección, tramo de antigüedad, histórico de inventario por sección, ventas
  y variación por cliente, y MGD por marca.
- Cada consulta usa datos de la empresa activa y parámetros tipados; conserva
  los filtros de la oficina. Los resultados muestran artículo o dimensión,
  valor y contexto operativo (cobertura, días sin venta, ventas o MGD).

## Fase 2 v6 — filtros reales del Centro de mando

- `GET /agents/office-viva` acepta `pm`, `seccion`, `marca` y `articulo`
  (SKU) y aplica esos filtros, siempre aislados por `empresa_id`, a ventas,
  margen, inventario, salud de PM, alertas con entidad SKU/familia y gráficos.
  Los valores PM, sección y marca salen de `productos`; Artículo se busca en
  `GET /agents/office-viva/filter-options?article_query=…`, limitado a 50.
- La oficina conserva los filtros en la URL y los restaura al abrir. El
  contrato v6 recibe `data.filterOptions`; los gráficos de PM usan `pm`, el
  stock muerto `seccion` y MGD por marca usa `marca`. Los archivos del
  proveedor permanecen sin modificar.

## Fase 1 v6 — módulo cerrado

- Se sustituyeron literalmente `OfficeViva.tsx` y los tres archivos de
  `agent-office-viva/vendor/` por la entrega v6. Las reglas de `.menu`,
  `.hotbar` y `.vineta` quedan acotadas a `.fm-office`; no se encontraron
  coincidencias de esas clases fuera del módulo. Los filtros, el desglose y
  la salud real se reservan para las fases posteriores.

## Estado verificado · 16/10/2026 · v1.92

- Relevo para continuar la oficina desde otro equipo: `docs/RELEVO_OFICINA_AGENTES.md`. Fases 1 y 2 aprobadas e implementadas; detenerse antes de la fase 3 para revisión.
- La oficina neutraliza el estado visual si pierde conexión y muestra la fecha del último estado confirmado; no mantiene monitores azules como si fueran tiempo real.
- Cada personaje y tarjeta abre la ficha rápida del HUD de referencia, con retrato pixelado, estado, etapa, última actualización, tarea genérica, actividad ambiental y hallazgo autorizado. Los accesos llevan al expediente, al chat o al informe CEO y son navegables por teclado.
- La Fase 2 conecta el polling confirmado a `OfficeViva`: los cuatro agentes reciben estados `idle`, `working`, `done` o `error`, la etapa activa y una tarea genérica. El array solo cambia cuando cambia esa información, para no reiniciar animaciones con sondeos idénticos. Las etapas son las que publica `app/agents_service.py`.
- La Fase 3 entrega al Centro de mando datos reales cada 30 segundos. Ventas y margen usan 30 días; los avisos de PM se envían únicamente a destinatarios configurados por un administrador mediante SMTP y quedan registrados. La exportación de almacén usa artículos sin ventas durante más de 180 días.
- La Fase 4 sustituye la escena por tarjetas accesibles en móvil. `/ai-control/oficina?modo=pantalla` usa una vista grande solo lectura que no solicita datos del Centro de mando ni muestra hallazgos, acciones, historial o controles. Las mutaciones de Oficina Viva requieren administrador también en API.

- Ocho rutas del módulo: Hoy, analistas, oficina, señal, episodio, decisiones, reglas y guía. No confundir la entrada Hoy con el gabinete.
- `/ai-control/oficina` monta el módulo cerrado `agent-office-viva/OfficeViva.tsx`. Sustituye la integración manual de la escena anterior; conserva tema claro/oscuro, accesos del módulo y el historial React. No ejecuta agentes adicionales por animación.
- La prioridad visual es estado real `agent_executions` → entrega de los tres informes en la mesa central → actividad ambiental solo en reposo. El sondeo existente de 3/8 segundos sigue siendo la fuente; no crear un bus SSE en memoria ni inferir trabajo por animación. El catálogo ambiental está en `frontend/src/agent-office/model.ts`, con destinos, pesos, duraciones y frases genéricas; el baño es exclusivo y dura 20–40 segundos. La pestaña oculta detiene la simulación.

## Actualización v1.79 — reuniones de la Oficina Viva

- La Oficina Viva ofrece reuniones exclusivamente de presentación: la ejecutiva reúne a María, Lucía, Mattia y CEO en la mesa central; las individuales reúnen al analista elegido con el CEO y abren su ficha.
- El Canvas solo usa frases genéricas de etapa. Los hallazgos reales se muestran en paneles React autorizados y las reuniones no modifican análisis, detectores ni estados de `agent_executions`.
- Al finalizar una reunión, los personajes regresan a una posición coherente con su estado confirmado por servidor (análisis en curso o puesto disponible).
- La oficina es una ruta lazy para no cargar Pixi en las demás pestañas. `prefers-reduced-motion` evita desplazamientos y tecleo; las etiquetas reales se exponen además como texto fuera del canvas. Las fases de escena, fichas rápidas, historial/usage y avisos opcionales ya están disponibles; las vistas específicas de móvil y modo pantalla siguen pendientes de una solicitud separada.
- Capturas de referencia de los placeholders: `docs/screenshots/office-placeholders-light.png` y `docs/screenshots/office-placeholders-dark.png` (estado sintético, sin datos empresariales).
- `GET /agents/execution` consulta el último estado de la empresa. `useAgentExecution` actualiza oficina y gabinete cada 3 segundos durante ejecución y cada 8 en reposo. Se elimina el progreso simulado por temporizador.
- `agent_executions` se crea de forma aditiva al arrancar el backend. `ExecutionProgress` escribe desde sesiones independientes; evita ejecuciones simultáneas por empresa y rechaza publicaciones de un run_id sustituido. Después de 30 minutos sin actualización se informa interrupción y se permite reintento.
- Señales y episodios deterministas se confirman antes de narrar. Un fallo de API no debe guardar un informe exitoso: `_checked_report` rechaza texto vacío o prefijado por Error. Informe preparado no equivale a informe guardado.
- Pruebas: `tests/test_agent_execution.py`, aislamiento, concurrencia, caducidad, secuencia real, publicación y fallo de narración. La telemetría conserva solo la última ejecución, no es una cola de trabajos ni un historial de eventos.
- Render requiere `psycopg[binary]` para abrir conexiones PostgreSQL con el dialecto elegido por SQLAlchemy. La ausencia de ese paquete impidió iniciar v1.61; v1.62 añade la dependencia. Confirmar el arranque del backend tras el despliegue.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Entrada: `/ai-control`, vista Hoy en `frontend/src/pages/AiControlToday.tsx`. Gabinete: `/ai-control/analistas`, `frontend/src/pages/AiControlPanel.tsx`. Backend: `app/routers/agents.py`, `app/agents_service.py`, `app/agent_metrics.py` y `app/agent_studies.py`.
- Contexto exhaustivo del módulo: `docs/claude-tabs/control-ia/CONTEXTO_CONTROL_IA.md`. Actualizarlo cuando cambien detectores, contratos de evidencia, rutas, cálculos, límites o comportamiento visible.
- Coordina agentes: María (inventario), Lucía (ventas), Mattia (finanzas) y consolidación CEO.
- Carga configuración de fases, readiness de datos, informe diario, históricos, estudios y chat por agente usando el cliente API central.
- Antes de habilitar conclusiones, respetar `readiness`: ventas e inventario incompletos deben convertirse en aviso explícito, no en hallazgo.
- Los estudios e informes deben indicar período, evidencia numérica, riesgos, oportunidades y métricas de seguimiento. Persistir solo respuestas asociadas al agente y usuario correctos.
- El “Cerebro del Negocio” comparte contexto con el Copilot; no mezclar contexto entre empresas.
# Actualización v1.25 — motor de señales

- `app/agent_signals.py` ejecuta detectores deterministas y persiste `agent_signals`; el LLM recibe exclusivamente un evidence bundle JSON, sin herramientas SQL ni cálculos propios.
- `fingerprint` identifica detector y entidad; desde v1.29 no incluye la ventana móvil. Estados permitidos: nueva, persistente, resuelta y descartada; priorizar impacto EUR × confianza, severidad y persistencia.
- Catálogo inicial: Lucía (caída de facturación, precio×volumen, concentración), María (rotura A, cobertura/lead time, exceso y stock muerto) y Mattia (erosión MGD). El CEO consolida solo las señales de mayor prioridad.
- Comprobar cobertura real antes de inferir tendencias o DIO temporal. XYZ en esta aplicación clasifica valor de inventario actual y puede calcularse con snapshot; no equivale a estabilidad de demanda.

## Actualización v1.26 — control de ruido

- Las caídas temporales de ventas y MGD pasan por mediana/MAD, CUSUM y Benjamini-Hochberg (`FDR=10%`). No usar normalidad ni media±2σ sobre picos comerciales.
- La alerta exige evidencia estadística corregida y persistencia; el p-valor nunca determina el orden de negocio.
- `MAX_NEW_SIGNALS_PER_AGENT_PER_DAY=5` es una regla de producto: admitir solo las cinco nuevas de mayor impacto por agente y día.

## Actualización v1.27 — investigación verificable

- `app/agent_investigations.py` implementa plan → recolección desde `CATALOG` → redacción con `[eN]` → verificación. No añadir SQL generado por LLM.
- La API `POST /agents/{agent_name}/investigations` devuelve el plan, el bundle `e1...eN`, informe y resultado de verificación. Si quedan números huérfanos o citas inválidas, no publicar el informe.
- Los informes deben incluir Hipótesis descartadas y Qué dato falta; no afirmar que una hipótesis fue descartada sin bloque de evidencia correspondiente.

## Actualización v1.29 — garantías de publicación

- No incluir `periodo_inicio`/`periodo_fin` en el fingerprint: la señal debe persistir aunque se actualice la ventana y solo resolverse al desaparecer del detector.
- El validador exige que cada línea que contenga cifras tenga referencia `[eN]`; cada cifra se compara exclusivamente con el bloque citado, con formatos de redondeo permitidos.
- La acción “Investigar señal” en Control IA consume la API contractual y no muestra una redacción bloqueada.

## Actualización v1.30 — sin legado de herramientas

- No reintroducir tool-calling SQL en `agents_service.py`; sus únicos datos de entrada son señales y evidence bundles.
- `evidence_contract.py` centraliza el verificador cifra→cita. Mantener pruebas para redondeo permitido, cifra sin cita y cita que apunta al bloque equivocado.

## Actualización v1.36 — persistencia de señales

- `refresh_agent_signals` asigna explícitamente el `empresa_id` al crear cada `AgentSignal`; nunca confiar en que el detector lo incluya en su diccionario.
- La ruta de nueva ejecución revierte la transacción si falla el flujo, registra el detalle técnico en backend y mantiene un mensaje seguro para el frontend.
- La persistencia de una señal nueva debe estar cubierta por una prueba que valide el aislamiento multiempresa.

## Actualización v1.67

- La Oficina consulta `/agents/executions/history`, limitado y aislado por la empresa autenticada, para mostrar ejecuciones y tiempos reales.
- Los errores públicos usan códigos acotados (`model_error`, `workflow_error`, `stale_execution`); no exponer excepciones internas.
- Los avisos son preferencias locales desactivadas por defecto. `Notification.requestPermission()` solo se invoca tras activar manualmente el aviso del navegador.

## Actualización v1.68

- Los globos ambientales mantienen texto oscuro sobre su fondo claro en tema claro y oscuro. Los globos azules de trabajo real conservan texto blanco.

## Actualización v1.83 — ficha de agentes y control anti-ruido comercial

- `frontend/src/content/agentProfiles.ts` es la fuente visible única para describir a María, Lucía, Mattia y CEO en el Gabinete: modelo efectivo, propósito, enfoque, análisis, fórmulas, validaciones, prioridad y límites. Las fichas se muestran en `/ai-control/analistas` y, para los analistas, también dentro de su expediente.
- La etiqueta de Fase 2 es **Consolidación ejecutiva · GPT-6.1 Sol** y el rol es **CEO · Dirección**. No presentar `o1` ni “Director de Operaciones”; el modelo visible debe coincidir con el modelo configurado y ejecutado.
- `caida_ventas_comercial` aplica umbral configurable y validación temporal equivalente a familia/SKU: mediana + MAD, CUSUM de persistencia y Benjamini–Hochberg (`FDR=10%`). Una caída aislada por comercial no debe entrar a la bandeja solo por superar el umbral.
- El modelo no consulta la BBDD ni recalcula: recibe el evidence bundle y explica lo ya comprobado. Una eventual migración de modelo requiere validar acceso de cuenta y endpoint antes de cambiar el modelo efectivo.

## Actualización v1.84 — modelos del CEO

- El CEO usa `gpt-5.6-terra` para el chat ejecutivo y `gpt-6.1-sol` para la consolidación final.
- `CEO_CHAT_MODEL`, `CEO_REPORT_MODEL`, `CEO_CHAT_REASONING_EFFORT`, `CEO_REPORT_REASONING_EFFORT` y `CEO_MODEL_FALLBACK` permiten cambiar la selección sin editar código. Terra usa esfuerzo medio y Sol alto por defecto. Ante un error explícito de modelo, acceso o permisos, el CEO vuelve a `gpt-4o` y la telemetría registra el modelo realmente usado.
- La interfaz debe mostrar **Consolidación ejecutiva · GPT-6.1 Sol** y la ficha del CEO debe distinguir Terra (consulta) de Sol (informe). No presentar el fallback como si fuera una ejecución Sol/Terra.

## Actualización v1.85 — Terra para María, Lucía y Mattia

- Los tres analistas usan `gpt-5.6-terra`, razonamiento medio, en informes, chats e investigaciones con contrato de evidencia. Solo el CEO usa Sol y únicamente para la consolidación final.
- `ANALYST_MODEL`, `ANALYST_REASONING_EFFORT` y `ANALYST_MODEL_FALLBACK` configuran el grupo de analistas. El fallback a `gpt-4o` solo se activa ante un error explícito de modelo, disponibilidad o permisos y la telemetría guarda el modelo efectivo.
- Las fichas visibles deben mostrar **GPT-5.6 Terra** para María, Lucía y Mattia. El modelo sigue sin consultar BBDD, generar SQL ni recalcular cifras.

## Actualización v1.86 — encuadre y perfil de la Oficina Viva

- El autoencuadre ya no reserva 330 px dentro del canvas para una ficha lateral: abre centrado, más próximo y con margen de seguridad. El usuario conserva rueda, arrastre y doble clic para reencuadrar.
- El perfil de cada personaje se presenta como modal central responsive sobre la oficina. Reutiliza el retrato de `public/assets/agents`, la fuente funcional `agentProfiles.ts` y el último hallazgo publicado, nunca inventa alertas ni muestra cifras dentro del canvas.
- La ficha detalla propósito, modelo, método, tareas analíticas, validaciones, fórmulas y prioridad, además de estado/etapa reales. En móvil ocupa la pantalla; Escape y el foco atrapado siguen funcionando.

## Actualización v1.87 — HUD de referencia

- La escena Canvas queda cubierta por el HUD exacto de `frontend/src/agent-office-viva/hud/`: cabecera Five Minutes y reloj, control Día y noche, inicio de análisis para administrador, tarjetas y ficha rápida. En móvil se conservan las tarjetas horizontales y la ficha como hoja inferior definidos por el CSS del prototipo.
- `OfficeHandle.subscribe()` entrega una instantánea limitada a 4 Hz: hora Madrid, agente seleccionado y estado, etapa, progreso y actividad ambiental de cada integrante. La selección opera en ambos sentidos entre tarjeta, ficha y personaje.
- La hoja rápida no duplica la antigua ficha extensa. Hallazgos, tareas y actividad se mantienen genéricos o autorizados; nada sensible entra en el canvas. Vite carga Pixelify Sans y Nunito desde el CSS porque `next/font` es exclusivo de Next.js.

## Actualización v1.89 — montaje del módulo cerrado

- `vendor/office-viva.js`, `vendor/office-viva.css` y `vendor/office-viva.d.ts` son un módulo de proveedor cerrado: se copian de forma literal, se excluyen de ESLint/Prettier y no se modifican para resolver problemas. Si falla, informar el error literal y corregir únicamente la integración exterior tras autorización.
- `OfficeViva.tsx` es el único wrapper importado por la aplicación. En la Fase 1 recibe tema, permiso de ejecución, solo lectura y callbacks de navegación; todavía no recibe estados de agentes ni datos de negocio.
- `/oficina-demo` se registra solo en Vite de desarrollo y renderiza `<OfficeViva demo theme="dark" />` sin autenticación. El build productivo no debe ofrecer esa ruta.
- Se conserva `engine.ts`, `OfficeVivaCanvas.tsx` y `hud/` como legado sin uso hasta que la validación del módulo cerrado quede aprobada. La ruta real no debe mezclar ambas implementaciones.

## Actualización v1.43

- La interfaz de Control IA debe tipar errores de API como `unknown`, validar la forma de las metodologías recibidas y usar botones nativos para abrir expedientes de agentes.
- La carga inicial se resuelve desde la promesa de la API, sin invocar desde un efecto funciones que cambien estado de forma síncrona.

## Actualización v1.48 — interfaz Apple UI

- Control IA presenta configuración, readiness, informes, estudios, expedientes y chats con superficies neutras, tipografía de sistema y azul único para interacción.
- Los colores verde, ámbar y rojo solo comunican estados reales: disponibilidad, calidad, éxito, aviso o error. No usarlos como decoración de agentes o fases.
- Mantener los informes Markdown, tablas, laboratorio y chat de cada agente con controles nativos, foco visible y desplazamiento seguro en contenido extenso.

## Actualización v1.49 — episodios, feedback y decisiones

- La entrada de Control IA es `/ai-control` (vista **Hoy**). El gabinete previo se mantiene en `/ai-control/analistas`; las rutas directas son `/ai-control/senal/:id`, `/ai-control/episodio/:id` y `/ai-control/decisiones`.
- `agent_signals` guarda tipo de impacto, importe ponderado, episodio y datos de descarte. `agent_signal_links` solo puede crearse mediante reglas deterministas; `agent_episodes` agrupa componentes conexas y deduplica enlaces `duplica`.
- Los importes realizado, en riesgo y capital deben mostrarse y totalizarse por separado. El ponderado sirve únicamente para ordenar.
- `POST /agents/signals/{id}/feedback` y `/discard` alimentan calidad por detector; el descarte necesita motivo y aplica supresión de 30 días a falso positivo/no accionable.
- Las decisiones se gestionan en `/agents/decisions` y siempre se vinculan a una señal o episodio de la misma empresa. Al abrir un expediente desde una señal, el chat recibe `signal_id` y su evidence bundle exacto.

## Actualización v1.50 — profundidad de dominio (Bloque 3)

- Las señales guardan `naturaleza`: `riesgo` u `oportunidad`. Mantener los topes independientes de cinco riesgos y dos oportunidades nuevas por agente/día; el CEO y la bandeja no deben mezclar ambas naturalezas como una pérdida única.
- `empresa_reglas_negocio` centraliza `lead_time_dias`, `margen_objetivo_pct`, `cliente_estrategico`, `sku_discontinuado`, `familia_estacional` y `umbral_detector`. Resolver en `app/business_rules.py`, registrar el origen en evidencia y rechazar solapes de fechas.
- La gestión de reglas está en `/ai-control/reglas` y en `GET/POST/PATCH/DELETE /agents/business-rules`; solo administradores pueden mutarlas.
- Los playbooks se eligen por detector en `app/agent_playbooks.py`. Una investigación no debe generar preguntas ni SQL libre.

## Actualización v1.51 — guía y puesta en marcha

- `frontend/src/content/glosario.ts` es la fuente única de definiciones para la guía y los tooltips; no duplicar sus textos en componentes.
- El recorrido se abre desde `Cómo funciona`, se persiste con `/agents/onboarding/control_ia_tour` y debe mantener foco atrapado, anuncio de paso, Escape, salto y comportamiento de hoja inferior en móvil.
- `/ai-control/guia` es la guía permanente. El checklist de `/ai-control` consulta estado real mediante `/agents/setup-checklist`; nunca debe permitir marcar una configuración no comprobada.
- Los estados vacíos comunican cobertura insuficiente, ausencia de cambios relevantes, falta de feedback o ausencia de decisiones y enlazan al siguiente paso útil.
