# Contexto de las pestañas del sidebar

Revisión: 08/10/2026 · documentación v1.60 sobre implementación v1.59.
Contrastado con `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`, páginas y rutas backend.

| Pestaña visible | Ruta | Contexto | Componente principal |
| --- | --- | --- | --- |
| Dashboard | `/` | [CLAUDE.md](dashboard/CLAUDE.md) | `Home.tsx` |
| Intelligence ABCXYZ | `/inventory` | [CLAUDE.md](intelligence-abcxyz/CLAUDE.md) | `Intelligence.tsx` |
| Predicción Demanda | `/forecast` | [CLAUDE.md](prediccion-demanda/CLAUDE.md) | `DemandForecasting.tsx` |
| AI Copilot | `/copilot` | [CLAUDE.md](ai-copilot/CLAUDE.md) | `AiCopilot.tsx` |
| Control IA | `/ai-control` | [CLAUDE.md](control-ia/CLAUDE.md) | `AiControlToday.tsx` |
| Marginalidad | `/marginalidad` | [CLAUDE.md](marginalidad/CLAUDE.md) | `Marginality.tsx` |
| Data Engineering | `/integrations` | [CLAUDE.md](data-engineering/CLAUDE.md) | `DataEngineering.tsx` |
| Guía de Importación | `/import-guide` | [CLAUDE.md](guia-importacion/CLAUDE.md) | `DataImportGuide.tsx` |
| LibrerIA | `/libreria` | [CLAUDE.md](libreria/CLAUDE.md) | `Libreria.tsx` |
| Power BI Services | `/powerbi` | [CLAUDE.md](power-bi-services/CLAUDE.md) | `PowerBiMock.tsx` |

Las diez pestañas tienen contexto propio. Las reglas comunes están en el `CLAUDE.md` raíz. Los apartados históricos de cada documento explican versiones previas; las correcciones posteriores y el estado verificado prevalecen.

## Rutas relacionadas

- Control IA: `/ai-control/analistas`, `/ai-control/oficina`, `/ai-control/senal/:id`, `/ai-control/episodio/:id`, `/ai-control/decisiones`, `/ai-control/reglas`, `/ai-control/guia`. Contexto ampliado: [CONTEXTO_CONTROL_IA.md](control-ia/CONTEXTO_CONTROL_IA.md).
- Marginalidad: `/marginalidad/:tipo/:id`, ficha `MarginEntity.tsx`.
- `/alerts` es una [ruta interna](alertas-internas/CLAUDE.md), no una undécima pestaña del sidebar.
- `/login` es autenticación. Tema y cierre de sesión son controles globales.

## Límites que no deben confundirse con capacidades implementadas

- Power BI Services es una maqueta. La sincronización PBI–SharePoint–BBDD se ha propuesto, pero no está conectada.
- Predicción extrapola ADS y procesa hasta 1.000 artículos; los indicadores visibles agregan los 20 grupos seleccionados por mayor proyección. No son una previsión estadística global.
- Desde v1.61 la oficina animada y el gabinete consultan estados reales persistidos por empresa. No es una cola durable ni paraleliza agentes; conserva el estado de la última ejecución.
- Actualizar documento de pestaña, índice si cambian rutas, contexto global y versión cuando se modifique comportamiento. Conservar evidencia de validación y distinguir código publicado de datos realmente cargados en producción.
