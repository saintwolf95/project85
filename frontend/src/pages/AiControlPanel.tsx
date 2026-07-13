import { useState, useEffect, useRef } from 'react';
import { getAgentSettings, updateAgentSettings, getAllAgentInsights, runAgentAnalysis, getAgentChat, sendAgentMessage } from '../services/api';
import type { AgentSettings, AgentInsight, AgentChatMessage } from '../services/api';
import { Power, Bot, TrendingUp, DollarSign, Brain, PlayCircle, FileText, Loader2, X, Code2, ChevronDown, ChevronUp, Send, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  formula: string;
}

const AGENTS_INFO: Record<string, AgentInfo> = {
  maria: {
    id: 'maria',
    name: 'María',
    role: 'Inventario',
    formula: `**IA Cognitiva + Tool Calling:** María recibe las alertas logísticas y luego consulta SQL activamente para generar su informe.`
  },
  lucia: {
    id: 'lucia',
    name: 'Lucía',
    role: 'Ventas',
    formula: `**IA Cognitiva + Tool Calling:** Lucía lee alertas comerciales, revisa los márgenes dinámicamente vía SQL y sugiere estrategias de promoción.`
  },
  mattia: {
    id: 'mattia',
    name: 'Mattia',
    role: 'Finanzas',
    formula: `**IA Cognitiva + Tool Calling:** Mattia escanea márgenes negativos, investiga costos en vivo vía SQL y expone la salud financiera del inventario.`
  }
};

export const AiControlPanel = () => {
  const [settings, setSettings] = useState<AgentSettings>({ fase1_active: false, fase2_active: false });
  const [insightsHistory, setInsightsHistory] = useState<AgentInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  
  // Chat States
  const [agentChatHistory, setAgentChatHistory] = useState<AgentChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // For expanding history rows
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [expandedAgentMap, setExpandedAgentMap] = useState<Record<string, boolean>>({});

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
    } catch (error) {
      console.error(error);
      alert("Error enviando mensaje al agente");
    } finally {
      setIsChatLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      const [settingsData, insightsData] = await Promise.all([
        getAgentSettings(), 
        getAllAgentInsights()
      ]);
      setSettings(settingsData);
      setInsightsHistory(insightsData);
      if (insightsData.length > 0 && !expandedRowId) {
        setExpandedRowId(insightsData[0].id); // expand first by default
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleToggle = async (key: keyof AgentSettings) => {
    const newValue = { ...settings, [key]: !settings[key] };
    setSettings(newValue);
    try {
      await updateAgentSettings(newValue);
    } catch (e) {
      console.error(e);
      setSettings(settings);
    }
  };

  const handleRunAnalysis = async () => {
    if (!settings.fase1_active && !settings.fase2_active) {
      alert("Debes encender al menos una fase para ejecutar el análisis.");
      return;
    }
    setIsRunning(true);
    try {
      await runAgentAnalysis();
      await refreshData();
    } catch (error: any) {
      console.error(error);
      const detail = error.response?.data?.detail || error.message || "Desconocido";
      alert("Hubo un error al ejecutar el análisis:\n" + detail);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleRow = (id: number) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const toggleAgentView = (rowId: number, agentId: string) => {
    const key = `${rowId}-${agentId}`;
    setExpandedAgentMap(prev => ({...prev, [key]: !prev[key]}));
  };

  const renderAgentAccordion = (rowId: number, agentId: string, title: string, content?: string, defaultOpen = false) => {
    const key = `${rowId}-${agentId}`;
    const isOpen = expandedAgentMap[key] !== undefined ? expandedAgentMap[key] : defaultOpen;
    
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-3">
        <button 
          onClick={() => toggleAgentView(rowId, agentId)}
          className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 text-left transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <span className="font-semibold text-slate-800 dark:text-white">{title}</span>
          {isOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
        </button>
        {isOpen && (
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
            {content ? (
              <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">Sin datos generados para este reporte.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Cargando Gabinete de IA...</div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-brand-dark min-h-screen relative p-8">
      
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <Bot className="w-8 h-8 text-brand-blue dark:text-brand-cyan" /> 
            Gabinete de Analistas IA (Cognitivo)
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Los agentes ahora no solo aplican matemáticas, sino que razonan mediante <b>OpenAI (o1 y gpt-4o)</b> realizando consultas SQL dinámicas (Tool-Calling) para entender mejor los datos antes de emitir su reporte.
          </p>
        </div>

        {/* Phase 1 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Fase 1: Agentes de Área (GPT-4o)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                María, Lucía y Mattia extraen alertas SQL y luego redactan un informe cognitivo usando bases de datos reales.
              </p>
            </div>
            
            <button 
              onClick={() => handleToggle('fase1_active')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${settings.fase1_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.fase1_active ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div onClick={() => setSelectedAgent('maria')} className="cursor-pointer transform hover:scale-[1.02] transition-transform">
              <AgentDesk 
                title="María (Inventario)" 
                icon={<Bot size={16} />}
                isActive={settings.fase1_active}
                workingImg="/assets/agents/maria_work.png"
                sleepingImg="/assets/agents/maria_sleep.png"
              />
            </div>
            <div onClick={() => setSelectedAgent('lucia')} className="cursor-pointer transform hover:scale-[1.02] transition-transform">
              <AgentDesk 
                title="Lucía (Ventas)" 
                icon={<TrendingUp size={16} />}
                isActive={settings.fase1_active}
                workingImg="/assets/agents/lucia_work.png"
                sleepingImg="/assets/agents/lucia_sleep.png"
              />
            </div>
            <div onClick={() => setSelectedAgent('mattia')} className="cursor-pointer transform hover:scale-[1.02] transition-transform">
              <AgentDesk 
                title="Mattia (Finanzas)" 
                icon={<DollarSign size={16} />}
                isActive={settings.fase1_active}
                workingImg="/assets/agents/fin_work.png"
                sleepingImg="/assets/agents/fin_sleep.png"
              />
            </div>
          </div>
        </div>

        {/* Phase 2 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                Fase 2: CEO Consolidador (o1-preview)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                El CEO de IA toma los 3 informes departamentales y razona para emitir un Executive Summary.
              </p>
            </div>
            
            <button 
              onClick={() => handleToggle('fase2_active')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${settings.fase2_active ? 'bg-purple-500' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.fase2_active ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <AgentDesk 
                title="Director de Operaciones (o1)" 
                icon={<Brain size={16} />}
                isActive={settings.fase2_active}
                workingImg="/assets/agents/ceo_work.png"
                sleepingImg="/assets/agents/ceo_sleep.png"
                isBig
              />
            </div>
          </div>
        </div>

        {/* Inbox / Results */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                Historial de Informes Ejecutivos
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Consulta los reportes pasados emitidos por los agentes departamentales y el CEO.
              </p>
            </div>
            <button 
              onClick={handleRunAnalysis}
              disabled={isRunning || (!settings.fase1_active && !settings.fase2_active)}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
              {isRunning ? 'Ejecutando...' : 'Nueva Ejecución'}
            </button>
          </div>

          <div className="space-y-4">
            {insightsHistory.length > 0 ? (
              insightsHistory.map((insight) => (
                <div key={insight.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => toggleRow(insight.id)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Reporte del {new Date(insight.fecha).toLocaleString()}
                    </span>
                    {expandedRowId === insight.id ? <ChevronUp className="text-slate-500" /> : <ChevronDown className="text-slate-500" />}
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
                <p className="text-sm">Enciende a los agentes y pulsa Nueva Ejecución.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Agent Modal */}
      {selectedAgent && AGENTS_INFO[selectedAgent] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Expediente: {AGENTS_INFO[selectedAgent].name} ({AGENTS_INFO[selectedAgent].role})
              </h2>
              <button 
                onClick={() => setSelectedAgent(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1 flex flex-col min-h-[500px]">
              <div className="bg-slate-100 dark:bg-slate-800/80 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Code2 size={16} className="text-brand-blue dark:text-brand-cyan" />
                  Arquitectura Cognitiva
                </h3>
                <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-400">
                  <ReactMarkdown>{AGENTS_INFO[selectedAgent].formula}</ReactMarkdown>
                </div>
              </div>

              {/* Chat Interface */}
              <div className="flex-1 flex flex-col min-h-[300px] border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 shadow-inner">
                <div className="bg-white dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                  <MessageSquare size={16} className="text-brand-blue dark:text-brand-cyan" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">Chat con {AGENTS_INFO[selectedAgent].name}</span>
                </div>
                
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {agentChatHistory.length === 0 && !isChatLoading && (
                    <div className="text-center text-slate-400 text-sm italic py-8 flex flex-col items-center">
                      <Bot size={32} className="mb-2 opacity-50" />
                      Saluda a {AGENTS_INFO[selectedAgent].name}. Recuerda que solo responderá sobre su área.
                    </div>
                  )}
                  {agentChatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-brand-blue text-white rounded-tr-sm' 
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.role === 'user' ? msg.content : <ReactMarkdown className="prose dark:prose-invert max-w-none text-sm">{msg.content}</ReactMarkdown>}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl rounded-tl-sm flex gap-2 items-center shadow-sm">
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-brand-cyan/50 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
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
                    placeholder={`Pregúntale a ${AGENTS_INFO[selectedAgent].name}...`}
                    className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                    disabled={isChatLoading}
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="p-2 bg-brand-blue dark:bg-brand-cyan text-white rounded-xl hover:bg-blue-700 dark:hover:bg-cyan-600 disabled:opacity-50 transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AgentDesk = ({ title, icon, isActive, workingImg, sleepingImg, isBig = false }: any) => {
  return (
    <div className={`relative bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 border ${isActive ? 'border-brand-blue/30 dark:border-brand-cyan/30' : 'border-slate-200 dark:border-slate-700'} overflow-hidden flex flex-col items-center`}>
      <div className="absolute top-3 left-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 z-10 bg-white/80 dark:bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm">
        {icon} {title}
      </div>
      
      <div className="absolute top-3 right-3 z-10">
        {isActive ? (
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        ) : (
          <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
        )}
      </div>

      <div className={`relative mt-8 transition-all duration-500 ${isBig ? 'h-64' : 'h-48'} w-full flex justify-center items-center`}>
        {!isActive && (
          <div className="absolute top-0 right-1/4 md:right-1/3 z-20 font-bold text-slate-400 font-orbitron select-none pointer-events-none">
            <div className="absolute animate-zzz-1 text-sm">Z</div>
            <div className="absolute animate-zzz-2 text-base">z</div>
            <div className="absolute animate-zzz-3 text-lg">z</div>
          </div>
        )}
        <img 
          src={isActive ? workingImg : sleepingImg} 
          alt={title}
          className={`absolute max-h-full max-w-full object-contain drop-shadow-xl transition-all duration-500 ${isActive ? 'opacity-100 animate-typing-bop' : 'animate-breathing'}`}
        />
      </div>
      
      <div className="mt-4 text-center">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
          <Power size={12} />
          {isActive ? 'TRABAJANDO' : 'DURMIENDO'}
        </span>
      </div>
    </div>
  );
};
