# Control IA

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/ai-control`; componente: `frontend/src/pages/AiControlPanel.tsx`; backend: `app/routers/agents.py`, `app/agents_service.py`, `app/agent_metrics.py` y `app/agent_studies.py`.
- Coordina agentes: María (inventario), Lucía (ventas), Mattia (finanzas) y consolidación CEO.
- Carga configuración de fases, readiness de datos, informe diario, históricos, estudios y chat por agente usando el cliente API central.
- Antes de habilitar conclusiones, respetar `readiness`: ventas e inventario incompletos deben convertirse en aviso explícito, no en hallazgo.
- Los estudios e informes deben indicar período, evidencia numérica, riesgos, oportunidades y métricas de seguimiento. Persistir solo respuestas asociadas al agente y usuario correctos.
- El “Cerebro del Negocio” comparte contexto con el Copilot; no mezclar contexto entre empresas.

