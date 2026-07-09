import { useState, useEffect } from 'react';
import { getAgentSettings, updateAgentSettings } from '../services/api';
import type { AgentSettings } from '../services/api';
import { Power, Bot, TrendingUp, DollarSign, Brain } from 'lucide-react';

export const AiControlPanel = () => {
  const [settings, setSettings] = useState<AgentSettings>({ fase1_active: false, fase2_active: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAgentSettings().then((data) => {
      setSettings(data);
      setIsLoading(false);
    }).catch(console.error);
  }, []);

  const handleToggle = async (key: keyof AgentSettings) => {
    const newValue = { ...settings, [key]: !settings[key] };
    setSettings(newValue);
    try {
      await updateAgentSettings(newValue);
    } catch (e) {
      console.error(e);
      // Revert if error
      setSettings(settings);
    }
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
            Gabinete de Analistas IA (Estilo Habbo)
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Controla el gasto de tokens y el estado de la plantilla virtual. Enciende a los detectives matemáticos para monitoreo gratuito, o despierta al CEO IA para resúmenes avanzados.
          </p>
        </div>

        {/* Phase 1 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Fase 1: Detectives Matemáticos (0 Tokens)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Analistas estadísticos que vigilan la BD en tiempo real mediante algoritmos de Python y SQL.
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
            {/* Agent 1 */}
            <AgentDesk 
              title="María (Inventario)" 
              icon={<Bot size={16} />}
              isActive={settings.fase1_active}
              workingImg="/assets/agents/inv_work.png"
              sleepingImg="/assets/agents/inv_sleep.png"
            />
            {/* Agent 2 */}
            <AgentDesk 
              title="Lucía (Ventas)" 
              icon={<TrendingUp size={16} />}
              isActive={settings.fase1_active}
              workingImg="/assets/agents/sale_work.png"
              sleepingImg="/assets/agents/sale_sleep.png"
            />
            {/* Agent 3 */}
            <AgentDesk 
              title="Mattia (Finanzas)" 
              icon={<DollarSign size={16} />}
              isActive={settings.fase1_active}
              workingImg="/assets/agents/fin_work.png"
              sleepingImg="/assets/agents/fin_sleep.png"
            />
          </div>
        </div>

        {/* Phase 2 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                Fase 2: CEO Consolidador (OpenAI)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Modelo Avanzado (gpt-4o-mini). Recibe las alertas de los detectives y redacta el informe final del día. Consume tokens.
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
                title="Director de Operaciones IA" 
                icon={<Brain size={16} />}
                isActive={settings.fase2_active}
                workingImg="/assets/agents/ceo_work.png"
                sleepingImg="/assets/agents/ceo_sleep.png"
                isBig
              />
            </div>
          </div>
        </div>

      </div>
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
        <img 
          src={isActive ? workingImg : sleepingImg} 
          alt={title}
          className={`absolute max-h-full max-w-full object-contain drop-shadow-xl transition-all duration-500 ${isActive ? 'scale-105 opacity-100' : 'scale-100 opacity-80 grayscale-[20%]'}`}
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
