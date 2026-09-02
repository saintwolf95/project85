# AI Copilot

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/copilot`; componente: `frontend/src/pages/AiCopilot.tsx`; API: `app/routers/copilot.py`; lógica: `app/copilot_service.py` y `app/copilot_orchestrator.py`.
- Soporta Fast (`gpt-4o`), Thinking (`o3-mini`) y Ultra (`o1`). Todos deben responder desde los mismos datos verificados.
- Las consultas semánticas frecuentes se resuelven de forma determinista y parametrizada. Para SQL generado, conservar la validación estricta de solo lectura y `empresa_id`.
- El parser debe conservar el contexto en aclaraciones: métrica, período, agrupación, filtros y comparación. Admite fechas explícitas, año fiscal, últimos N días y meses escritos/abreviados, incluidos rangos entre años.
- Thinking debe producir análisis de negocio con importes, comparación, impulsores por familia/marca/sección y Top 5 SKU cuando proceda. Evitar lenguaje genérico e inferencias causales no demostradas.
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
