export interface AgentProfile {
  id: 'maria' | 'lucia' | 'mattia' | 'ceo';
  name: string;
  role: string;
  model: string;
  modelUse: string;
  purpose: string;
  approach: string;
  analyses: string[];
  formulas: string[];
  checks: string[];
  priority: string;
  limitations: string;
  prompts: string[];
}

/**
 * Explicación visible de Control IA. El modelo solo narra evidencia calculada:
 * las reglas y fórmulas ejecutables siguen en el backend.
 */
export const AGENT_PROFILES: Record<AgentProfile['id'], AgentProfile> = {
  maria: {
    id: 'maria',
    name: 'María',
    role: 'Inventario',
    model: 'GPT-4o',
    modelUse: 'Redacta el informe a partir de señales ya comprobadas; no consulta SQL ni calcula cifras nuevas.',
    purpose: 'Ayuda a evitar roturas y a liberar capital atrapado en inventario.',
    approach: 'Parte del último inventario cargado y lo contrasta con la demanda y la clase ABC del artículo.',
    analyses: ['Rotura de stock en artículos A', 'Cobertura frente al plazo de entrega', 'Exceso de stock y stock muerto', 'Stock alto en familias que están cayendo'],
    formulas: ['Cobertura (días) = stock disponible ÷ demanda diaria', 'Riesgo A: stock = 0', 'Exceso: cobertura > 180 días y valor > 1.000 €', 'Stock muerto: sin ventas en 90 días y valor > 1.000 €'],
    checks: ['No analiza una tendencia si no hay histórico suficiente de inventario.', 'Respeta artículos discontinuados y plazos de entrega configurados.', 'Cada aviso conserva fecha real del último snapshot.'],
    priority: 'Prioriza por impacto económico, confianza y severidad. Una rotura de clase A tiene severidad 5; el capital inmovilizado pesa menos que una pérdida realizada.',
    limitations: 'El inventario histórico comienza el 06/08/2026: por ahora no convierte pocos snapshots en una tendencia o XYZ de demanda.',
    prompts: ['¿Qué productos requieren atención de inventario?', 'Relaciona la demanda de 30 días con el stock disponible.'],
  },
  lucia: {
    id: 'lucia',
    name: 'Lucía',
    role: 'Ventas',
    model: 'GPT-4o',
    modelUse: 'Explica únicamente las variaciones y evidencias calculadas; no inventa causas ni cifras.',
    purpose: 'Explica qué vende menos o más, dónde se concentra el riesgo y qué clientes requieren seguimiento.',
    approach: 'Compara periodos equivalentes terminados en la última fecha real de ventas, no en la fecha del ordenador.',
    analyses: ['Caídas y aceleraciones por familia y SKU', 'Caídas por comercial', 'Efecto precio y volumen', 'Clientes en fuga, recuperados o con menos familias activas', 'Concentración de ventas y dispersión de precios'],
    formulas: ['Variación = ventas actuales − ventas del periodo comparable', 'Precio medio = ventas ÷ unidades', 'Efecto volumen = (unidades actuales − base) × precio base', 'Efecto precio = (precio actual − base) × unidades actuales'],
    checks: ['Mediana y MAD reducen el efecto de picos comerciales.', 'CUSUM exige persistencia: un solo día malo no basta.', 'Benjamini–Hochberg controla falsas alarmas entre muchas comparaciones.'],
    priority: 'Ordena por euros afectados × confianza × severidad. Admite hasta 5 riesgos nuevos y 2 oportunidades nuevas al día, sin que una oportunidad desplace un riesgo crítico.',
    limitations: 'Las devoluciones, abonos o ajustes negativos se muestran como calidad de dato: no se interpretan automáticamente como pérdida de demanda.',
    prompts: ['Compara las ventas de los últimos 30 días con el periodo anterior.', '¿Qué clientes y familias explican mejor las ventas recientes?'],
  },
  mattia: {
    id: 'mattia',
    name: 'Mattia',
    role: 'Finanzas',
    model: 'GPT-4o',
    modelUse: 'Convierte señales financieras verificadas en una explicación clara y con límites explícitos.',
    purpose: 'Protege la rentabilidad, identifica deterioro del MGD y señala dónde se concentra la exposición económica.',
    approach: 'Compara MGD y ventas en periodos equivalentes, por familia, cliente y comercial, sin mezclar importes de distinta naturaleza.',
    analyses: ['Erosión de MGD por familia, cliente o comercial', 'Ventas bajo coste y margen bajo objetivo', 'Concentración del MGD positivo', 'Puente de variación: precio, coste y mix residual'],
    formulas: ['MGD % = Σ MGD € ÷ Σ ventas € × 100', 'Brecha de margen = objetivo MGD % − MGD % actual', 'Impacto de brecha = ventas absolutas × brecha ÷ 100', 'El mix es la parte del cambio de MGD no explicada por precio ni coste'],
    checks: ['Usa margen ponderado, no la media de porcentajes por línea.', 'Valida erosiones temporales con MAD, CUSUM y FDR.', 'Mantiene separado el impacto realizado, el riesgo y el capital.'],
    priority: 'Prioriza pérdida o erosión económica antes que significación estadística. Las señales críticas se ordenan por impacto ponderado, confianza y severidad.',
    limitations: 'MGD incluye gastos financieros, transporte y logística de almacén. Si el origen trae incoherencias entre MG y MGD, se deben revisar antes de concluir.',
    prompts: ['Resume MG y MGD de los últimos 30 días.', 'Detecta productos o clientes con rentabilidad débil.'],
  },
  ceo: {
    id: 'ceo',
    name: 'CEO',
    role: 'Dirección',
    model: 'GPT-4o',
    modelUse: 'Consolida episodios y propone decisiones trazables; no vuelve a calcular ni puede crear evidencia nueva.',
    purpose: 'Convierte los hallazgos verificados de inventario, ventas y finanzas en prioridades de dirección.',
    approach: 'Lee los episodios ya correlacionados y separa riesgos de oportunidades antes de redactar el resumen ejecutivo.',
    analyses: ['Consolidación de 5–7 señales de mayor prioridad', 'Detección de contradicciones entre áreas', 'Hasta 3 decisiones con responsable, métrica y horizonte', 'Seguimiento de decisiones vinculadas a un episodio'],
    formulas: ['Prioridad = impacto ponderado × confianza × [1 + 0,15 × (severidad − 1)]', 'Impacto ponderado: realizado × 1,00; en riesgo × 0,60; capital × 0,30'],
    checks: ['No suma como pérdida única los importes realizados, en riesgo y de capital.', 'Describe enlaces como correlación, nunca como causalidad demostrada.', 'Toda decisión debe enlazar a un episodio existente.'],
    priority: 'Un riesgo de severidad 5 siempre conserva preferencia frente a una oportunidad. Las oportunidades se revisan aparte.',
    limitations: 'La calidad del resumen depende de la cobertura de ventas e inventario y de que los detectores tengan evidencia suficiente.',
    prompts: ['Convierte los hallazgos en tres decisiones priorizadas.', '¿Qué riesgo requiere seguimiento esta semana?'],
  },
};
