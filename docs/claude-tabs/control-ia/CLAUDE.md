# Control IA

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/ai-control`; componente: `frontend/src/pages/AiControlPanel.tsx`; backend: `app/routers/agents.py`, `app/agents_service.py`, `app/agent_metrics.py` y `app/agent_studies.py`.
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
