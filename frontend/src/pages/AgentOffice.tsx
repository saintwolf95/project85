import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Bell, History, Volume2 } from 'lucide-react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { getAgentExecutionHistory, getLatestAgentInsight, runAgentAnalysis } from '../services/api';
import type { AgentExecutionHistory, AgentInsight } from '../services/api';
import { OfficeVivaCanvas } from '../agent-office-viva/OfficeVivaCanvas';
import type { OfficeVivaCanvasHandle } from '../agent-office-viva/OfficeVivaCanvas';
import type { OfficeEngineSnapshot } from '../agent-office-viva/api';
import { AgentFicha, OfficeControls, OfficeTopBar, TeamCards } from '../agent-office-viva/hud/OfficeHud';
import type { OfficeAgentView } from '../agent-office-viva/hud/OfficeHud';
import { nunito, pixel } from '../agent-office-viva/hud/fonts';
import hud from '../agent-office-viva/hud/OfficeHud.module.css';
import { ROSTER } from '../agent-office/model';
import type { AgentId } from '../agent-office/model';
import { useOffice } from '../agent-office/store';
import './AgentOffice.css';

const agentUrl = (id: AgentId) => id === 'ceo' ? '/ai-control/analistas#informe-ceo' : `/ai-control/analistas?agent=${id}&view=expediente`;
const GENERIC_TASKS: Record<AgentId, string> = {
  maria: 'Revisión de disponibilidad, cobertura y capital inmovilizado',
  lucia: 'Revisión de ventas, clientes y oportunidades comerciales',
  mattia: 'Revisión de MG, MGD y exposición económica',
  ceo: 'Consolidación de los informes verificados del equipo',
};

const summarizeMarkdown = (markdown?: string) => {
  if (!markdown) return '';
  const line = markdown.split(/\r?\n/).map(item => item.trim()).find(item => item && !item.startsWith('#') && !item.startsWith('|') && !/^[-=:]+$/.test(item));
  if (!line) return '';
  const clean = line.replace(/^[-*+]\s+/, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > 260 ? `${clean.slice(0, 257).trimEnd()}…` : clean;
};

const findingFor = (insight: AgentInsight | null, id: AgentId) => {
  if (!insight) return '';
  const value = id === 'ceo' ? insight.fase2_ceo_markdown : insight[`fase1_${id}_md` as keyof AgentInsight];
  return summarizeMarkdown(typeof value === 'string' ? value : undefined);
};
const duration = (milliseconds: number | null) => milliseconds == null ? 'En curso' : milliseconds < 60_000 ? `${Math.max(1, Math.round(milliseconds / 1000))} s` : `${Math.floor(milliseconds / 60_000)} min ${Math.round((milliseconds % 60_000) / 1000)} s`;
const errorLabel = (code: string | null) => code === 'model_error' ? 'No se pudo contactar con el modelo' : code ? 'La ejecución no pudo completarse' : '';
const playTone = (frequency: number) => {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => void context.close();
    oscillator.start(); oscillator.stop(context.currentTime + 0.25);
  } catch { /* El historial visible sigue siendo la fuente de verdad si el audio no está disponible. */ }
};

export const AgentOffice = () => {
  const { execution, loading, connected } = useAgentExecution();
  const { session } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const sync = useOffice(state => state.sync);
  const [dayNight, setDayNight] = useState(() => localStorage.getItem('office-day-night') !== 'false');
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResult, setRunResult] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [latestInsight, setLatestInsight] = useState<AgentInsight | null>(null);
  const [history, setHistory] = useState<AgentExecutionHistory[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('office-sound') === 'true');
  const [browserNotifications, setBrowserNotifications] = useState(() => localStorage.getItem('office-browser-notifications') === 'true' && Notification.permission === 'granted');
  const [hudSnapshot, setHudSnapshot] = useState<OfficeEngineSnapshot | null>(null);
  const [portraits, setPortraits] = useState<Partial<Record<AgentId, string>>>({});
  const officeCanvasRef = useRef<OfficeVivaCanvasHandle>(null);
  const previousRunStateRef = useRef<string | null>(null);
  const busy = connected && execution?.estado === 'ejecutando';
  const userRole = String(session?.user.app_metadata?.rol || session?.user.user_metadata?.rol || 'admin').toLowerCase();
  const canRun = userRole === 'admin';
  const canViewFindings = ['admin', 'user', 'direccion', 'dirección', 'manager'].includes(userRole);

  const hudAgents = useMemo<OfficeAgentView[]>(() => ROSTER.map((agent) => {
    const current = hudSnapshot?.agents.find((item) => item.id === agent.id);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: connected ? current?.status ?? 'idle' : 'idle',
      stage: connected ? current?.stage ?? '' : 'Estado no confirmado',
      progress: connected ? current?.progress ?? 0 : 0,
      ambient: connected ? current?.ambient ?? 'En su puesto' : 'Esperando confirmación del servidor',
      portrait: portraits[agent.id] || '',
      lastTask: GENERIC_TASKS[agent.id],
      finding: canViewFindings ? findingFor(latestInsight, agent.id) : null,
      updatedAt: execution ? new Date(execution.actualizado_en) : null,
    };
  }), [canViewFindings, connected, execution, hudSnapshot, latestInsight, portraits]);

  useEffect(() => {
    if (!hudSnapshot || !officeCanvasRef.current || Object.keys(portraits).length === ROSTER.length) return;
    setPortraits(Object.fromEntries(ROSTER.map((agent) => [agent.id, officeCanvasRef.current?.portrait(agent.id, 64) || ''])));
  }, [hudSnapshot, portraits]);

  // Sin confirmación del servidor, la escena no aparenta trabajo en tiempo real.
  useEffect(() => { sync(connected ? execution : null); }, [connected, execution, sync]);
  useEffect(() => { getLatestAgentInsight().then(setLatestInsight).catch(() => setLatestInsight(null)); }, []);
  useEffect(() => {
    getAgentExecutionHistory(10).then(items => { setHistory(items); setHistoryError(''); }).catch(() => setHistoryError('No se pudo cargar el historial de ejecuciones.'));
  }, [execution?.run_id, execution?.estado]);
  useEffect(() => {
    if (!execution) return;
    const fingerprint = `${execution.run_id}:${execution.estado}`;
    const previous = previousRunStateRef.current;
    previousRunStateRef.current = fingerprint;
    if (!previous || previous === fingerprint || !['completada', 'error', 'interrumpida'].includes(execution.estado)) return;
    const message = execution.estado === 'completada' ? 'El análisis del equipo ha finalizado.' : 'El análisis necesita atención.';
    if (soundEnabled) playTone(execution.estado === 'completada' ? 660 : 330);
    if (browserNotifications && Notification.permission === 'granted') new Notification('Oficina de analistas', { body: message });
  }, [browserNotifications, execution, soundEnabled]);
  const openProfile = useCallback((id: AgentId) => {
    setSelectedAgent(id);
  }, []);
  const closeProfile = useCallback(() => {
    setSelectedAgent(null);
    officeCanvasRef.current?.select(null);
  }, []);
  const start = async () => {
    setStarting(true); setRunError(''); setRunResult('');
    try { await runAgentAnalysis(); setRunResult('Análisis finalizado. Puedes revisar el informe en el gabinete.'); }
    catch { setRunError('No se pudo confirmar la ejecución. Revisa el estado del equipo y las fases activas en el gabinete antes de reintentar.'); }
    finally { setStarting(false); }
  };
  const toggleSound = () => {
    const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem('office-sound', String(next));
    if (next) playTone(520);
  };
  const toggleDayNight = () => {
    setDayNight(current => {
      const next = !current;
      localStorage.setItem('office-day-night', String(next));
      return next;
    });
  };
  const toggleBrowserNotifications = async () => {
    if (browserNotifications) { setBrowserNotifications(false); localStorage.setItem('office-browser-notifications', 'false'); return; }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted'; setBrowserNotifications(enabled); localStorage.setItem('office-browser-notifications', String(enabled));
    if (!enabled) setHistoryError('El navegador no concedió permiso para mostrar avisos.');
  };

  return <div className="agent-office flex-1 overflow-auto p-4 md:p-8">
    <div className="mx-auto max-w-7xl">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/ai-control" className="inline-flex items-center gap-2 text-[#0071e3] dark:text-brand-cyan"><ArrowLeft size={16} />Prioridades de hoy</Link>
        <Link to="/ai-control/analistas" className="text-[#0071e3] dark:text-brand-cyan">Gabinete y configuración <ArrowUpRight className="inline" size={15} /></Link>
      </nav>
      <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#0071e3] dark:text-brand-cyan">El equipo · Five Minutes</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Oficina de analistas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Una sala viva. El movimiento ambiental es ilustrativo; los estados de trabajo proceden del servidor.</p></header>
      {(runError || runResult) && <p className={`mb-4 rounded-xl p-3 text-sm ${runError ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} role="status">{runError || runResult}</p>}
      <section className={`${hud.root} ${pixel.variable} ${nunito.variable} office-hud-prototype`} data-theme={theme} aria-label="Oficina isométrica de agentes">
        <OfficeVivaCanvas
          ref={officeCanvasRef}
          className={hud.canvas}
          dayNight={dayNight}
          connected={connected}
          execution={execution}
          onSnapshot={setHudSnapshot}
          onAgentClick={(agentId) => agentId ? openProfile(agentId) : closeProfile()}
        />
        <OfficeTopBar hour={hudSnapshot?.hour ?? 9} />
        <OfficeControls canRun={canRun} running={starting || busy || loading} dayNight={dayNight} onToggleDayNight={toggleDayNight} onRun={() => void start()} />
        <TeamCards agents={hudAgents} selectedId={selectedAgent} onSelect={(agentId) => {
          officeCanvasRef.current?.select(agentId as AgentId | null);
          if (agentId) openProfile(agentId as AgentId); else closeProfile();
        }} />
        {selectedAgent && <AgentFicha
          agent={hudAgents.find((agent) => agent.id === selectedAgent)!}
          onClose={closeProfile}
          onOpenExpediente={(agentId) => { navigate(agentUrl(agentId as AgentId)); }}
          onOpenChat={(agentId) => { navigate(`/ai-control/analistas?agent=${agentId}&view=chat`); }}
          onOpenInforme={() => { navigate(agentUrl('ceo')); }}
        />}
      </section>
      <section className="office-history" aria-labelledby="office-history-title">
        <header className="office-history-header"><div><span className="office-scene-eyebrow">Trazabilidad</span><h2 id="office-history-title"><History size={19} /> Historial de ejecuciones</h2></div><div className="office-preferences" aria-label="Preferencias de avisos">
          <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} title="Aviso sonoro"><Volume2 size={16} />Sonido <span>{soundEnabled ? 'Sí' : 'No'}</span></button>
          <button type="button" onClick={() => void toggleBrowserNotifications()} aria-pressed={browserNotifications} title="Aviso del navegador"><Bell size={16} />Navegador <span>{browserNotifications ? 'Sí' : 'No'}</span></button>
        </div></header>
        {historyError && <p className="office-history-error" role="alert"><AlertTriangle size={16} />{historyError}</p>}
        {history.length ? <div className="office-history-list">{history.map(run => <details key={run.run_id} className="office-history-run"><summary><span className="office-history-status" data-state={run.estado}>{run.estado}</span><strong>{new Date(run.inicio).toLocaleString('es-ES')}</strong><span>{duration(run.duracion_ms)}</span><span className="office-history-stage">{errorLabel(run.error_code) || run.etapa_final}</span></summary><div className="office-history-members">{run.agentes.map(agent => <div key={agent.agent_name}><strong>{ROSTER.find(item => item.id === agent.agent_name)?.name || agent.agent_name}</strong><span data-state={agent.estado}>{agent.estado}</span><span>{duration(agent.duracion_ms)}</span><small>{errorLabel(agent.error_code) || agent.etapa_final}</small></div>)}</div></details>)}</div> : !historyError && <p className="office-history-empty">Todavía no hay ejecuciones registradas en el historial.</p>}
      </section>
      <footer className="mt-5 flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>Estados del servidor · actualización automática · sin llamadas IA por animación</span><span>Los bocadillos ambientales no muestran clientes, SKU ni importes.</span></footer>
    </div>
  </div>;
};
