# Control IA — Gabinete de Analistas IA

> Documento de referencia funcional y técnico. Base detallada v1.51; mapa de rutas y estado del gabinete revisados el 09/10/2026 en v1.61. Las reglas ejecutables de los detectores siguen siendo la fuente de verdad para sus umbrales.

## Estado de ejecución y oficina visual · v1.61

La entrada es `/ai-control` (Hoy); el gabinete vive en `/ai-control/analistas` y la oficina en `/ai-control/oficina`. Esta última reutiliza los expedientes y los cuatro agentes existentes. Presenta escritorios y personajes SVG, animación vinculada al estado confirmado, pausa, vista alternativa de tarjetas y temas claro/oscuro. Respeta `prefers-reduced-motion`. María, Lucía y Mattia enlazan a su expediente; CEO al último informe del gabinete.

`POST /agents/run` sigue siendo síncrono y exclusivo de administradores. `GET /agents/execution`, accesible a usuarios autenticados, devuelve solo el estado de su empresa. Oficina y gabinete usan `useAgentExecution`: consulta cada 3 segundos durante ejecución y cada 8 en reposo; se cancela al desmontar. Sin conexión se oculta la animación de trabajo y se indica que el estado no puede confirmarse.

`app/agent_execution.py` persiste en `agent_executions` una fila por empresa con run_id, estado, etapa, estados individuales, fechas UTC e informe_id. La tabla se crea con checkfirst al iniciar FastAPI; el usuario SQL necesita permiso de creación de tabla. No borra datos existentes. Las actualizaciones usan sesiones independientes para ser visibles mientras el análisis trabaja. Una adquisición atómica rechaza concurrencia con HTTP 409; tras 30 minutos sin progreso el estado se presenta como interrumpido y puede reemplazarse. Cada publicación comprueba el run_id para impedir que una ejecución sustituida actualice la nueva.

Secuencia: preparación → señales y episodios deterministas → María → Lucía → Mattia → CEO → guardado. Las fases desactivadas aparecen como omitidas. Los estados individuales son pendiente, trabajando, preparado, completado, error, interrumpido y omitido. Preparado significa narración obtenida; completado solo se publica después de confirmar el informe en BBDD. Señales y episodios se confirman antes de narrar y se conservan si falla la API. `_checked_report` bloquea respuestas vacías o que comienzan por Error. No representa una validación numérica adicional: el contrato de evidencia de investigaciones permanece separado.

Límites: se conserva la última ejecución, no un historial de eventos ni una cola durable. Cerrar el navegador no equivale a cancelar trabajo. La oficina no paraleliza los agentes, no aumenta llamadas al LLM y no representa actividad ficticia cuando están inactivos. Pruebas de aislamiento, concurrencia, sustitución, publicación y fallo: `tests/test_agent_execution.py`.

## 1. Propósito

**Control IA** es el área de análisis asistido de la aplicación. Su cometido es transformar los datos operativos en hallazgos trazables para dirección, sin permitir que el modelo de lenguaje invente cifras, haga SQL libre o calcule métricas por su cuenta.

La pantalla coordina cuatro roles:

| Rol | Responsable | Dominio | Resultado esperado |
|---|---|---|---|
| Fase 1 | María | Inventario | Riesgo de rotura, cobertura, exceso y capital inmovilizado. |
| Fase 1 | Lucía | Ventas | Caídas, descomposición precio/volumen y concentración. |
| Fase 1 | Mattia | Finanzas | Erosión de rentabilidad y exposición económica. |
| Fase 2 | CEO | Consolidación | Prioriza 5–7 señales verificadas y propone hasta tres decisiones. |

El flujo rector es:

```text
Ventas + inventario + catálogo
          ↓
Detectores SQL y estadísticos deterministas
          ↓
agent_signals (impacto tipado, confianza, evidencia, estado)
          ↓
agent_signal_links + agent_episodes (correlación y deduplicación)
          ↓
Evidence bundle JSON limitado por agente
          ↓
LLM: narración, contexto y recomendación
          ↓
Informe, expediente, estudio o investigación verificada
```

## 2. Ubicación y arquitectura

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Ruta de interfaz | `/ai-control` | Entrada visible: resumen **Hoy** de episodios. |
| Página React | `frontend/src/pages/AiControlToday.tsx` | Episodios, señal, decisiones y calidad por detector. |
| Gabinete de analistas | `/ai-control/analistas` · `frontend/src/pages/AiControlPanel.tsx` | Fases, historial, expedientes, chat, estudios e investigaciones. |
| Cliente API | `frontend/src/services/api.ts` | Contratos de peticiones y tipado del frontend. |
| API FastAPI | `app/routers/agents.py` | Autorización, límites de tasa, persistencia de chat e invocación de servicios. |
| Orquestación | `app/agents_service.py` | Ejecuta fases, crea informes diarios y narra señales. |
| Señales | `app/agent_signals.py` | Detectores, estadística robusta, deduplicación y prioridad. |
| Métricas | `app/agent_metrics.py` | Readiness y dossier determinista para expedientes. |
| Estudios | `app/agent_studies.py` | Centros analíticos y snapshots diarios. |
| Investigación | `app/agent_investigations.py` | Plan cerrado, recolección, redacción y verificación. |
| Contrato de evidencia | `app/evidence_contract.py` | Valida que las cifras del informe estén respaldadas y citadas. |

Todos los accesos de datos se aíslan por `empresa_id`. Los chats, informes, señales y estudios no se comparten entre empresas; los chats además se aíslan por `usuario_id`.

## 3. Fuentes y ventana temporal

### 3.1 Fuentes operativas

| Fuente | Uso dentro de Control IA |
|---|---|
| `ventas_historicas` | Facturación, unidades, MG, MGD, clientes, comerciales, familias, SKU y series diarias. |
| `productos` | SKU, nombre, familia, Product Manager, coste y pertenencia a empresa. |
| `clientes` | Cliente, tipo y comercial asignado. |
| `inventario_snapshot` | Stock actual para el dossier y la readiness. |
| `inventario_historico` | Último snapshot real para señales de inventario. |
| `producto_metricas` | Clase ABC/XYZ, días de cobertura y riesgo calculado. |
| `empresa_configuraciones` | Texto de Cerebro del negocio, limitado a 8.000 caracteres al inyectarlo. |

`MG` se persiste como `margen_bruto_eur`. `MGD` se persiste como `margen_destino_eur` y, frente al MG, incorpora gastos financieros, de transporte y de logística de almacén. Sus porcentajes agregados usan siempre el cociente ponderado entre la suma de margen y la suma de ventas del mismo conjunto de líneas.

### 3.2 Ancla de datos

La fecha de referencia no es la fecha del sistema: es `MAX(ventas_historicas.fecha_venta)` para la empresa activa. Con ella se calculan ventanas comparables:

| Ventana | Definición |
|---|---|
| Últimos 30 días | Fecha ancla menos 29 días hasta la ancla, ambos incluidos. |
| 30 días previos | Los 30 días inmediatamente anteriores, sin solapamiento. |
| Últimos 90 días | Fecha ancla menos 89 días hasta la ancla. |
| Últimos 7 días | Fecha ancla menos 6 días hasta la ancla. |
| 7 días previos | Siete días inmediatamente anteriores. |

Para los detectores de señales, la comparación de ventas se acorta a la historia disponible si hay menos de 30 días, pero no baja de un día. La confianza inicial se limita a `días disponibles / 30`.

## 4. Readiness: qué datos están preparados

Antes de interpretar resultados, `GET /agents/readiness` calcula:

| Grupo | Métricas |
|---|---|
| Ventas | Registros, SKU con ventas, clientes con ventas, primera y última fecha, ventas sin cliente, ventas sin familia y ventas negativas. |
| Inventario | SKU con inventario, unidades de stock y valor de inventario. |
| Catálogo | Número total de productos. |
| Disponibilidad | Indicadores de ventas, clientes, inventario y compras. |
| Calidad dimensional | `100 − (ventas_sin_cliente + ventas_sin_familia) / (registros_ventas × 2) × 100`. |

Las compras siempre figuran como **no disponibles** hasta que exista una fuente real. La pantalla debe avisarlo; nunca estimar compras como si fueran datos observados.

Cuando falta inventario, María no debe concluir roturas, cobertura o capital inmovilizado. Cuando faltan clientes, se omiten los análisis de cliente. Las ventas negativas se muestran como un indicador de calidad, no se eliminan.

## 5. Modelo de persistencia

### 5.1 Configuración e informes

| Tabla | Contenido |
|---|---|
| `agent_settings` | Un registro por empresa: `fase1_active`, `fase2_active`. |
| `agent_insights` | Ejecución histórica: fecha, JSON de alertas de fase 1 y Markdown de María, Lucía, Mattia y CEO. |
| `agent_study_snapshots` | Un snapshot diario por empresa y agente con el payload completo de sus estudios. |
| `empresa_configuraciones` | Contexto de negocio compartido con Control IA y AI Copilot. |

### 5.2 Señales

`agent_signals` es la fuente central de hallazgos. Cada fila almacena:

| Campo | Significado |
|---|---|
| `agente`, `detector` | Quién lo produce y qué regla lo detectó. |
| `entidad_tipo`, `entidad_id` | Objeto afectado: SKU, familia o empresa. |
| `periodo_inicio`, `periodo_fin` | Ventana real de la evidencia. |
| `severidad` | Escala de 1 a 5. |
| `impacto_eur` | Impacto económico no negativo usado para ordenar. |
| `confianza` | Valor entre 0 y 1. |
| `valor_actual`, `valor_esperado`, `desviacion` | Métrica contrastada y diferencia. |
| `evidencia` | JSON determinista que el LLM puede citar. |
| `fingerprint` | SHA-256 de agente, detector, tipo e identificador de entidad. |
| `estado` | `nueva`, `persistente`, `resuelta` o `descartada`. |
| `primera_deteccion`, `ultima_deteccion` | Persistencia y recencia del hallazgo. |
| `impacto_tipo` | Naturaleza del importe: `realizado`, `en_riesgo` o `capital`. |
| `impacto_ponderado_eur` | Importe de priorización: realizado × 1,00; en riesgo × 0,60; capital × 0,30. No representa pérdida realizada. |
| `episodio_id` | Episodio de negocio abierto al que pertenece mientras la señal está activa. |
| `descartada_por`, `descartada_motivo`, `descartada_en` | Trazabilidad obligatoria de un descarte. |
| `naturaleza` | `riesgo` u `oportunidad`; no cambia el tipo económico del importe. |

La restricción única `(empresa_id, fingerprint)` evita alertas duplicadas. El período no forma parte del fingerprint para que una señal de la misma entidad siga siendo la misma al actualizar la ventana.

### 5.3 Correlación, episodios, feedback y decisiones

| Tabla | Finalidad |
|---|---|
| `agent_signal_links` | Enlaces deterministas entre señal de origen y destino; incluye regla, tipo, solape y detalle JSON. |
| `agent_episodes` | Componentes conexas de señales activas, con ancla, impacto por tipo, ponderado y ciclo abierto/resuelto. |
| `agent_signal_feedback` | Veredicto del usuario (`util`, `ya_conocida`, `no_accionable`, `falso_positivo`) y motivo. |
| `agent_decisions` | Decisión asociada a episodio o señal, responsable, métrica, horizonte, origen y resultado. |
| `empresa_reglas_negocio` | Reglas con ámbito, vigencia, valor y usuario que las actualizó. |

Un enlace exige misma empresa y al menos **siete días de solape** cuando aplica. Reglas disponibles: R1 rotura→caída de familia, R2 cobertura crítica→caída, R3 precio/volumen como faceta duplicada, R4 erosión MGD que agrava caída, R5 exceso sobre familia en caída y R6 stock muerto como faceta de exceso. El enlace explica una asociación estructural; no prueba una causa.

Los episodios se forman por componentes conexas y mantienen como ancla la señal de mayor impacto ponderado. Antes de sumar, los enlaces `duplica` dejan una sola faceta representativa. Los tres subtotales se exponen por separado: realizado, en riesgo y capital. El ponderado solo ordena la bandeja.

Al descartar con `falso_positivo` o `no_accionable`, la señal queda suprimida 30 días. Si reaparece después, se reactiva como nueva con `reincidencia` en evidencia; nunca se pierde el feedback anterior.

## 6. Motor de señales

### 6.1 Priorización y ciclo de vida

1. Los detectores construyen candidatos con evidencia.
2. Se filtran estadísticamente cuando el detector es temporal.
3. Se ordenan por:

   ```text
   impacto_ponderado_eur × confianza × (1 + 0,15 × (severidad − 1))
   ```

4. Se admiten como máximo **cinco señales nuevas por agente y día** (`MAX_NEW_SIGNALS_PER_AGENT_PER_DAY = 5`). Las existentes se actualizan aunque se alcance el límite.
5. Una señal existente actualiza métricas y `ultima_deteccion`, y pasa a `persistente`, salvo que tenga una supresión vigente por feedback.
6. Las señales activas que ya no aparecen en el detector pasan a `resuelta`.
7. En la lectura, la persistencia añade una bonificación de hasta 30 %: `1 + min(días_abierta, 30) / 100`.

Estados activos: `nueva` y `persistente`.

### 6.2 Lucía: ventas

| Detector | Regla actual | Evidencia principal |
|---|---|---|
| `caida_facturacion_familia` | Una familia debe caer más de `max(250 €, 8 % de la base)` frente a un período equivalente. Severidad 5 si la caída es ≥30 %, 4 si ≥15 %, 3 en el resto. | Ventas y unidades actual/base, variación EUR y %, ventanas comparadas y validación estadística. |
| `precio_volumen_familia` | Se genera junto a la caída si hay unidades en ambos períodos y el efecto precio o volumen supera 250 € absolutos. | Precio medio base/actual y efectos de precio y volumen. |
| `concentracion_clientes` | Se activa cuando los tres clientes principales concentran al menos 50 % de las ventas del período actual. Severidad 4 desde 70 %, 3 entre 50–69,99 %. | Ventas Top 3, ventas totales, participación y umbral. |

La descomposición usa:

```text
precio medio = ventas / unidades
efecto volumen = (unidades_actuales − unidades_base) × precio_base
efecto precio = (precio_actual − precio_base) × unidades_actuales
```

### 6.3 María: inventario

Los detectores usan el último snapshot de `inventario_historico` disponible para la empresa.

| Detector | Regla actual | Severidad / confianza |
|---|---|---|
| `rotura_stock_clase_a` | SKU ABC A con unidades de inventario iguales a 0. | 5 / 0,90 |
| `cobertura_vs_lead_time` | SKU ABC A con cobertura positiva menor o igual al lead time. El lead time mínimo aplicado es 7 días. | 4 / 0,85 |
| `exceso_cobertura` | Cobertura superior a 180 días y valor de inventario superior a 1.000 €. | 3 / 0,80 |
| `stock_muerto_90d` | Inventario superior a 1.000 € sin ventas en los 90 días anteriores al snapshot. | 4 / 0,90 |

Con el histórico de inventario que comienza el **06-08-2026**, el sistema no debe inferir tendencias de inventario ni una clasificación XYZ temporal fiable. Por ahora, María produce detectores de nivel, no de tendencia.

### 6.4 Mattia: finanzas

| Detector | Regla actual | Evidencia |
|---|---|---|
| `erosion_mgd_familia` | Para familias con ventas en ambos períodos: el MGD porcentual actual cae al menos 2 puntos y el MGD EUR también disminuye. Severidad 4 desde −5 puntos, 3 entre −2 y −4,99. | Ventas y MGD actuales/base, MGD %, diferencia en puntos y prueba estadística. |

`MGD %` se calcula ponderado: `SUM(margen_destino_eur) / SUM(ventas) × 100`; no se promedian porcentajes por línea.

## 7. Filtro estadístico anti-ruido

Los detectores temporales de Lucía y Mattia no usan media ± desviación típica como criterio principal.

| Técnica | Implementación y objetivo |
|---|---|
| Mediana y MAD | Baseline robusto sobre días del período base; escala `max(1, 1,4826 × MAD)`. Resiste picos comerciales. |
| CUSUM inferior | Acumula desviaciones moderadas bajo la mediana para evitar alertar por un día aislado. |
| Persistencia | El tramo reciente debe conservar desviación bajo el límite para aceptar cambio de nivel. |
| Benjamini–Hochberg | Control de falsos descubrimientos con `FDR_ALPHA = 0,10` sobre familias probadas. |
| Mínimo de historia | Exige al menos 14 días base y 7 actuales; en caso contrario declara histórico insuficiente. |

El p-valor permite o impide entrar en señales. **No ordena prioridades**: la decisión se ordena por impacto económico, confianza y severidad.

## 8. Orquestación de fases e informes

### 8.1 Nueva ejecución

`POST /agents/run` exige administrador y está limitado a dos ejecuciones por minuto.

| Fase | Activación | Acción |
|---|---|---|
| 1 | `fase1_active` | Refresca señales, genera los tres Markdown de área y persiste sus alertas. |
| 2 | `fase2_active` y una Fase 1 actual o informe diario existente | El CEO recibe las señales verificadas disponibles y genera la consolidación. |

Si ocurre una excepción, la ruta revierte la transacción, registra el detalle técnico y devuelve un error seguro `500` al frontend.

### 8.2 Informe diario

En la carga de la pantalla se solicita `POST /agents/daily/ensure`:

- Busca un informe del día local de Madrid con los tres informes de fase 1 completos.
- Si cambió `EmpresaEstadisticas.actualizado_en`, considera obsoleto el informe previo y construye uno nuevo.
- Un bloqueo de proceso evita crear dos informes diarios simultáneos.
- El CEO se añade si la fase 2 está activa.

El histórico muestra hasta 100 ejecuciones por empresa, ordenadas de más reciente a más antigua.

### 8.3 Narración con LLM

La narración usa `gpt-4o`, temperatura `0,2` y un prompt explícito que ordena:

- narrar **solo** el evidence bundle;
- no ejecutar SQL ni recalcular cifras;
- citar importe, período y confianza en conclusiones;
- declarar limitaciones cuando falte evidencia;
- no inventar causalidad.

María narra disponibilidad, cobertura y capital; Lucía variación y concentración; Mattia rentabilidad y erosión MGD. El CEO solo consolida las 5–7 señales de mayor prioridad y puede emitir hasta tres decisiones con responsable, métrica y horizonte.

Si no está configurada la clave de OpenAI, el informe declara el error de configuración; no se fabrica una respuesta.

## 9. Investigación verificable

La acción **Investigar señal** no permite SQL libre. Usa `POST /agents/{agent}/investigations`, máximo tres peticiones por minuto y solo para María, Lucía y Mattia.

### 9.1 Fases

1. **Plan**: selecciona preguntas de un catálogo cerrado conforme a la señal prioritaria y la pregunta recibida.
2. **Recolección**: resuelve cada pregunta con SQL parametrizado y produce bloques `e1`, `e2`, etc.
3. **Redacción**: el LLM usa únicamente esos bloques, con temperatura 0.
4. **Verificación**: se extraen las cifras del texto y cada línea numérica debe llevar una cita `[eN]` que contenga dicha cifra, con tolerancia de redondeo.

La salida debe incluir estas secciones:

1. Período y evidencia numérica.
2. Riesgos.
3. Oportunidades.
4. Métricas de seguimiento.
5. Hipótesis descartadas.
6. Qué dato falta.

Si falla la verificación, se reintenta una vez con una instrucción correctiva. Si falla de nuevo, el informe queda bloqueado y la API responde `422`; no se publica una cifra huérfana.

Sin API de OpenAI, se entrega un fallback de evidencia con limitaciones, no una conclusión no verificada.

## 10. Expedientes, chat y estudios

### 10.1 Chat por agente

Cada agente tiene un expediente que combina informe, estudios y chat.

| Aspecto | Regla |
|---|---|
| Persistencia | Un `agent_chats` por usuario y agente; sus mensajes viven en `agent_messages`. |
| Recuperación | Hasta 100 mensajes, ordenados cronológicamente. |
| Contexto enviado al modelo | Máximo 20 mensajes recientes, dossier y evidence bundle del agente. |
| Límite de entrada | 2.000 caracteres por mensaje; historia de la petición entre 1 y 20 mensajes. |
| Tasa | Cinco mensajes por minuto. |
| Respuesta | Solo puede usar la evidencia. Si falta el dato, debe decirlo y pedir detector o investigación. |

El dossier determinista ofrece KPIs de 7, 30 y 90 días, familias y SKU impulsores, clientes, comerciales, concentración, cobertura y alertas de calidad según el agente. Las sugerencias clicables proceden de datos realmente presentes en ese dossier.

### 10.2 Centro de estudios

`GET /agents/{agent}/studies` está disponible para María, Lucía y Mattia, limitado a diez peticiones por minuto. Genera o reutiliza un snapshot por agente, empresa y día; si los datos se actualizaron posteriormente, se regenera.

Pestañas disponibles:

| Pestaña | Contenido |
|---|---|
| Informe | Informe diario del agente, investigación verificable y limitaciones. |
| Artículos | Hasta 30 SKU por contribución absoluta a la variación de ventas entre dos períodos de 30 días. Muestra ventas, impacto, variación y MGD ponderado. |
| Clientes | Hasta 50 clientes de 30 días: ventas, peso, MGD, artículos, tipo y comercial. Calcula HHI. |
| Product Managers | Hasta 30 responsables: ventas, peso, MGD, artículos, unidades y clientes. |
| Laboratorio | Serie diaria de 90 días, regresión, dispersión, intervalos y patrón semanal. |

#### Cálculos del laboratorio

| Métrica | Fórmula / interpretación |
|---|---|
| Regresión | OLS sobre ventas diarias: pendiente EUR/día, intercepto, R² e intervalo de confianza aproximado del 95 %. |
| Distribución | Media, mediana, desviación típica poblacional, cuartiles, coeficiente de variación e intervalo de la media del 95 %. |
| Estacionalidad semanal | Venta media del día de semana / venta media global. |
| Días sin ventas | Se incluyen explícitamente como 0 en la serie. |
| Concentración HHI | Suma de los cuadrados de las cuotas de ventas del cliente. Menos de 1.500 suele indicar baja concentración y más de 2.500 alta. |

La regresión describe asociación temporal; no demuestra causalidad ni equivale por sí sola a una previsión.

## 11. Interfaz y experiencia de uso

La entrada `/ai-control` carga en paralelo episodios abiertos, cambios frente a la ejecución previa y calidad de detectores. Tiene las siguientes áreas:

1. **Hoy**: impacto separado por naturaleza, episodios priorizados y cambios desde la ejecución anterior.
2. **Detalle de señal**: evidencia JSON, feedback, descarte justificado, decisión y acceso al expediente con contexto exacto.
3. **Detalle de episodio**: señales, enlaces y subtotales sin doble conteo.
4. **Decisiones**: propuestas CEO y decisiones creadas por usuario; responsable, métrica, horizonte, resultado y estado.
5. **Calidad**: tasa de feedback, falso positivo y no accionable por detector; es no concluyente con menos de cinco feedbacks.
6. **Gabinete de analistas**: ruta secundaria con readiness, fases, históricos, estudios, investigaciones, expedientes y chat.
7. **Cerebro del negocio**: contexto compartido editable que usan Copilot y todos los agentes.

Desde `v1.48` sigue el sistema visual Apple UI: tipografía de sistema, superficies neutras, separadores finos, azul para interacción y colores semánticos solo para éxito, advertencia, error o variación. Los Markdown se sanitizan con `rehype-sanitize`; tablas extensas mantienen desplazamiento horizontal y los controles tienen foco visible.

## 11.1 Profundidad de dominio v1.50 (Bloque 3)

### Naturaleza y priorización

Cada señal declara si es un `riesgo` o una `oportunidad`. Ambas conservan su `impacto_tipo` económico (`realizado`, `en_riesgo` o `capital`), que no se debe sumar con otros tipos. La admisión diaria separa los cupos por agente: hasta cinco riesgos y hasta dos oportunidades. La bandeja **Hoy** y el CEO los presentan en grupos distintos; un riesgo de severidad 5 siempre conserva prioridad frente a una oportunidad.

### Reglas de negocio

`empresa_reglas_negocio` es la única fuente editable de reglas. Una regla tiene clave, ámbito (`empresa`, `familia`, `sku`, `cliente` o `comercial`), valor, vigencia y usuario actualizador. `app/business_rules.py` resuelve en cascada SKU → familia → empresa → constante; las reglas específicas de cliente o comercial solo se usan cuando el detector trabaja sobre esa entidad. La evidencia expone `{valor, origen, regla_id}` bajo `reglas_aplicadas`.

| Clave | Uso |
|---|---|
| `lead_time_dias` | Cobertura frente a lead time; entre 1 y 365 días. |
| `margen_objetivo_pct` | Objetivo MGD por familia o empresa; entre −100 y 100 %. |
| `cliente_estrategico` | Eleva una severidad para señales de cliente afectado. |
| `sku_discontinuado` | Excluye rotura y cobertura/exceso del SKU discontinuado. |
| `familia_estacional` | Meses de actividad de una familia; fuera de temporada no se emiten señales temporales de caída/aceleración. |
| `umbral_detector` | Excepción global o nombrada para un detector; se aplica en el cálculo y se cita. |

La pantalla `/ai-control/reglas` permite crear, editar y eliminar reglas. Las mutaciones requieren administrador y la API rechaza valores fuera de rango, ámbitos incompatibles, fechas invertidas y solapes de vigencia.

### Detectores añadidos

| Agente | Detectores B3 | Regla de negocio resumida |
|---|---|---|
| Lucía | `cliente_en_fuga`, `caida_ventas_sku`, `caida_ventas_comercial`, `perdida_amplitud_cliente`, `dispersion_precio_sku` | Recencia individual, ventas equivalentes, pérdida de familias y dispersión real de precio por cliente. |
| Lucía (oportunidades) | `cliente_recuperado`, `familia_en_aceleracion` | Recuperación tras una brecha real de 180 días y crecimiento persistente con CUSUM superior. |
| Mattia | `erosion_mgd_cliente`, `erosion_mgd_comercial`, `venta_bajo_coste`, `margen_bajo_objetivo`, `concentracion_margen` | Erosión ponderada, MGD negativo, brecha de objetivo configurado y concentración de margen. |
| María | `cobertura_clase_b`, `sku_sin_stock_sin_ventas`, `stock_sobre_familia_en_declive` | Nivel de cobertura B, saneamiento de catálogo y capital inmovilizado en familias que caen. |

`erosion_mgd_familia` incorpora un puente de margen por precio, coste efectivo inferido de ventas/MGD y residuo de mix. El residuo se identifica explícitamente como tal, no como una causa observada.

### Playbooks de investigación

`app/agent_playbooks.py` asigna 5–8 preguntas cerradas por detector. Para una caída familiar, el plan comprueba días sin datos, comparación con base/pico, concentración de clientes, SKU dominante, precio×volumen, stock y estacionalidad. `app/agent_investigations.py` solo puede recoger bloques desde el catálogo permitido; el LLM no genera SQL ni cambia el plan.

## 12. API expuesta

| Método y ruta | Autorización / límite | Función |
|---|---|---|
| `POST /agent-settings` | Usuario autenticado | Actualiza fases. |
| `GET /agent-settings` | Usuario autenticado | Recupera fases. |
| `POST /agents/run` | Administrador, 2/min | Ejecuta fases activas y persiste un informe. |
| `GET /agents/insights` | Usuario autenticado | Último informe de empresa. |
| `GET /agents/insights/history` | Usuario autenticado | Hasta 100 informes históricos. |
| `GET /agents/readiness` | Usuario autenticado | Cobertura y calidad de los datos. |
| `GET /agents/daily` | Usuario autenticado | Informe diario actual, si existe. |
| `POST /agents/daily/ensure` | Usuario autenticado, 2/min | Garantiza informe diario actualizado. |
| `GET /agents/{agent}/studies` | Usuario autenticado, 10/min | Centro de estudios persistido. |
| `POST /agents/{agent}/investigations` | Usuario autenticado, 3/min | Investigación contractual. |
| `GET /agents/{agent}/chat` | Usuario autenticado | Chat persistido del usuario y agente. |
| `POST /agents/{agent}/chat` | Usuario autenticado, 5/min | Guarda mensaje, genera respuesta y sugerencias; `signal_id` inyecta solo la evidencia de esa señal de la misma empresa/agente. |
| `GET /agents/signals` y `/{id}` | Usuario autenticado, 30/min | Lista o detalla señales propias de la empresa con filtros. |
| `POST /agents/signals/{id}/feedback` | Usuario autenticado | Registra veredicto; motivo obligatorio para no accionable/falso positivo. |
| `POST /agents/signals/{id}/discard` | Usuario autenticado | Descarta con motivo, feedback y supresión aplicable. |
| `GET /agents/episodes` y `/{id}` | Usuario autenticado | Bandeja y detalle de episodios de empresa. |
| `GET/POST/PATCH /agents/decisions` | Usuario autenticado | Consulta, crea o actualiza decisiones sin cruzar tenants. |
| `GET /agents/quality` | Usuario autenticado | Métricas de feedback por detector en ventana de 90 días. |
| `GET /agents/business-rules` | Usuario autenticado | Lista reglas de negocio aisladas por empresa. |
| `POST/PATCH/DELETE /agents/business-rules` | Administrador | Crea, edita o elimina una regla validada, sin solapes de vigencia. |
| `GET/PUT /agents/onboarding/{flow}` | Usuario autenticado | Lee o persiste progreso de `control_ia_tour` y `control_ia_setup` por usuario y empresa. |
| `GET /agents/setup-checklist` | Usuario autenticado | Calcula los elementos de puesta en marcha desde reglas, contexto, feedback y decisiones reales. |

Nombres aceptados: `maria`/`maría`, `lucia`/`lucía`, `mattia` y `ceo`. Los estudios e investigaciones solo están disponibles para los tres agentes de área.

## 13. Límites y reglas que no se deben romper

- No habilitar SQL generado por LLM en Control IA.
- No permitir que el LLM calcule o cambie las cifras del evidence bundle.
- No presentar tendencias ni XYZ fiables de inventario mientras no exista suficiente serie histórica real.
- No inventar compras, causas de negocio, datos de cliente ni explicaciones de precio/inventario sin evidencia.
- No priorizar por p-valor: se prioriza por impacto EUR, confianza, severidad y persistencia.
- No superar cinco señales nuevas por agente y día sin revisar los umbrales.
- No superar dos oportunidades nuevas por agente y día; una oportunidad jamás desplaza un riesgo de severidad 5.
- No dispersar reglas de negocio en detectores. Usar `resolve_rule` o `resolve_detector_threshold` y añadir `reglas_aplicadas` a la evidencia cuando intervengan.
- No publicar una investigación que no pase `verify_report`.
- No mezclar empresa, usuario o chats entre tenants.
- No considerar un informe diario vigente si precede a una actualización de métricas de la empresa.
- No presentar una configuración o síntesis semanal como completada si no existe soporte funcional para comprobarla.

## 13.1 Guía interactiva v1.51

La entrada **Hoy** incorpora tres ayudas complementarias sin cambiar el motor analítico: el glosario central `frontend/src/content/glosario.ts`, el recorrido `ControlIaTour` y la guía permanente `/ai-control/guia`. Los tooltips y la guía reutilizan exactamente el mismo diccionario de términos para evitar definiciones divergentes.

El estado del recorrido y del checklist se persiste en `usuario_onboarding` y sus eventos en `usuario_onboarding_eventos`, aislados por `usuario_id`, `empresa_id` y `flujo`. El recorrido registra inicio, paso, abandono y finalización; se puede reiniciar desde **Cómo funciona**, respeta `Escape`, foco modal, lector de pantalla y hoja inferior en móvil.

`GET /agents/setup-checklist` verifica los tres bloqueantes (lead time, margen objetivo y SKU discontinuados) y los elementos de valor (clientes estratégicos, estacionalidad, contexto, feedback y decisiones) contra datos reales. La síntesis semanal sigue sin estar implementada y se declara no disponible. Los estados vacíos de episodios, estudios, calidad y decisiones explican qué falta y enlazan al siguiente paso accionable.

## 14. Diagnóstico rápido

| Síntoma | Primer punto a revisar |
|---|---|
| “Error interno ejecutando agentes” | Registro backend de `/agents/run`; la ruta revierte transacción en caso de excepción. |
| Informe sin datos | `GET /agents/readiness`, fecha máxima de ventas y señales activas. |
| Sin señales de inventario | Última fecha de `inventario_historico`, existencia de `inventario_snapshot`, ABC y cobertura. |
| Sin informe CEO | `fase2_active` y existencia de Fase 1 actual o informe diario válido. |
| Investigación bloqueada | Resultado de `verification`: cifras huérfanas, líneas sin cita o cita que no contiene el número. |
| Chat no responde | Configuración de OpenAI, agente permitido, límite de tasa y evidence bundle disponible. |
| Estudios desactualizados | `EmpresaEstadisticas.actualizado_en` respecto a `AgentStudySnapshot.created_at`. |

## 15. Pruebas mínimas al modificar este módulo

```powershell
python -m unittest discover -s tests -t .
python -m compileall -q app
Set-Location frontend
npm.cmd run lint
npm.cmd run build
Set-Location ..
git diff --check
```

Además, comprobar manualmente:

1. Readiness con y sin inventario.
2. Nueva ejecución con Fase 1 y Fase 2 activas.
3. Informe diario tras actualizar datos.
4. Apertura de expediente, carga de estudios y envío de chat.
5. Investigación con citas `[eN]` y bloqueo ante evidencia insuficiente.
6. Aislamiento entre dos empresas y dos usuarios distintos.
