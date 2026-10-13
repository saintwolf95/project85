import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Bot, BrainCircuit, CheckCircle2, Circle, ClipboardCheck, FileText, History, Lightbulb, Loader2, MessageSquare, Moon, Play, ShieldCheck, Sparkles, Sun, Users, Volume2, WifiOff, X } from 'lucide-react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useAuth } from '../context/useAuth';
import { getAgentExecutionHistory, getLatestAgentInsight, runAgentAnalysis } from '../services/api';
import type { AgentExecutionHistory, AgentInsight } from '../services/api';
import { OfficeVivaCanvas } from '../agent-office-viva/OfficeVivaCanvas';
import type { OfficeVivaCanvasHandle } from '../agent-office-viva/OfficeVivaCanvas';
import { ROSTER } from '../agent-office/model';
import type { AgentId } from '../agent-office/model';
import { deliveredCount, useOffice } from '../agent-office/store';
import { AGENT_PROFILES } from '../content/agentProfiles';
import './AgentOffice.css';

const agentUrl = (id: AgentId) => id === 'ceo' ? '/ai-control/analistas#informe-ceo' : `/ai-control/analistas?agent=${id}&view=expediente`;
const agentChatUrl = (id: Exclude<AgentId, 'ceo'>) => `/ai-control/analistas?agent=${id}&view=chat`;
const GENERIC_TASKS: Record<AgentId, string> = {
  maria: 'Revisión de disponibilidad, cobertura y capital inmovilizado',
  lucia: 'Revisión de ventas, clientes y oportunidades comerciales',
  mattia: 'Revisión de MG, MGD y exposición económica',
  ceo: 'Consolidación de los informes verificados del equipo',
};
const AGENT_PORTRAITS: Record<AgentId, string> = {
  maria: '/assets/agents/maria_work.png',
  lucia: '/assets/agents/lucia_work.png',
  mattia: '/assets/agents/fin_work.png',
  ceo: '/assets/agents/ceo_work.png',
};
type MeetingState = { type: 'executive' } | { type: 'agent'; agentId: Exclude<AgentId, 'ceo'> } | null;

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
  const { execution, error, loading, connected } = useAgentExecution();
  const { session } = useAuth();
  const sync = useOffice(state => state.sync);
  const real = useOffice(state => state.real);
  const delivered = useOffice(deliveredCount);
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
  const [meeting, setMeeting] = useState<MeetingState>(null);
  const officeCanvasRef = useRef<OfficeVivaCanvasHandle>(null);
  const profileRef = useRef<HTMLElement>(null);
  const closeProfileRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousRunStateRef = useRef<string | null>(null);
  const busy = connected && execution?.estado === 'ejecutando';
  const userRole = String(session?.user.app_metadata?.rol || session?.user.user_metadata?.rol || 'user').toLowerCase();
  const canRun = userRole === 'admin';
  const canViewFindings = ['admin', 'user', 'direccion', 'dirección', 'manager'].includes(userRole);
  const selectedProfile = ROSTER.find(agent => agent.id === selectedAgent);
  const selectedDefinition = selectedAgent ? AGENT_PROFILES[selectedAgent] : null;

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
  useEffect(() => {
    if (!selectedAgent) return;
    closeProfileRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedAgent(null);
        officeCanvasRef.current?.endMeeting();
        setMeeting(current => current?.type === 'agent' ? null : current);
        return;
      }
      if (event.key !== 'Tab' || !profileRef.current) return;
      const controls = [...profileRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [selectedAgent]);

  const openProfile = useCallback((id: AgentId) => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedAgent(id);
  }, []);

  const endMeeting = useCallback(() => {
    officeCanvasRef.current?.endMeeting();
    setMeeting(null);
  }, []);
  const closeProfile = useCallback(() => {
    setSelectedAgent(null);
    if (meeting?.type === 'agent') endMeeting();
  }, [endMeeting, meeting]);
  const startExecutiveMeeting = () => {
    officeCanvasRef.current?.startExecutiveMeeting();
    setMeeting({ type: 'executive' });
    setSelectedAgent(null);
  };
  const startAgentMeeting = (agentId: Exclude<AgentId, 'ceo'>) => {
    officeCanvasRef.current?.startAgentMeeting(agentId);
    setMeeting({ type: 'agent', agentId });
    openProfile(agentId);
  };

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
      <header className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#0071e3] dark:text-brand-cyan">El equipo · Five Minutes</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Oficina de analistas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Una sala viva. El movimiento ambiental es ilustrativo; los estados de trabajo proceden del servidor.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={toggleDayNight} aria-pressed={dayNight} className="office-control office-control-icon" title={dayNight ? 'Cambiar a luz fija' : 'Activar ciclo día y noche'}>{dayNight ? <Moon size={17} /> : <Sun size={17} />}<span>{dayNight ? 'Día y noche' : 'Luz fija'}</span></button>
          {canRun && <button disabled={starting || busy || loading || !!error} onClick={() => void start()} className="office-control office-control-primary disabled:opacity-50">{starting || busy ? <Loader2 className="animate-spin motion-reduce:animate-none" size={16} /> : <Play size={16} />}Iniciar análisis</button>}
        </div>
      </header>
      <div className="office-hud" role="status" aria-live="polite">
        <div className="office-hud-main">{error ? <WifiOff size={17} className="text-amber-600" /> : busy ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none text-[#0071e3]" /> : execution?.estado === 'completada' ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={15} />}
          <span>{error || (loading ? 'Conectando con el equipo…' : execution?.etapa || 'El equipo está listo. Todavía no hay una ejecución registrada.')}</span></div>
        <div className="office-hud-meta"><span>Informes entregados <strong>{connected ? `${delivered} de 3` : '—'}</strong></span>{execution && <span>{connected ? 'Actualizado' : 'Último estado confirmado'} {new Date(execution.actualizado_en).toLocaleString('es-ES')}</span>}</div>
      </div>
      <p className="office-activity-line"><span>Ahora mismo en la oficina</span>{!connected ? 'Esperando confirmación del servidor.' : ROSTER.filter(agent => real[agent.id].working).map(agent => `${agent.name}: ${real[agent.id].stage}`).join(' · ') || 'El equipo está en sus puestos, a la espera de una nueva ejecución.'}</p>
      {connected && real.ceo.delivered && <Link to={agentUrl('ceo')} className="office-report-ready" role="status"><CheckCircle2 size={18} /><span><strong>Informe ejecutivo listo</strong><small>La consolidación del equipo está disponible para revisión.</small></span><ArrowRight size={17} /></Link>}
      {(runError || runResult) && <p className={`mb-4 rounded-xl p-3 text-sm ${runError ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`} role="status">{runError || runResult}</p>}
      <section className="office-scene-panel" aria-label="Oficina isométrica de agentes">
        <div className="office-scene-heading"><div><span className="office-scene-eyebrow">Sala de trabajo</span><h2>{connected ? 'Equipo en directo' : 'Estado no confirmado'}</h2></div><span className={`office-scene-key ${connected ? '' : 'office-scene-key-offline'}`}><i />{connected ? 'Trabajo real = monitor azul' : 'Monitores neutralizados hasta reconectar'}</span></div>
        <div className="office-meeting-actions" aria-label="Reuniones de la oficina">
          <button type="button" onClick={startExecutiveMeeting} className="office-control office-meeting-primary"><Users size={16} />Reunión ejecutiva</button>
          {ROSTER.filter(agent => agent.id !== 'ceo').map(agent => <button key={agent.id} type="button" onClick={() => startAgentMeeting(agent.id as Exclude<AgentId, 'ceo'>)} className="office-control"><MessageSquare size={15} />Reunión con {agent.name}</button>)}
          {meeting && <button type="button" onClick={endMeeting} className="office-control office-meeting-end">Volver a la oficina</button>}
        </div>
        <OfficeVivaCanvas ref={officeCanvasRef} dayNight={dayNight} connected={connected} execution={execution} onAgentClick={openProfile} />
      </section>
      {meeting?.type === 'executive' && <section className="office-meeting-summary" aria-live="polite" aria-labelledby="executive-meeting-title">
        <header><div><span className="office-scene-eyebrow">Reunión en curso</span><h2 id="executive-meeting-title">Reunión ejecutiva</h2><p>El equipo comparte sus conclusiones; el CEO consolida las prioridades para decisión.</p></div><button type="button" onClick={endMeeting} className="office-profile-close" aria-label="Cerrar reunión ejecutiva"><X size={18} /></button></header>
        <div className="office-meeting-findings">
          {ROSTER.filter(agent => agent.id !== 'ceo').map(agent => <article key={agent.id}><span>{agent.name} · {agent.role}</span><p>{canViewFindings ? findingFor(latestInsight, agent.id) || 'Sin hallazgo publicado todavía.' : 'Hallazgo disponible para los roles autorizados.'}</p></article>)}
          <article className="office-meeting-ceo"><span>CEO · Conclusión ejecutiva</span><p>{canViewFindings ? findingFor(latestInsight, 'ceo') || 'El CEO preparará la consolidación cuando existan informes del equipo.' : 'Conclusión disponible para los roles autorizados.'}</p></article>
        </div>
      </section>}
      <section className="office-roster" aria-label="Estados reales de los agentes">
        {ROSTER.map(agent => <button key={agent.id} type="button" onClick={() => openProfile(agent.id)} aria-haspopup="dialog" aria-label={`Abrir ficha rápida de ${agent.name}`} className="office-agent-card">
          <div><span className="office-agent-role">{agent.role}</span><h3>{agent.name}</h3></div>
          <div className="office-agent-state" data-state={connected ? real[agent.id].status : 'desconectado'}>{connected ? real[agent.id].stage : 'Estado no confirmado'}<ArrowUpRight size={16} aria-hidden="true" /></div>
        </button>)}
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
    {selectedAgent && selectedProfile && selectedDefinition && <div className="office-profile-backdrop">
      <button type="button" className="office-profile-dismiss-layer" onClick={closeProfile} aria-label={`Cerrar ficha de ${selectedProfile.name}`} />
      <aside ref={profileRef} className="office-profile" role="dialog" aria-modal="true" aria-labelledby="office-profile-title" aria-describedby="office-profile-description">
        <header className="office-profile-header">
          <div><span className="office-scene-eyebrow">{meeting?.type === 'agent' && meeting.agentId === selectedProfile.id ? 'Reunión individual' : 'Perfil del agente IA'}</span><h2 id="office-profile-title">{selectedProfile.name} · {selectedProfile.role}</h2></div>
          <button ref={closeProfileRef} type="button" onClick={closeProfile} className="office-profile-close" aria-label={`Cerrar ficha de ${selectedProfile.name}`}><X size={19} /></button>
        </header>
        <div className="office-profile-body">
          <section className="office-profile-hero" aria-label={`Identidad de ${selectedProfile.name}`}>
            <div className="office-profile-portrait"><img src={AGENT_PORTRAITS[selectedAgent]} alt="" /></div>
            <div className="office-profile-identity">
              <p id="office-profile-description">{selectedDefinition.purpose}</p>
              <div className="office-profile-model"><Bot size={15} /><span>{selectedDefinition.model}</span></div>
              <span className="office-profile-status" data-state={connected ? real[selectedAgent].status : 'desconectado'}>{connected ? real[selectedAgent].stage : 'Estado no confirmado'}</span>
            </div>
          </section>
          <div className="office-profile-grid">
            <section className="office-profile-section office-profile-section-span">
              <h3><BrainCircuit size={16} />Cómo trabaja</h3>
              <p>{selectedDefinition.approach}</p>
              <p className="office-profile-model-use">{selectedDefinition.modelUse}</p>
            </section>
            <section className="office-profile-section">
              <h3><ClipboardCheck size={16} />Ahora</h3>
              <dl className="office-profile-facts">
                <div><dt>Etapa</dt><dd>{connected ? execution?.etapa || 'Sin ejecución registrada' : 'Esperando reconexión'}</dd></div>
                <div><dt>Última actualización</dt><dd>{execution ? new Date(execution.actualizado_en).toLocaleString('es-ES') : 'Sin datos'}</dd></div>
                <div><dt>Tarea</dt><dd>{connected && real[selectedAgent].status !== 'inactivo' ? GENERIC_TASKS[selectedAgent] : 'Sin tarea activa confirmada'}</dd></div>
              </dl>
            </section>
            <section className="office-profile-section">
              <h3><Sparkles size={16} />Qué analiza</h3>
              <ul className="office-profile-list">{selectedDefinition.analyses.map(item => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="office-profile-section">
              <h3><ShieldCheck size={16} />Controles</h3>
              <ul className="office-profile-list">{selectedDefinition.checks.map(item => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="office-profile-section office-profile-section-span">
              <h3><Lightbulb size={16} />Fórmulas y prioridad</h3>
              <ul className="office-profile-list office-profile-formulas">{selectedDefinition.formulas.map(item => <li key={item}>{item}</li>)}</ul>
              <p className="office-profile-priority"><strong>Prioridad:</strong> {selectedDefinition.priority}</p>
            </section>
          </div>
          {canViewFindings && <section className="office-profile-finding" aria-labelledby="office-profile-finding-title">
            <h3 id="office-profile-finding-title"><AlertTriangle size={16} />Hallazgo principal verificado</h3>
            <p>{findingFor(latestInsight, selectedAgent) || 'Todavía no hay un hallazgo publicado para este agente.'}</p>
            {latestInsight && <span>Informe del {new Date(latestInsight.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </section>}
        </div>
        <footer className="office-profile-actions">
          {selectedAgent === 'ceo' ? <Link to={agentUrl('ceo')} className="office-profile-primary"><FileText size={16} />Ver informe ejecutivo<ArrowRight size={15} /></Link> : <>
            <Link to={agentUrl(selectedAgent)} className="office-profile-secondary"><FileText size={16} />Ver expediente</Link>
            <Link to={agentChatUrl(selectedAgent)} className="office-profile-primary"><MessageSquare size={16} />Abrir chat<ArrowRight size={15} /></Link>
          </>}
        </footer>
      </aside>
    </div>}
  </div>;
};
