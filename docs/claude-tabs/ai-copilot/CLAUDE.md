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
