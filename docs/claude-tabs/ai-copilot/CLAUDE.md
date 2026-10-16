# AI Copilot

## Estado verificado · 08/10/2026 · v1.60

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
