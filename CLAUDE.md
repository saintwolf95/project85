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
6. Data Engineering
7. Guía de Importación
8. LibrerIA
9. Power BI Services

La ruta interna `/alerts` también está documentada porque sigue registrada en el router aunque no está en el menú visible.

## Regla obligatoria de versionado y publicación

**Todo cambio funcional, de interfaz, API, datos, documentación operativa o corrección debe quedar versionado y publicado en GitHub antes de considerarse terminado.**

1. Incrementar versión en los cuatro puntos: `app/main.py`, `frontend/package.json`, `frontend/package-lock.json` y `frontend/src/config/version.ts`.
2. Ejecutar verificaciones proporcionales: `python -m unittest ...`, `python -m compileall -q app`, `npm.cmd run build` y `git diff --check` cuando apliquen.
3. Crear commit en `main` con el formato acordado: `Tipo (v.1.XX) : Descripción breve en español`.
4. Subir con `git push origin main` y verificar que el hash local coincide con `refs/heads/main`.
5. Informar la versión publicada y que el redeploy puede requerir recarga forzada del navegador.

No modificar archivos ajenos a la solicitud ni usar operaciones destructivas de Git. Si una migración de producción fuese necesaria, incluir una ruta segura de inicialización o la migración correspondiente.

## Versiones y precedentes relevantes

- v1.17 inicializa de forma segura la tabla de histórico de inventario en producción.
- v1.18 elevó el límite de catálogo analítico a 20.000 SKU para ABCXYZ y previsión.
- v1.19 corrigió la memoria de aclaraciones del Copilot.
- v1.20 amplió los períodos naturales y el formato de fecha/hora de mensajes.
# Actualización v1.25 — señales verificadas de Control IA

- El flujo de agentes usa `agent_signals`: detectores deterministas producen evidencia y el LLM solo narra, contextualiza y recomienda sobre ese JSON. No conceder SQL ni cálculo libre al LLM en este flujo.
- Cada señal mantiene entidad, ventana, severidad, impacto EUR, confianza, evidencia y `fingerprint`; se deduplica como `persistente` y se resuelve cuando deja de detectarse.
- El CEO consolida las 5-7 señales con mayor impacto/confianza. El inventario empieza el 06/08/2026: hasta ampliar la muestra, usar detectores de nivel y no tendencias ni XYZ fiables.

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

- Data Engineering admite archivos CSV/XLSX de hasta 50 MB y libros XLSX con hasta 512 MB de contenido interno, manteniendo el límite operativo de 100.000 filas.
- No volver a usar solo el tamaño descomprimido como detector de seguridad: validar además cantidad de componentes y ratio de compresión para distinguir un Excel comercial normal de una bomba ZIP.
- Mantener sincronizados los límites visibles en Data Engineering, Guía de Importación y backend.
