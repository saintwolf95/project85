import { useState, useEffect, useRef } from 'react';
import { getAgentSettings, updateAgentSettings, getAllAgentInsights, runAgentAnalysis, getAgentChat, sendAgentMessage, getBusinessContext, updateBusinessContext } from '../services/api';
import type { AgentSettings, AgentInsight, AgentChatMessage } from '../services/api';
import { Power, Bot, TrendingUp, DollarSign, Brain, PlayCircle, FileText, Loader2, X, Code2, ChevronDown, ChevronUp, Send, MessageSquare, Clock, CheckCircle, AlertCircle, BookOpen, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  model: string;
  color: string;
  formula: string;
}

const AGENTS_INFO: Record<string, AgentInfo> = {
  maria: {
    id: 'maria',
    name: 'María',
    role: 'Inventario',
    model: 'GPT-4o',
    color: 'emerald',
    formula: `**IA Cognitiva + Tool Calling:** María recibe las alertas logísticas y luego consulta SQL activamente para generar su informe.`
  },
  lucia: {
    id: 'lucia',
    name: 'Lucía',
    role: 'Ventas',
    model: 'GPT-4o',
    color: 'blue',
    formula: `**IA Cognitiva + Tool Calling:** Lucía lee alertas comerciales, revisa los márgenes dinámicamente vía SQL y sugiere estrategias de promoción.`
  },
  mattia: {
    id: 'mattia',
    name: 'Mattia',
    role: 'Finanzas',
    model: 'GPT-4o',
    color: 'violet',
    formula: `**IA Cognitiva + Tool Calling:** Mattia escanea márgenes negativos, investiga costos en vivo vía SQL y expone la salud financiera del inventario.`
  }
};

const EXECUTION_STAGES = [
  { phase: 1, msg: '⚡ Iniciando agentes de área...', agent: null },
  { phase: 1, msg: '📦 María analizando el inventario...', agent: 'maria' },
  { phase: 1, msg: '📈 Lucía revisando ventas y márgenes...', agent: 'lucia' },
  { phase: 1, msg: '💰 Mattia calculando la salud financiera...', agent: 'mattia' },
  { phase: 2, msg: '🧠 CEO consolidando el informe ejecutivo...', agent: 'ceo' },
  { phase: 2, msg: '✅ Guardando resultados...', agent: null },
];

export const AiControlPanel = () => {
  const [settings, setSettings] = useState<AgentSettings>({ fase1_active: false, fase2_active: false });
  const [insightsHistory, setInsightsHistory] = useState<AgentInsight[]>([]);
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
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Cerebro del Negocio
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);

  useEffect(() => {
    if (selectedAgent) {
      setAgentChatHistory([]);
      setIsChatLoading(true);
      getAgentChat(selectedAgent)
        .then(data => setAgentChatHistory(data))
        .catch(err => console.error(err))
        .finally(() => setIsChatLoading(false));
    }
  }, [selectedAgent]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentChatHistory]);

  const handleSendAgentMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || !selectedAgent || isChatLoading) return;
    const newMessage: AgentChatMessage = { role: 'user', content: chatInput.trim() };
    const updatedHistory = [...agentChatHistory, newMessage];
    setAgentChatHistory(updatedHistory);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const response = await sendAgentMessage(selectedAgent, updatedHistory);
      setAgentChatHistory([...updatedHistory, { role: 'assistant', content: response.reply }]);
    } catch {
      setAgentChatHistory([...updatedHistory, { role: 'assistant', content: '⚠️ Error al conectar con el agente. Inténtalo de nuevo.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      const [settingsData, insightsData] = await Promise.all([getAgentSettings(), getAllAgentInsights()]);
      setSettings(settingsData);
      setInsightsHistory(insightsData);
      if (insightsData.length > 0 && !expandedRowId) setExpandedRowId(insightsData[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refreshData(); }, []);

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
    const stagesFiltered = EXECUTION_STAGES.filter(s => s.phase === 1 || settings.fase2_active);
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stagesFiltered.length - 1);
      setRunStage(stageIdx);
    }, 4000);

    try {
      await runAgentAnalysis();
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

  const latestInsight = insightsHistory[0];

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
                  <p className="text-[11px] mt-3 text-center opacity-60">Haz clic para chatear</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  Expediente: {AGENTS_INFO[selectedAgent].name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Área: {AGENTS_INFO[selectedAgent].role} · Modelo: {AGENTS_INFO[selectedAgent].model} · Memoria: 7 días
                </p>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 flex flex-col">
              {/* Último informe del agente */}
              {latestInsight && latestInsight[`fase1_${selectedAgent}_md` as keyof AgentInsight] && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shrink-0">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <FileText size={13} /> Último informe ({new Date(latestInsight.fecha).toLocaleDateString('es-ES')})
                  </h3>
                  <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-400 line-clamp-4">
                    <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{String(latestInsight[`fase1_${selectedAgent}_md` as keyof AgentInsight] || '').slice(0, 400) + '...'}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Arquitectura */}
              <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Code2 size={14} className="text-brand-blue dark:text-brand-cyan" /> Arquitectura Cognitiva
                </h3>
                <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-400">
                  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{AGENTS_INFO[selectedAgent].formula}</ReactMarkdown>
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 flex flex-col min-h-[250px] border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-inner">
                <div className="bg-white dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                  <MessageSquare size={16} className="text-brand-blue dark:text-brand-cyan" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">Chat con {AGENTS_INFO[selectedAgent].name}</span>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {agentChatHistory.length === 0 && !isChatLoading && (
                    <div className="text-center text-slate-400 text-sm italic py-8 flex flex-col items-center">
                      <Bot size={32} className="mb-2 opacity-50" />
                      Saluda a {AGENTS_INFO[selectedAgent].name}. Solo responderá sobre su área de especialidad.
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
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendAgentMessage} className="p-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Pregúntale a ${AGENTS_INFO[selectedAgent].name} sobre ${AGENTS_INFO[selectedAgent].role.toLowerCase()}...`}
                    className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                    disabled={isChatLoading}
                  />
                  <button type="submit" disabled={!chatInput.trim() || isChatLoading} className="p-2 bg-brand-blue dark:bg-brand-cyan text-white rounded-xl hover:bg-blue-700 dark:hover:bg-cyan-600 disabled:opacity-50 transition-colors">
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
