import { useState, useEffect, useRef } from 'react';
import { getAgentSettings, updateAgentSettings, getAllAgentInsights, runAgentAnalysis, getAgentChat, sendAgentMessage, getBusinessContext, updateBusinessContext, getAgentDataReadiness, ensureDailyAgentReport, getAgentStudies } from '../services/api';
import type { AgentSettings, AgentInsight, AgentChatMessage, AgentDataReadiness, AgentStudies } from '../services/api';
import { Power, Bot, TrendingUp, DollarSign, Brain, PlayCircle, FileText, Loader2, X, ChevronDown, ChevronUp, Send, MessageSquare, Clock, CheckCircle, AlertCircle, BookOpen, Save, Database, Users, PackageCheck, ShoppingCart, Calculator, Sparkles, PanelRight, Boxes, UserRoundSearch, BriefcaseBusiness, FlaskConical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  model: string;
  color: string;
  purpose: string;
  calculations: string[];
  prompts: string[];
}

type StudyTab = 'report' | 'articles' | 'clients' | 'product_managers' | 'laboratory';

const AGENTS_INFO: Record<string, AgentInfo> = {
  maria: {
    id: 'maria',
    name: 'María',
    role: 'Inventario',
    model: 'GPT-4o',
    color: 'emerald',
    purpose: 'Protege la disponibilidad y detecta riesgo de rotura, exceso y capital inmovilizado.',
    calculations: ['Stock y valor de inventario', 'Cobertura y roturas por clase ABC', 'Demanda de 30 y 90 días'],
    prompts: ['¿Qué productos requieren atención de inventario?', 'Relaciona la demanda de 30 días con el stock disponible.']
  },
  lucia: {
    id: 'lucia',
    name: 'Lucía',
    role: 'Ventas',
    model: 'GPT-4o',
    color: 'blue',
    purpose: 'Explica el rendimiento comercial y encuentra oportunidades por producto, cliente y equipo.',
    calculations: ['Ventas 30 y 90 días y variación', 'Clientes activos y concentración Top 10', 'Familias, KD y comerciales'],
    prompts: ['Compara las ventas de los últimos 30 días con el periodo anterior.', '¿Qué clientes y familias explican mejor las ventas recientes?']
  },
  mattia: {
    id: 'mattia',
    name: 'Mattia',
    role: 'Finanzas',
    model: 'GPT-4o',
    color: 'violet',
    purpose: 'Vigila rentabilidad, calidad del margen y exposición económica del negocio.',
    calculations: ['MG y MGD ponderados', 'Margen negativo o estrecho', 'Concentración y capital inmovilizado'],
    prompts: ['Resume MG y MGD de los últimos 30 días.', 'Detecta productos o clientes con rentabilidad débil.']
  }
};

const EXECUTION_STAGES = [
  { phase: 1, msg: 'Preparando métricas verificadas...', agent: null },
  { phase: 1, msg: 'María analizando disponibilidad...', agent: 'maria' },
  { phase: 1, msg: 'Lucía analizando ventas y clientes...', agent: 'lucia' },
  { phase: 1, msg: 'Mattia evaluando la rentabilidad...', agent: 'mattia' },
  { phase: 2, msg: 'Consolidando el informe ejecutivo...', agent: 'ceo' },
  { phase: 2, msg: 'Guardando resultados...', agent: null },
];

export const AiControlPanel = () => {
  const [settings, setSettings] = useState<AgentSettings>({ fase1_active: false, fase2_active: false });
  const [insightsHistory, setInsightsHistory] = useState<AgentInsight[]>([]);
  const [dataReadiness, setDataReadiness] = useState<AgentDataReadiness | null>(null);
  const [dailyInsight, setDailyInsight] = useState<AgentInsight | null>(null);
  const [isDailyPreparing, setIsDailyPreparing] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [runStage, setRunStage] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSuccess, setRunSuccess] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [expandedAgentMap, setExpandedAgentMap] = useState<Record<string, boolean>>({});

  // Chat States
  const [agentChatHistory, setAgentChatHistory] = useState<AgentChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSuggestions, setChatSuggestions] = useState<string[]>([]);
  const [studyTab, setStudyTab] = useState<StudyTab>('report');
  const [agentStudies, setAgentStudies] = useState<AgentStudies | null>(null);
  const [isStudiesLoading, setIsStudiesLoading] = useState(false);
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Cerebro del Negocio
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);

  useEffect(() => {
    if (selectedAgent) {
      setAgentChatHistory([]);
      setChatSuggestions(AGENTS_INFO[selectedAgent]?.prompts || []);
      setStudyTab('report');
      setAgentStudies(null);
      setStudiesError(null);
      setIsChatLoading(true);
      setIsStudiesLoading(true);
      getAgentChat(selectedAgent)
        .then(data => setAgentChatHistory(data))
        .catch(err => console.error(err))
        .finally(() => setIsChatLoading(false));
      getAgentStudies(selectedAgent)
        .then(setAgentStudies)
        .catch(() => setStudiesError('No se pudieron preparar los estudios.'))
        .finally(() => setIsStudiesLoading(false));
    }
  }, [selectedAgent]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentChatHistory]);

  const handleSendAgentMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || !selectedAgent || isChatLoading || isDailyPreparing) return;
    const newMessage: AgentChatMessage = { role: 'user', content: chatInput.trim() };
    const updatedHistory = [...agentChatHistory, newMessage];
    setAgentChatHistory(updatedHistory);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const response = await sendAgentMessage(selectedAgent, updatedHistory);
      setAgentChatHistory([...updatedHistory, { role: 'assistant', content: response.reply }]);
      setChatSuggestions(response.suggestions || []);
    } catch {
      setAgentChatHistory([...updatedHistory, { role: 'assistant', content: 'No se pudo conectar con el agente. Inténtalo de nuevo.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      const [settingsData, insightsData, readinessData] = await Promise.all([getAgentSettings(), getAllAgentInsights(), getAgentDataReadiness()]);
      setSettings(settingsData);
      setInsightsHistory(insightsData);
      setDataReadiness(readinessData);
      if (insightsData.length > 0 && !expandedRowId) setExpandedRowId(insightsData[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const prepareDailyReport = async () => {
    setIsDailyPreparing(true);
    setDailyError(null);
    try {
      const insight = await ensureDailyAgentReport();
      setDailyInsight(insight);
      setInsightsHistory(previous => {
        const withoutDuplicate = previous.filter(item => item.id !== insight.id);
        return [insight, ...withoutDuplicate].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      });
    } catch {
      setDailyError('No se pudo actualizar el informe diario. Puedes consultar el último disponible.');
    } finally {
      setIsDailyPreparing(false);
    }
  };

  useEffect(() => {
    refreshData();
    prepareDailyReport();
  }, []);

  const handleToggle = async (key: keyof AgentSettings) => {
    const newValue = { ...settings, [key]: !settings[key] };
    setSettings(newValue);
    try { await updateAgentSettings(newValue); }
    catch { setSettings(settings); }
  };

  const handleRunAnalysis = async () => {
    if (!settings.fase1_active && !settings.fase2_active) {
      setRunError('Debes encender al menos una fase para ejecutar el análisis.');
      setTimeout(() => setRunError(null), 4000);
      return;
    }
    setRunError(null);
    setRunSuccess(false);
    setIsRunning(true);
    setRunStage(0);

    // Simular progreso por etapas
    const stagesFiltered = EXECUTION_STAGES.filter(s =>
      (s.phase === 1 && settings.fase1_active) || (s.phase === 2 && settings.fase2_active)
    );
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stagesFiltered.length - 1);
      setRunStage(stageIdx);
    }, 4000);

    try {
      const insight = await runAgentAnalysis();
      if (insight.fase1_maria_md && insight.fase1_lucia_md && insight.fase1_mattia_md) {
        setDailyInsight(insight);
      }
      clearInterval(stageTimer);
      setRunStage(stagesFiltered.length - 1);
      setRunSuccess(true);
      setTimeout(() => setRunSuccess(false), 4000);
      await refreshData();
    } catch (error: any) {
      clearInterval(stageTimer);
      const detail = error.response?.data?.detail || error.message || 'Error desconocido';
      setRunError(`Error al ejecutar el análisis: ${detail.split('\n')[0]}`);
      setTimeout(() => setRunError(null), 6000);
    } finally {
      setIsRunning(false);
      setRunStage(0);
    }
  };

  const toggleRow = (id: number) => setExpandedRowId(expandedRowId === id ? null : id);
  const toggleAgentView = (rowId: number, agentId: string) => {
    const key = `${rowId}-${agentId}`;
    setExpandedAgentMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveContext = async () => {
    setIsSavingContext(true);
    try {
      await updateBusinessContext(businessContext);
      setIsContextModalOpen(false);
    } catch { console.error('Error guardando contexto'); }
    finally { setIsSavingContext(false); }
  };

  useEffect(() => {
    if (isContextModalOpen) {
      getBusinessContext().then(setBusinessContext).catch(console.error);
    }
  }, [isContextModalOpen]);

  const renderAgentAccordion = (rowId: number, agentId: string, title: string, content?: string, defaultOpen = false) => {
    const key = `${rowId}-${agentId}`;
    const isOpen = expandedAgentMap[key] !== undefined ? expandedAgentMap[key] : defaultOpen;
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-3">
        <button onClick={() => toggleAgentView(rowId, agentId)} className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 text-left transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
          <span className="font-semibold text-slate-800 dark:text-white">{title}</span>
          {isOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
        </button>
        {isOpen && (
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
            {content ? (
              <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">Sin datos generados para este reporte.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const formatStudyValue = (key: string, value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return 'Sin dato';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value !== 'number') return value;
    if (key.includes('pct') || key.includes('variation') || key.includes('variacion')) {
      return `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`;
    }
    if (key.includes('eur') || key.includes('sales') || key.includes('ventas') || key.includes('mean') || key.includes('median') || key.includes('q1') || key.includes('q3') || key.includes('slope') || key.includes('intercept')) {
      return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
    }
    return value.toLocaleString('es-ES', { maximumFractionDigits: 3 });
  };

  const renderStudyTable = (tabId: string) => {
    const section = agentStudies?.tabs?.[tabId];
    const rows = section?.rows || [];
    const columnsByTab: Record<string, Array<[string, string]>> = {
      articles: [['sku', 'SKU'], ['articulo', 'Artículo'], ['familia', 'Familia'], ['product_manager', 'Product Manager'], ['ventas_actual', 'Ventas 30D'], ['impacto_eur', 'Impacto'], ['variacion_pct', 'Variación'], ['mgd_pct', 'MGD']],
      clients: [['cliente_pk', 'Cliente'], ['cliente', 'Nombre'], ['tipo_cliente', 'Tipo'], ['comercial_asignado', 'Comercial'], ['ventas_eur', 'Ventas 30D'], ['share_pct', 'Peso'], ['mgd_pct', 'MGD'], ['articulos', 'Artículos']],
      product_managers: [['product_manager', 'Product Manager'], ['ventas_eur', 'Ventas 30D'], ['share_pct', 'Peso'], ['mgd_pct', 'MGD'], ['articulos', 'Artículos'], ['clientes', 'Clientes']],
    };
    const columns = columnsByTab[tabId] || [];
    return (
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{section?.summary}</p>
        {rows.length ? (
          <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase">
                <tr>{columns.map(([key, label]) => <th key={key} className="px-3 py-3 font-semibold whitespace-nowrap">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, index) => (
                  <tr key={`${tabId}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {columns.map(([key]) => <td key={key} className="px-3 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{formatStudyValue(key, row[key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-10 text-center text-sm text-slate-400">No hay datos suficientes para este estudio.</p>}
        {section?.methodology && <p className="mt-4 text-xs text-slate-500"><strong>Método:</strong> {String(section.methodology)}</p>}
      </div>
    );
  };

  const renderLaboratory = () => {
    const lab = agentStudies?.tabs?.laboratory;
    const regression = lab?.regression || {};
    const distribution = lab?.distribution || {};
    return (
      <div className="space-y-6">
        <p className="text-sm text-slate-600 dark:text-slate-300">{lab?.summary}</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ['slope_eur_per_day', 'Pendiente diaria', regression.slope_eur_per_day],
            ['r_squared', 'R² de tendencia', regression.r_squared],
            ['mean', 'Media diaria', distribution.mean],
            ['coefficient_variation_pct', 'Variabilidad', distribution.coefficient_variation_pct],
          ].map(([key, label, value]) => (
            <div key={String(key)} className="border-l-2 border-brand-blue dark:border-brand-cyan pl-3 py-1">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">{formatStudyValue(String(key), value as number | null)}</p>
            </div>
          ))}
        </div>
        <div className="border-y border-slate-200 dark:border-slate-700 py-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p><strong>Intervalo 95% de la pendiente:</strong> {formatStudyValue('slope_eur', regression.slope_ci95_low as number)} a {formatStudyValue('slope_eur', regression.slope_ci95_high as number)}</p>
          <p><strong>Intervalo 95% de la media:</strong> {formatStudyValue('mean_eur', distribution.mean_ci95_low)} a {formatStudyValue('mean_eur', distribution.mean_ci95_high)}</p>
          <p><strong>Muestra:</strong> {formatStudyValue('n', regression.n as number)} días.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Índice de estacionalidad semanal</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {(lab?.weekday_seasonality || []).map((day, index) => (
              <div key={index} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-center">
                <p className="text-xs text-slate-500">{day.weekday}</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">{formatStudyValue('index', day.seasonality_index as number)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          {(Array.isArray(lab?.methodology) ? lab?.methodology : [lab?.methodology]).filter(Boolean).map((item, index) => <p key={index}>{item}</p>)}
          {regression.caution && <p className="font-medium text-amber-700 dark:text-amber-300">{String(regression.caution)}</p>}
        </div>
      </div>
    );
  };

  const latestInsight = insightsHistory[0];
  const reportInsight = dailyInsight || latestInsight;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-brand-blue dark:text-brand-cyan mx-auto mb-3" size={32} />
          <p className="text-slate-500">Cargando Gabinete de IA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-brand-dark min-h-screen relative p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Cabecera */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                <Bot className="w-8 h-8 text-brand-blue dark:text-brand-cyan" />
                Gabinete de Analistas IA
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                Los agentes razonan mediante <b>OpenAI (o1 y GPT-4o)</b> realizando consultas SQL dinámicas para analizar el negocio.
              </p>
            </div>
            <button
              onClick={() => setIsContextModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-blue dark:text-brand-cyan bg-brand-blue/10 dark:bg-brand-cyan/10 hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 rounded-xl transition-colors border border-brand-blue/20 dark:border-brand-cyan/20 shadow-sm shrink-0"
            >
              <BookOpen size={16} /> Cerebro del Negocio
            </button>
          </div>

          {dataReadiness && (
            <div className="mt-4 border-y border-slate-200 dark:border-slate-800 py-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3">
                  <Database size={18} className="text-blue-500 shrink-0" />
                  <div><p className="text-xs text-slate-500">Ventas</p><p className="text-sm font-semibold text-slate-800 dark:text-white">{dataReadiness.registros_ventas.toLocaleString('es-ES')} registros</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Users size={18} className="text-emerald-500 shrink-0" />
                  <div><p className="text-xs text-slate-500">Clientes</p><p className="text-sm font-semibold text-slate-800 dark:text-white">{dataReadiness.clientes_con_ventas.toLocaleString('es-ES')} con ventas</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <PackageCheck size={18} className={dataReadiness.inventario_disponible ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'} />
                  <div><p className="text-xs text-slate-500">Inventario</p><p className="text-sm font-semibold text-slate-800 dark:text-white">{dataReadiness.inventario_disponible ? `${dataReadiness.productos_con_inventario.toLocaleString('es-ES')} productos` : 'Pendiente de carga'}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <ShoppingCart size={18} className="text-amber-500 shrink-0" />
                  <div><p className="text-xs text-slate-500">Compras</p><p className="text-sm font-semibold text-slate-800 dark:text-white">Pendiente de conexión</p></div>
                </div>
              </div>
              {dataReadiness.fecha_minima && dataReadiness.fecha_maxima && (
                <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs text-slate-500">
                  <p>Cobertura: {new Date(`${dataReadiness.fecha_minima}T00:00:00`).toLocaleDateString('es-ES')} a {new Date(`${dataReadiness.fecha_maxima}T00:00:00`).toLocaleDateString('es-ES')}. Periodos móviles anclados a la última fecha.</p>
                  <span className="hidden md:block text-slate-300 dark:text-slate-700">|</span>
                  <p className={dataReadiness.completitud_dimensiones_pct >= 98 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    Calidad dimensional: {dataReadiness.completitud_dimensiones_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
                  </p>
                  {dataReadiness.ventas_negativas > 0 && <p className="text-amber-600 dark:text-amber-400">{dataReadiness.ventas_negativas.toLocaleString('es-ES')} registros con venta negativa</p>}
                </div>
              )}
            </div>
          )}

          {/* Barra de estado global */}
          <div className={`mt-4 flex items-center gap-4 px-4 py-3 rounded-xl border text-sm ${
            latestInsight
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
          }`}>
            {latestInsight ? (
              <>
                <CheckCircle size={16} className="shrink-0" />
                <span>
                  <strong>Última ejecución:</strong>{' '}
                  {new Date(latestInsight.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span className="hidden md:block text-slate-400 dark:text-slate-600">·</span>
                <span className="hidden md:block">
                  Fases activas: {settings.fase1_active && settings.fase2_active ? 'Fase 1 + Fase 2' : settings.fase1_active ? 'Solo Fase 1' : settings.fase2_active ? 'Solo Fase 2' : 'Ninguna'}
                </span>
              </>
            ) : (
              <>
                <Clock size={16} className="shrink-0" />
                <span>Sin ejecuciones previas. Activa los agentes y ejecuta el análisis.</span>
              </>
            )}
          </div>

          {/* Mensajes de error/éxito inline */}
          {runError && (
            <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 rounded-xl text-sm">
              <AlertCircle size={16} className="shrink-0" /> {runError}
            </div>
          )}
          {runSuccess && (
            <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm">
              <CheckCircle size={16} className="shrink-0" /> ¡Análisis completado con éxito! Los nuevos informes están disponibles en el historial.
            </div>
          )}
        </div>

        {/* Fase 1 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Fase 1: Agentes de Área <span className="text-sm font-normal text-slate-400">(GPT-4o)</span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">María, Lucía y Mattia extraen alertas y redactan informes cognitivos.</p>
            </div>
            <button
              onClick={() => handleToggle('fase1_active')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${settings.fase1_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.fase1_active ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['maria', 'lucia', 'mattia'] as const).map(agentId => {
              const info = AGENTS_INFO[agentId];
              const colorMap: Record<string, string> = {
                emerald: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                blue: 'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
                violet: 'border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400',
              };
              const icons: Record<string, React.ReactNode> = { maria: <Bot size={18} />, lucia: <TrendingUp size={18} />, mattia: <DollarSign size={18} /> };
              return (
                <div
                  key={agentId}
                  onClick={() => setSelectedAgent(agentId)}
                  className={`cursor-pointer rounded-xl p-5 border-2 transition-all hover:shadow-md hover:scale-[1.02] ${settings.fase1_active ? colorMap[info.color] : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-400'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {icons[agentId]} {info.name}
                    </div>
                    <div className="flex items-center gap-2">
                      {settings.fase1_active ? (
                        <span className="flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs opacity-70 mb-3">Área: {info.role} · {info.model}</p>
                  <p className="text-sm leading-5 min-h-[60px] text-slate-700 dark:text-slate-300">{info.purpose}</p>
                  <div className="relative mt-3 h-32 flex justify-center items-center">
                    <img
                      src={settings.fase1_active ? `/assets/agents/${agentId}_work.png` : `/assets/agents/${agentId}_sleep.png`}
                      alt={info.name}
                      className={`max-h-full max-w-full object-contain drop-shadow-lg transition-all duration-500 ${settings.fase1_active ? 'opacity-100' : 'opacity-60'}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {!settings.fase1_active && (
                      <span className="absolute top-0 right-1/3 text-slate-400 font-bold text-sm animate-bounce">Zzz</span>
                    )}
                  </div>
                  <div className="mt-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${settings.fase1_active ? 'bg-white/60 dark:bg-black/20' : 'bg-white/40 dark:bg-black/10'}`}>
                      <Power size={11} />
                      {settings.fase1_active ? 'ACTIVO' : 'EN ESPERA'}
                    </span>
                  </div>
                  <p className="text-[11px] mt-3 text-center opacity-60">Abrir expediente y chat</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fase 2 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                Fase 2: CEO Consolidador <span className="text-sm font-normal text-slate-400">(o1)</span>
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">El CEO toma los 3 informes y razona para emitir un Executive Summary.</p>
            </div>
            <button
              onClick={() => handleToggle('fase2_active')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${settings.fase2_active ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.fase2_active ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex justify-center">
            <div className={`w-full max-w-md rounded-xl p-5 border-2 transition-all ${settings.fase2_active ? 'border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                  <Brain size={18} className="text-purple-500" /> Director de Operaciones (o1)
                </span>
                {settings.fase2_active ? (
                  <span className="flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-purple-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" /></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400" />
                )}
              </div>
              <div className="relative h-40 flex justify-center items-center">
                <img
                  src={settings.fase2_active ? '/assets/agents/ceo_work.png' : '/assets/agents/ceo_sleep.png'}
                  alt="CEO"
                  className={`max-h-full max-w-full object-contain drop-shadow-lg transition-all duration-500 ${settings.fase2_active ? 'opacity-100' : 'opacity-60'}`}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="mt-3 text-center">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${settings.fase2_active ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                  <Power size={11} />{settings.fase2_active ? 'ACTIVO' : 'EN ESPERA'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Informes + Botón de ejecución */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                Historial de Informes Ejecutivos
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Consulta los reportes generados por los agentes departamentales y el CEO.</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                onClick={handleRunAnalysis}
                disabled={isRunning || (!settings.fase1_active && !settings.fase2_active)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors shadow-sm min-w-[180px] justify-center"
              >
                {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
                {isRunning ? 'Ejecutando...' : 'Nueva Ejecución'}
              </button>
              {isRunning && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-pulse">
                  <span>{EXECUTION_STAGES[Math.min(runStage, EXECUTION_STAGES.length - 1)].msg}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {insightsHistory.length > 0 ? (
              insightsHistory.map((insight, idx) => (
                <div key={insight.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleRow(insight.id)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {idx === 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full">Nuevo</span>
                      )}
                      <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Reporte del {new Date(insight.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      {insight.fase1_maria_md && <span className="hidden md:block">📦 María</span>}
                      {insight.fase1_lucia_md && <span className="hidden md:block">📈 Lucía</span>}
                      {insight.fase1_mattia_md && <span className="hidden md:block">💰 Mattia</span>}
                      {insight.fase2_ceo_markdown && <span className="hidden md:block">🧠 CEO</span>}
                      {expandedRowId === insight.id ? <ChevronUp className="text-slate-500" size={18} /> : <ChevronDown className="text-slate-500" size={18} />}
                    </div>
                  </button>

                  {expandedRowId === insight.id && (
                    <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                      {renderAgentAccordion(insight.id, 'ceo', '💼 Executive Summary (CEO)', insight.fase2_ceo_markdown, true)}
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Informes Departamentales</h4>
                        {renderAgentAccordion(insight.id, 'maria', '📦 Reporte de Inventario (María)', insight.fase1_maria_md, false)}
                        {renderAgentAccordion(insight.id, 'lucia', '📈 Reporte de Ventas (Lucía)', insight.fase1_lucia_md, false)}
                        {renderAgentAccordion(insight.id, 'mattia', '💰 Reporte de Finanzas (Mattia)', insight.fase1_mattia_md, false)}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>No hay historial de informes.</p>
                <p className="text-sm mt-1">Activa los agentes y pulsa Nueva Ejecución.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Chat con Agente */}
      {selectedAgent && AGENTS_INFO[selectedAgent] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-5 bg-slate-900/55 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-[1500px] h-[94vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  Expediente: {AGENTS_INFO[selectedAgent].name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Área: {AGENTS_INFO[selectedAgent].role} · Informe diario · Memoria analítica: 7 días
                </p>
              </div>
              <button title="Cerrar expediente" aria-label="Cerrar expediente" onClick={() => setSelectedAgent(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-3 md:p-5 overflow-y-auto lg:overflow-hidden flex-1 grid grid-cols-1 lg:grid-cols-[minmax(360px,0.85fr)_minmax(560px,1.15fr)] lg:grid-rows-[auto_minmax(0,1fr)] gap-4 min-h-0">
              {/* Vista previa del informe diario */}
              <section className="order-1 lg:col-start-2 lg:row-start-1 lg:row-span-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 min-h-[420px] overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PanelRight size={17} className="text-brand-blue dark:text-brand-cyan" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Centro de estudios de {AGENTS_INFO[selectedAgent].name}</h3>
                      <p className="text-xs text-slate-500">Informe, conocimiento y laboratorio analítico</p>
                    </div>
                  </div>
                  {reportInsight && (
                    <span className="text-xs text-slate-500 shrink-0">{new Date(reportInsight.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  )}
                </div>
                <div className="px-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
                  <div className="flex min-w-max">
                    {([
                      ['report', 'Informe', <FileText size={14} />],
                      ['articles', 'Artículos', <Boxes size={14} />],
                      ['clients', 'Clientes', <UserRoundSearch size={14} />],
                      ['product_managers', 'Product Managers', <BriefcaseBusiness size={14} />],
                      ['laboratory', 'Laboratorio', <FlaskConical size={14} />],
                    ] as Array<[StudyTab, string, React.ReactNode]>).map(([id, label, icon]) => (
                      <button key={id} type="button" onClick={() => setStudyTab(id)} className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors ${studyTab === id ? 'border-brand-blue dark:border-brand-cyan text-brand-blue dark:text-brand-cyan' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5 md:p-7">
                  {studyTab === 'report' && isDailyPreparing && (
                    <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm">
                      <Loader2 size={16} className="animate-spin shrink-0" /> Actualizando el informe de hoy con los datos existentes...
                    </div>
                  )}
                  {studyTab === 'report' && dailyError && <div className="mb-5 text-sm text-amber-700 dark:text-amber-300">{dailyError}</div>}
                  {studyTab === 'report' && reportInsight && reportInsight[`fase1_${selectedAgent}_md` as keyof AgentInsight] ? (
                    <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{String(reportInsight[`fase1_${selectedAgent}_md` as keyof AgentInsight])}</ReactMarkdown>
                    </div>
                  ) : studyTab === 'report' && !isDailyPreparing ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                      <FileText size={38} className="mb-3 opacity-40" />
                      <p className="font-medium">Todavía no hay un informe disponible.</p>
                      <button type="button" onClick={prepareDailyReport} className="mt-4 px-4 py-2 text-sm rounded-lg bg-brand-blue text-white hover:bg-blue-700">Preparar informe</button>
                    </div>
                  ) : null}
                  {studyTab !== 'report' && isStudiesLoading && (
                    <div className="h-full flex items-center justify-center gap-3 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Preparando estudios diarios...</div>
                  )}
                  {studyTab !== 'report' && studiesError && !isStudiesLoading && <div className="text-sm text-amber-700 dark:text-amber-300">{studiesError}</div>}
                  {studyTab !== 'report' && agentStudies && !isStudiesLoading && (
                    <>
                      <div className="mb-5 pb-4 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-xs uppercase text-slate-500 font-semibold">Enfoque experto</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{agentStudies.focus}</p>
                        <p className="text-xs text-slate-500 mt-2">Datos hasta {agentStudies.source_date ? new Date(`${agentStudies.source_date}T00:00:00`).toLocaleDateString('es-ES') : 'sin fecha'} · Estudio guardado diariamente</p>
                      </div>
                      {studyTab === 'laboratory' ? renderLaboratory() : renderStudyTable(studyTab)}
                      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 space-y-1">
                        {agentStudies.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Capacidades verificadas */}
              <div className="order-2 lg:col-start-1 lg:row-start-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg p-4 border border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Calculator size={14} className="text-brand-blue dark:text-brand-cyan" /> Qué analiza y calcula
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{AGENTS_INFO[selectedAgent].purpose}</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {AGENTS_INFO[selectedAgent].calculations.map(calculation => (
                    <div key={calculation} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2"><CheckCircle size={13} className="text-emerald-500 mt-0.5 shrink-0" />{calculation}</div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2"><Sparkles size={13} /> Preguntas recomendadas</p>
                  <div className="flex flex-wrap gap-2">
                    {AGENTS_INFO[selectedAgent].prompts.map(prompt => (
                      <button key={prompt} type="button" onClick={() => setChatInput(prompt)} className="text-left text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-blue dark:hover:border-brand-cyan transition-colors">{prompt}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chat */}
              <div className="order-3 lg:col-start-1 lg:row-start-2 flex flex-col min-h-[420px] lg:min-h-0 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-inner">
                <div className="bg-white dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                  <MessageSquare size={16} className="text-brand-blue dark:text-brand-cyan" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">Chat con {AGENTS_INFO[selectedAgent].name}</span>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {agentChatHistory.length === 0 && !isChatLoading && (
                    <div className="text-center text-slate-400 text-sm py-8 flex flex-col items-center">
                      <Bot size={32} className="mb-2 opacity-50" />
                      <p className="font-medium text-slate-500 dark:text-slate-300">El informe diario está listo para orientar la conversación.</p>
                      <p className="mt-1 text-xs">Pregunta por un hallazgo o usa una sugerencia.</p>
                    </div>
                  )}
                  {agentChatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-brand-blue text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-tl-sm shadow-sm'}`}>
                        {msg.role === 'user' ? msg.content : <div className="prose dark:prose-invert max-w-none text-sm"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown></div>}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl rounded-tl-sm flex gap-2 items-center shadow-sm">
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                  {!isChatLoading && chatSuggestions.length > 0 && agentChatHistory.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {chatSuggestions.map(suggestion => (
                        <button key={suggestion} type="button" onClick={() => setChatInput(suggestion)} className="text-left text-xs px-3 py-2 rounded-lg border border-brand-blue/30 dark:border-brand-cyan/30 text-brand-blue dark:text-brand-cyan hover:bg-brand-blue/5 dark:hover:bg-brand-cyan/10 transition-colors">
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendAgentMessage} className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex gap-2 shrink-0">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendAgentMessage();
                      }
                    }}
                    placeholder={`Pregúntale a ${AGENTS_INFO[selectedAgent].name} sobre ${AGENTS_INFO[selectedAgent].role.toLowerCase()}...`}
                    maxLength={2000}
                    rows={2}
                    className="flex-1 min-h-[44px] max-h-28 resize-y bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-4 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                    disabled={isChatLoading || isDailyPreparing}
                  />
                  <button type="submit" title="Enviar mensaje" aria-label="Enviar mensaje" disabled={!chatInput.trim() || isChatLoading || isDailyPreparing} className="self-end p-3 bg-brand-blue dark:bg-brand-cyan text-white rounded-lg hover:bg-blue-700 dark:hover:bg-cyan-600 disabled:opacity-50 transition-colors">
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cerebro del Negocio */}
      {isContextModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-brand-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-brand-cyan/20">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-brand-dark/50">
              <div className="flex items-center gap-3">
                <div className="bg-brand-blue/10 dark:bg-brand-cyan/20 p-2 rounded-lg text-brand-blue dark:text-brand-cyan">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cerebro del Negocio</h2>
                  <p className="text-xs text-slate-500">Contexto global que leen todos los agentes de IA</p>
                </div>
              </div>
              <button onClick={() => setIsContextModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Redacta aquí el contexto de negocio que leerán el Copilot y todos los agentes de IA al analizar tus datos.</p>
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Ejemplo: Nuestro objetivo es no tener más de 15 días de cobertura..."
                className="w-full h-64 p-4 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-blue dark:focus:border-brand-cyan text-slate-800 dark:text-slate-200 resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">{businessContext.length} caracteres</p>
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50 flex justify-end gap-3">
              <button onClick={() => setIsContextModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleSaveContext} disabled={isSavingContext} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 disabled:opacity-70 shadow-md">
                {isSavingContext ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSavingContext ? 'Guardando...' : 'Guardar Contexto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
