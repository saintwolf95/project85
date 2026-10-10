import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Circle, Loader2, Pause, Play, WifiOff } from 'lucide-react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useAuth } from '../context/useAuth';
import { runAgentAnalysis } from '../services/api';
import { OfficeCanvas } from '../agent-office/OfficeCanvas';
import { ROSTER } from '../agent-office/model';
import type { AgentId } from '../agent-office/model';
import { deliveredCount, useOffice } from '../agent-office/store';
import './AgentOffice.css';

const agentUrl = (id: AgentId) => id === 'ceo' ? '/ai-control/analistas#informe-ceo' : `/ai-control/analistas?agent=${id}`;

export const AgentOffice = () => {
  const { execution, error, loading, connected } = useAgentExecution();
  const { session } = useAuth();
  const navigate = useNavigate();
  const sync = useOffice(state => state.sync);
  const advance = useOffice(state => state.advance);
  const resetAmbient = useOffice(state => state.resetAmbient);
  const real = useOffice(state => state.real);
  const delivered = useOffice(deliveredCount);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResult, setRunResult] = useState('');
  const busy = connected && execution?.estado === 'ejecutando';

  // Sin confirmación del servidor, la escena no aparenta trabajo en tiempo real.
  useEffect(() => { sync(connected ? execution : null); }, [connected, execution, sync]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (connected) advance(Date.now()); }, 1000);
    const visible = () => { if (connected && !document.hidden) resetAmbient(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [advance, connected, resetAmbient]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const start = async () => {
    setStarting(true); setRunError(''); setRunResult('');
    try { await runAgentAnalysis(); setRunResult('Análisis finalizado. Puedes revisar el informe en el gabinete.'); }
    catch { setRunError('No se pudo confirmar la ejecución. Revisa el estado del equipo y las fases activas en el gabinete antes de reintentar.'); }
    finally { setStarting(false); }
  };

  return <div className="agent-office flex-1 overflow-auto p-4 md:p-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/ai-control" className="inline-flex items-center gap-2 text-[#0071e3] dark:text-brand-cyan"><ArrowLeft size={16} />Prioridades de hoy</Link>
        <Link to="/ai-control/analistas" className="text-[#0071e3] dark:text-brand-cyan">Gabinete y configuración <ArrowUpRight className="inline" size={15} /></Link>
      </nav>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#0071e3] dark:text-brand-cyan">El equipo · Five Minutes</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Oficina de analistas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Una sala viva. El movimiento ambiental es ilustrativo; los estados de trabajo proceden del servidor.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPaused(!paused)} aria-pressed={paused} className="office-control">{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Activar movimiento' : 'Reducir movimiento'}</button>
          {session?.user.user_metadata?.rol === 'admin' && <button disabled={starting || busy || loading || !!error} onClick={() => void start()} className="office-control office-control-primary disabled:opacity-50">{starting || busy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={16} /> : <Play size={16} />}Iniciar análisis</button>}
        </div>
      </header>
      <div className="office-hud" role="status" aria-live="polite">
        <div className="office-hud-main">{error ? <WifiOff size={17} className="text-amber-600" /> : busy ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none text-[#0071e3]" /> : execution?.estado === 'completada' ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={15} />}
          <span>{error || (loading ? 'Conectando con el equipo…' : execution?.etapa || 'El equipo está listo. Todavía no hay una ejecución registrada.')}</span></div>
        <div className="office-hud-meta"><span>Informes entregados <strong>{connected ? `${delivered} de 3` : '—'}</strong></span>{execution && <span>{connected ? 'Actualizado' : 'Último estado confirmado'} {new Date(execution.actualizado_en).toLocaleString('es-ES')}</span>}</div>
      </div>
      {(runError || runResult) && <p className={`mb-4 rounded-xl p-3 text-sm ${runError ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} role="status">{runError || runResult}</p>}
      <section className="office-scene-panel" aria-label="Oficina isométrica de agentes">
        <div className="office-scene-heading"><div><span className="office-scene-eyebrow">Sala de trabajo</span><h2>{connected ? 'Equipo en directo' : 'Estado no confirmado'}</h2></div><span className={`office-scene-key ${connected ? '' : 'office-scene-key-offline'}`}><i />{connected ? 'Trabajo real = monitor azul' : 'Monitores neutralizados hasta reconectar'}</span></div>
        <OfficeCanvas dark={dark} reduced={reduced || paused} onAgentClick={id => navigate(agentUrl(id))} />
      </section>
      <section className="office-roster" aria-label="Estados reales de los agentes">
        {ROSTER.map(agent => <Link key={agent.id} to={agentUrl(agent.id)} className="office-agent-card">
          <div><span className="office-agent-role">{agent.role}</span><h3>{agent.name}</h3></div>
          <div className="office-agent-state" data-state={connected ? real[agent.id].status : 'desconectado'}>{connected ? real[agent.id].stage : 'Estado no confirmado'}<ArrowUpRight size={16} aria-hidden="true" /></div>
        </Link>)}
      </section>
      <footer className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>Estados del servidor · actualización automática · sin llamadas IA por animación</span><span>Los bocadillos ambientales no muestran clientes, SKU ni importes.</span></footer>
    </div>
  </div>;
};
