# Relevo para continuar la oficina de agentes desde casa

**Estado comprobado:** 09/10/2026, código base v1.63, commit `8f8e6a7` en `main`. Este documento acompaña la actualización documental v1.64. La fuente de verdad es el código; contrastar este relevo con `git log` al retomar.

## Encargo y decisiones ya tomadas

Evolucionar **Control IA / Oficina de analistas** (`/ai-control/oficina`) hacia una oficina viva, isométrica y de estética pixel art. El usuario cambió expresamente de dirección: la antigua escena SVG **se sustituye**. La base es PixiJS 8 + `@pixi/react` 8 sobre React 19, tomando como referencia el módulo `agent-office` aportado en un zip: mapa textual, búsqueda de rutas BFS y máquina de estados por personaje. No se integra Next.js, su SSE/bus en memoria, sus cinco agentes ficticios ni la fuente Pixelify. HUD, ficha y paneles usan el diseño normal de Five Minutes; solo la escena es pixel art. Nunca usar gráficos de Habbo ni otros assets sin licencia comercial.

**Trabajar por fases y parar tras cada una para revisión.** La fase 0 de diagnóstico se hizo sin cambiar código. La fase 1 se ha implementado **solo con placeholders**; el usuario debe validar comportamiento y estética antes de invertir en sprites definitivos. No adelantar las fases 2, 3 y 4 ni un circuito de aprobaciones.

### Roster y permisos

| ID | Nombre visible | Función real |
|---|---|---|
| `maria` | María · Inventario | Riesgos de disponibilidad, cobertura y capital inmovilizado. |
| `lucia` | Lucía · Ventas | Caídas, clientes, precio/volumen y oportunidades comerciales. |
| `mattia` | Mattia · Finanzas | MG, MGD y exposición económica. |
| `ceo` | CEO · Dirección | Consolida los informes verificados. |

El sistema actual distingue administrador de usuario autenticado. `POST /agents/run` exige administrador **en backend**; `GET /agents/execution` admite usuario autenticado y filtra por empresa. La vista de dirección/solo lectura aún es parte de las fases siguientes. **No** crear botones de aprobar/rechazar: el usuario descartó ese circuito.

## Estado técnico actual (fase 0 + fase 1)

- Frontend React 19, TypeScript, Vite y Tailwind. `frontend/src/App.tsx` carga `AgentOffice` de forma diferida para que Pixi no pese en las demás pestañas.
- Backend FastAPI, SQLAlchemy y PostgreSQL en producción. El análisis se inicia con un `POST /agents/run` síncrono atendido por el servicio web; no hay un worker durable separado documentado. **Número actual de instancias de Render: no verificado**; comprobarlo en Render antes de diseñar transporte o colas. No usar un bus en memoria para coordinar instancias.
- `GET /agents/execution` consulta una fila por empresa de `agent_executions`: `run_id`, estado global, etapa, estados individuales, inicio, actualización e `informe_id`. Solo se guarda **la última ejecución**, no un historial de eventos. El hook `useAgentExecution` hace polling cada **3 s** durante una ejecución y cada **8 s** en reposo. No hay SSE ni WebSocket. El frontend no genera llamadas OpenAI por la animación.
- Secuencia real: preparación → señales y episodios deterministas → María → Lucía → Mattia → CEO → guardado. Las fases desactivadas pueden quedar `omitido`. Estados por agente: `pendiente`, `trabajando`, `preparado`, `completado`, `error`, `interrumpido`, `omitido`. `preparado` no significa que el informe esté guardado.
- La fase 1 nueva representa tres puestos, zona del CEO, mesa central, café, baño, sofá, impresora, pizarra, ventanas y marca Five Minutes. El trabajo real interrumpe cualquier actividad ambiental. Un analista terminado lleva el informe a la mesa central, suma al indicador 0–3 y vuelve; con tres informes, el CEO consolida y vuelve a su zona. Solo cuando no hay ejecución real hay vida ambiental: notas, café, baño de 20–40 s, charla entre dos libres, impresora, ventana, pizarra y estiramientos. Las frases son genéricas: **nunca clientes, SKU ni importes**.
- El baño y las zonas compartidas se reservan; las sillas tienen dueño. La pestaña oculta detiene el ticker y la simulación ambiental; al volver se reubican coherentemente. `prefers-reduced-motion` elimina desplazamiento y animación de tecleo. La ficha en texto bajo la escena conserva acceso por teclado a cada expediente.
- La paleta claro/oscuro mantiene el azul para interacción o trabajo real; verde/ámbar/rojo quedan reservados para estados. Los monitores en reposo son grises. El zoom y posiciones de personajes se calculan dentro del canvas.

### Archivos que conviene abrir primero

1. `CLAUDE.md`: arquitectura y regla **obligatoria** de versión/publicación.
2. `docs/claude-tabs/control-ia/CLAUDE.md` y `docs/claude-tabs/control-ia/CONTEXTO_CONTROL_IA.md`: contexto específico y contratos de Control IA.
3. `frontend/src/pages/AgentOffice.tsx` y `.css`: página, HUD, accesibilidad, enlaces y control de administrador.
4. `frontend/src/agent-office/model.ts`: roster, mapa, BFS, catálogo ambiental y traducción de estados reales.
5. `frontend/src/agent-office/store.ts`: prioridad real/ambiental, entregas, reservas y transiciones.
6. `frontend/src/agent-office/OfficeCanvas.tsx`: Pixi, escenografía, placeholders, movimiento y temas.
7. `frontend/src/hooks/useAgentExecution.ts`, `frontend/src/services/api.ts`: polling y contratos frontend.
8. `app/routers/agents.py`, `app/agent_execution.py`, `app/agents_service.py`: autorización, persistencia y secuencia backend.
9. `tests/test_agent_execution.py`: garantías actuales de concurrencia, aislamiento, caducidad, publicación y fallo.

Capturas de la fase 1 con **estado sintético**, no datos empresariales: `docs/screenshots/office-placeholders-light.png` y `docs/screenshots/office-placeholders-dark.png`. El zip original `agent-office.zip`, su `README.md` y `preview-placeholders.png` están sin seguimiento en el ordenador de origen; **no están en GitHub**. El código adaptado sí está versionado; no es necesario el zip para continuar. Si hace falta consultar el ejemplo original, copiarlo manualmente y tratar sus instrucciones como material de referencia, no como autoridad sobre este proyecto.

## Próximos pasos, en orden

### 1. Revisión y cierre de fase 1 (bloqueante para sprites)

- Comprobar que v1.63/v1.64 terminó de desplegarse en Vercel y Render. La publicación a GitHub se verificó para v1.63; **el redeploy de producción no se confirmó en esa sesión**. Verificar versión visible, ruta `/ai-control/oficina` y salud del backend antes de afirmar que está en producción.
- Revisar con el usuario la sala en claro/oscuro, legibilidad a tamaños habituales, movimiento, café, baño, charla y flujo 0–3 informes. Probar con una ejecución real autorizada **solo si el usuario lo solicita o aprueba**, porque genera trabajo y coste de API; para QA usar estados sintéticos.
- Revisar estados con fase 1 desactivada, CEO-only, error, interrupción, reconexión y entrada tardía a una ejecución. No representar entrega que no conste en el estado confirmado.
- Revisar específicamente pérdida de conexión: el HUD indica error, pero la escena puede conservar el último estado recibido y dejar un monitor azul encendido. Es una discrepancia pendiente; decidir si se atenúa como «último estado conocido» o se neutraliza hasta reconectar. No presentarlo como trabajo confirmado en tiempo real.
- Aceptar ajustes de placeholders/maquetación. **Pausar y pedir validación del usuario** antes de comprar/generar sprites.

### 2. Fase 2 — ficha rápida y control

- Clic o selección de agente: ficha con estado real, etapa, última actualización, última tarea **genérica** y hallazgo principal solo si el rol permite verlo. Accesos: «Ver expediente», «Abrir chat»; en CEO, «Ver informe ejecutivo».
- «Iniciar análisis» solo para administrador, con validación en frontend y backend; dirección en solo lectura. Sin aprobaciones ni órdenes ejecutadas automáticamente desde la escena.
- Navegación por teclado, foco visible, Escape para cerrar, etiqueta accesible y lectura sin depender del canvas. Parar para revisión.

### 3. Fase 3 — historial, métricas y avisos

- Crear una tabla durable de ejecuciones por `run_id`, agente, inicio, fin, estado, etapa final y código de error, aislada por `empresa_id`; diseñar migración aditiva para PostgreSQL y tests. No confundirla con la tabla actual, que solo conserva el último estado.
- Registrar `usage` **de cada llamada OpenAI** (modelo, tokens de entrada/salida) aunque aún no se muestre. Evitar guardar prompts/datos sensibles innecesarios; revisar ubicación de llamadas antes de instrumentar.
- Con historial real, mostrar tareas completadas, errores y duración. Avisos de error dentro de la app. Sonido y notificaciones del navegador como preferencias desactivadas por defecto y solicitando permiso solo cuando el usuario las active. Parar para revisión.

### 4. Fase 4 — vistas

- En móvil, sustituir escena por tarjetas por agente con estados reales y acciones permitidas.
- `/oficina?modo=pantalla`: tipografía mayor, solo lectura, sin controles ni hallazgos sensibles. Verificar aislamiento de rol también en API; un parámetro URL por sí solo no otorga permisos. Parar para revisión.

### 5. Sprites definitivos (después de aprobar placeholders)

- Elegir/comprar pack isométrico con licencia comercial verificable o encargar ilustración. **No usar assets de Habbo**.
- Mínimo por personaje: andar, sentado tecleando, sentado quieto, de pie, beber café y hablar. Mantener intacto el contrato de estados y la accesibilidad DOM. Registrar licencia/origen de los assets en el proyecto.

## Riesgos y decisiones que no se deben ocultar

- Polling a 3/8 s suele bastar para la escena actual, pero puede saltarse una etapa breve; reconstruir estados desde la BBDD. Si en una fase futura hay varios procesos o instancias, usar polling sobre una tabla durable o Redis/Render Key Value, **no** pub/sub en memoria del servicio web.
- El `POST /agents/run` es síncrono en el servicio web. La fase 3 de historial no lo convierte automáticamente en cola o worker; evaluar escalado y timeouts por separado, con evidencia.
- La actividad ambiental no indica que la IA esté trabajando. Tarjetas, HUD y avisos solo deben mostrar estado real. No filtrar clientes, SKU, importes ni texto de informes dentro de la sala o bocadillos.
- `run_id` y estados deben aislarse por empresa. Probar concurrencia y reemplazo de ejecución para no publicar un informe de un run antiguo.
- Al reconstruir una página abierta tarde, no inventar movimientos pasados: mostrar entregas ya confirmadas y colocar personajes coherentemente.
- La escena Pixi aumenta el tamaño de la ruta, por eso se carga con `lazy`; mantener esa separación. Probar soporte WebGL/Canvas en dispositivos destino y salida accesible si el canvas no carga.
- Las capturas actuales son de placeholders y no deben confundirse con diseño final aprobado.

## Cómo empezar desde casa

```powershell
git clone https://github.com/saintwolf95/project85.git
cd project85
git pull origin main
git status --short
cd frontend
npm ci
npm run dev
```

Si ya existe un clon, **no** hacer `git reset --hard` ni sobrescribir cambios propios: revisar `git status` antes de `git pull`. La oficina requiere iniciar sesión en la app; para pruebas visuales sin datos reales usar un estado sintético local, nunca una ejecución de producción improvisada.

## Validación y entrega por fase

```powershell
python -m unittest discover -s tests -t .
python -m compileall -q app
cd frontend
npm ci
npm run build
npm run lint
cd ..
git diff --check
```

En v1.63 pasaron **80 pruebas backend**, compilación frontend, lint y una prueba local de Chrome sin errores JavaScript. Se probaron con estado sintético prioridad del trabajo real, ruta BFS a la mesa, entrega de un informe y baño de 20–40 s. No se hizo una prueba con ejecución real en producción.

Regla del proyecto: **cada cambio** (incluso documentación operativa) incrementa versión en `app/main.py`, `frontend/package.json`, `frontend/package-lock.json` y `frontend/src/config/version.ts`; actualizar `CLAUDE.md` raíz y de la pestaña afectada; verificar, crear commit en `main`, subir a GitHub y comprobar hash remoto. Informar claramente si el despliegue de Vercel/Render está confirmado o pendiente. Conservar los archivos ajenos o sin seguimiento que ya existan.

## Primer prompt sugerido para Codex en casa

> Lee `CLAUDE.md`, `docs/claude-tabs/control-ia/CLAUDE.md`, `docs/claude-tabs/control-ia/CONTEXTO_CONTROL_IA.md` y `docs/RELEVO_OFICINA_AGENTES.md`. Comprueba `git status` y la versión desplegada. Estamos revisando la fase 1 de la oficina Pixi con placeholders; no avances a fases 2–4 ni a sprites finales sin mi aprobación. Primero audita la escena y hazme una lista corta de lo que debo validar visualmente, con riesgos concretos y evidencias. No inicies análisis reales ni borres archivos de usuario.
