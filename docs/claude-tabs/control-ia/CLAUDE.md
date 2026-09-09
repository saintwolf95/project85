# Control IA

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/ai-control`; componente: `frontend/src/pages/AiControlPanel.tsx`; backend: `app/routers/agents.py`, `app/agents_service.py`, `app/agent_metrics.py` y `app/agent_studies.py`.
- Contexto exhaustivo del módulo: `docs/claude-tabs/control-ia/CONTEXTO_CONTROL_IA.md`. Actualizarlo cuando cambien detectores, contratos de evidencia, rutas, cálculos, límites o comportamiento visible.
- Coordina agentes: María (inventario), Lucía (ventas), Mattia (finanzas) y consolidación CEO.
- Carga configuración de fases, readiness de datos, informe diario, históricos, estudios y chat por agente usando el cliente API central.
- Antes de habilitar conclusiones, respetar `readiness`: ventas e inventario incompletos deben convertirse en aviso explícito, no en hallazgo.
- Los estudios e informes deben indicar período, evidencia numérica, riesgos, oportunidades y métricas de seguimiento. Persistir solo respuestas asociadas al agente y usuario correctos.
- El “Cerebro del Negocio” comparte contexto con el Copilot; no mezclar contexto entre empresas.
# Actualización v1.25 — motor de señales

- `app/agent_signals.py` ejecuta detectores deterministas y persiste `agent_signals`; el LLM recibe exclusivamente un evidence bundle JSON, sin herramientas SQL ni cálculos propios.
- `fingerprint` deduplica detector, entidad y ventana. Estados permitidos: nueva, persistente, resuelta y descartada; priorizar impacto EUR × confianza, severidad y persistencia.
- Catálogo inicial: Lucía (caída de facturación, precio×volumen, concentración), María (rotura A, cobertura/lead time, exceso y stock muerto) y Mattia (erosión MGD). El CEO consolida solo las señales de mayor prioridad.
- Con inventario desde el 06/08/2026 no se deben generar tendencias, DIO temporal ni XYZ fiables todavía.

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
