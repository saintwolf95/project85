import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Circle, LayoutGrid, Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useAuth } from '../context/useAuth';
import { runAgentAnalysis } from '../services/api';
import type { AgentWorkState } from '../services/api';
import './AgentOffice.css';

const agents = [
  { id: 'maria', name: 'María', role: 'Inventario', task: 'Disponibilidad, cobertura y capital', color: '#0891b2', hair: '#473631' },
  { id: 'lucia', name: 'Lucía', role: 'Ventas', task: 'Clientes, ventas y oportunidades', color: '#0071e3', hair: '#986644' },
  { id: 'mattia', name: 'Mattia', role: 'Finanzas', task: 'MG, MGD y rentabilidad', color: '#7c6ac8', hair: '#293344' },
  { id: 'ceo', name: 'CEO', role: 'Dirección', task: 'Consolidación y decisiones', color: '#475569', hair: '#687282' },
] as const;

const stateLabels: Record<AgentWorkState, string> = {
  pendiente: 'En espera', trabajando: 'Analizando', preparado: 'Informe preparado',
  completado: 'Informe guardado', error: 'Error de ejecución', interrumpido: 'Ejecución interrumpida', omitido: 'Fase desactivada',
};

// Ilustración SVG propia: la pose y el desplazamiento responden al estado real.
const Desk = ({ agent, state }: { agent: typeof agents[number]; state?: AgentWorkState }) => (
  <svg viewBox="0 0 320 230" className="office-desk" aria-hidden="true">
    <ellipse cx="156" cy="207" rx="112" ry="15" fill="currentColor" opacity=".05" />
    <g className="office-furniture">
      <path d="M244 120v64l34 17v-65z" fill="currentColor" opacity=".08" />
      <path d="M244 120l25-12 35 18-26 10z" fill="currentColor" opacity=".12" />
      <path d="M278 136l26-10v63l-26 12z" fill="currentColor" opacity=".16" />
      <path d="M256 137v12m9-8v12m-9 12v12m9-8v12" stroke={agent.color} strokeWidth="5" />
      <path d="M34 168l13 6 11-6-5 27H40z" fill={agent.color} opacity=".5" />
      <path d="M46 170c-24-12-17-37 0-20 8-35 27-21 5-4 30-4 20 20-5 24" fill="#5d9779" />
      <path d="M83 126v61m139-36v46m-44-31v51" stroke="currentColor" strokeWidth="8" opacity=".18" />
      <path d="M65 112l87-42 89 43-86 45z" fill="var(--office-wood)" />
      <path d="M65 112v10l90 46 86-45v-10l-86 45z" fill="var(--office-edge)" />
      <path d="M161 91l37 17-11 6-38-17z" fill="currentColor" opacity=".16" />
      <path d="M174 83v21" stroke="currentColor" opacity=".35" strokeWidth="5" />
      <path d="M146 40l60 29v43l-60-29z" fill="var(--office-monitor)" />
      <path d="M151 48l49 24v31l-49-24z" fill={agent.color} opacity=".35" />
      <path className="office-screen" d="M158 75v-9m10 14V64m10 21V73m10 17V71" stroke={agent.color} strokeWidth="5" />
      <path d="M108 111l36 17-14 7-36-17z" fill="currentColor" opacity=".18" />
      <path d="M211 110v12c0 8 13 8 13 0v-12z" fill={agent.color} opacity=".7" />
      <path d="M79 183v17m-10 7 10-7 12 6" stroke="currentColor" strokeWidth="5" opacity=".25" />
      <rect x="57" y="145" width="44" height="44" rx="15" fill="var(--office-chair)" />
    </g>
    <g className={`office-person office-person-${state || 'idle'}`}>
      <path d="M80 166l20 15 4 19m-30-30 8 22-7 14" fill="none" stroke="#475569" strokeWidth="12" strokeLinecap="round" />
      <path d="M64 126q19-14 35 4l2 36q-19 18-40-1z" fill={agent.color} />
      <g className="office-hands" stroke="#dcac87" strokeWidth="9" strokeLinecap="round">
        <path d="M95 136l14 9 17-16m-59 6 20 15 16-19" fill="none" />
      </g>
      <rect x="78" y="110" width="12" height="19" rx="5" fill="#dcac87" />
      <ellipse cx="83" cy="100" rx="20" ry="24" fill="#ebbe9b" />
      <path d="M63 105q-10-38 23-33 26 3 18 31l-10-19q-12 13-27 7z" fill={agent.hair} />
      <circle cx="88" cy="101" r="2" fill="#334155" /><circle cx="99" cy="101" r="2" fill="#334155" />
      <path d="M88 112q6 3 10-1" stroke="#996a53" fill="none" strokeWidth="2" />
      {state === 'preparado' || state === 'completado' ? <g className="office-delivery"><rect x="111" y="133" width="24" height="30" rx="3" fill="var(--office-paper)" stroke={agent.color} /><path d="M116 142h13m-13 5h10m-10 5h12" stroke={agent.color} strokeWidth="2" /></g> : null}
    </g>
  </svg>
);

export const AgentOffice = () => {
  const { execution, error, loading } = useAgentExecution();
  const { session } = useAuth();
  const [cards, setCards] = useState(false);
  const [motion, setMotion] = useState(true);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResult, setRunResult] = useState('');
  const busy = execution?.estado === 'ejecutando';
  const start = async () => {
    setStarting(true); setRunError(''); setRunResult('');
    try { await runAgentAnalysis(); setRunResult('Informe guardado. Puedes revisarlo en el gabinete.'); }
    catch { setRunError('No se pudo confirmar la ejecución. Revisa el estado del equipo y las fases activas en el gabinete antes de reintentar.'); }
    finally { setStarting(false); }
  };
  return (
    <div className={`agent-office flex-1 overflow-auto p-4 md:p-8 ${motion ? '' : 'office-still'}`}>
      <div className="mx-auto max-w-6xl">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/ai-control" className="inline-flex items-center gap-2 text-[#0071e3] dark:text-brand-cyan"><ArrowLeft size={16} />Prioridades de hoy</Link>
          <Link to="/ai-control/analistas" className="text-[#0071e3] dark:text-brand-cyan">Gabinete y configuración <ArrowUpRight className="inline" size={15} /></Link>
        </nav>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#0071e3] dark:text-brand-cyan">El equipo · Five Minutes</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Oficina de analistas</h1><p className="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">Cuatro especialidades, una visión del negocio. Entra en cada escritorio para revisar su análisis.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCards(!cards)} aria-pressed={cards} className="office-control"><LayoutGrid size={16} />{cards ? 'Ver oficina' : 'Ver tarjetas'}</button>
            <button onClick={() => setMotion(!motion)} aria-pressed={!motion} className="office-control">{motion ? <Pause size={16} /> : <Play size={16} />}{motion ? 'Pausar movimiento' : 'Activar movimiento'}</button>
            {session?.user.user_metadata?.rol === 'admin' && <button disabled={starting || busy || loading || !!error} onClick={() => void start()} className="office-control bg-[#0071e3] text-white disabled:opacity-50">{starting || busy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={16} /> : <Play size={16} />}Ejecutar análisis</button>}
          </div>
        </header>
        <div className="mb-5 rounded-2xl border border-black/5 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium">{busy && !error ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none text-[#0071e3]" /> : execution?.estado === 'completada' ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={15} />}{error || (loading ? 'Conectando con el equipo…' : execution?.etapa || 'El equipo está listo. Todavía no hay una ejecución registrada.')}</p>
          {execution && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Último cambio: {new Date(execution.actualizado_en).toLocaleString('es-ES')} · {execution.informe_id ? `Informe #${execution.informe_id}` : 'Pendiente de guardar informe'}</p>}
        </div>
        {(runError || runResult) && <p className={`mb-4 rounded-xl p-3 text-sm ${runError ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} role="status">{runError || runResult}</p>}
        <section className={`${cards ? 'office-cards' : 'office-floor'} grid gap-5 md:grid-cols-2`} aria-label="Equipo de analistas">
          {agents.map(agent => {
            const state = error ? undefined : execution?.agentes[agent.id];
            return <Link key={agent.id} to={agent.id === 'ceo' ? '/ai-control/analistas#informe-ceo' : `/ai-control/analistas?agent=${agent.id}`} className={`office-station ${state === 'trabajando' ? 'office-working' : ''}`}>
              <div className="flex items-center justify-between gap-2 px-5 pt-5"><span className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">{agent.role}</span><span className={`office-badge ${state === 'error' || state === 'interrumpido' ? 'text-red-600 dark:text-red-300' : state === 'trabajando' ? 'text-[#0071e3] dark:text-brand-cyan' : 'text-slate-600 dark:text-slate-300'}`}>{state === 'trabajando' && <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" />}{state ? stateLabels[state] : error ? 'Sin conexión' : loading ? 'Conectando' : 'Disponible'}</span></div>
              {!cards && <Desk agent={agent} state={state} />}
              <div className="flex items-end justify-between gap-3 p-5"><div><h2 className="text-xl font-semibold">{agent.name}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{agent.task}</p></div><ArrowUpRight size={20} className="text-[#0071e3] dark:text-brand-cyan" /></div>
            </Link>;
          })}
        </section>
        <footer className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>Estados del servidor · actualización automática · sin llamadas IA por animación</span><span>El equipo trabaja por turnos; el CEO consolida al final.</span></footer>
      </div>
    </div>
  );
};
