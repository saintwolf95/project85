import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowUpRight, Bell, History, Mail, Volume2 } from 'lucide-react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/useTheme';
import { downloadOfficeVivaDeadInventory, getAgentExecutionHistory, getOfficeVivaData, notifyAgentProductManager, runAgentAnalysis, updateAgentDecision, updateAgentDecisionStep, updateOfficeVivaAlert } from '../services/api';
import type { AgentExecutionHistory } from '../services/api';
import OfficeViva from '../agent-office-viva/OfficeViva';
import type { AgentId as OfficeVivaAgentId, OfficeActionName, OfficeAgentState, OfficeVivaData } from '../agent-office-viva/vendor/office-viva';
import type { AgentId } from '../agent-office/model';
import { ROSTER } from '../agent-office/model';
import './AgentOffice.css';

const agentUrl = (id: AgentId) => id === 'ceo' ? '/ai-control/analistas#informe-ceo' : `/ai-control/analistas?agent=${id}&view=expediente`;
const duration = (milliseconds: number | null) => milliseconds == null ? 'En curso' : milliseconds < 60_000 ? `${Math.max(1, Math.round(milliseconds / 1000))} s` : `${Math.floor(milliseconds / 60_000)} min ${Math.round((milliseconds % 60_000) / 1000)} s`;
const errorLabel = (code: string | null) => code === 'model_error' ? 'No se pudo contactar con el modelo' : code ? 'La ejecución no pudo completarse' : '';

// Son las etapas publicadas por el flujo real en app/agents_service.py; no son una simulación de la escena.
const OFFICE_STAGES: Partial<Record<OfficeVivaAgentId, string[]>> = {
  maria: ['María redactando su análisis', 'Análisis de María preparado'],
  lucia: ['Lucía redactando su análisis', 'Análisis de Lucía preparado'],
  mattia: ['Mattia redactando su análisis', 'Análisis de Mattia preparado'],
  ceo: ['CEO consolidando episodios y decisiones', 'Consolidación preparada'],
};

const officeAgentStatus = (status: string): OfficeAgentState['status'] => {
  if (status === 'trabajando') return 'working';
  if (status === 'preparado' || status === 'completado') return 'done';
  if (status === 'error' || status === 'interrumpido') return 'error';
  return 'idle';
};

const officeAgentTask = (id: OfficeVivaAgentId, status: string, stage: string | undefined) => {
  if (status === 'trabajando') return stage || 'Análisis en curso';
  if (status === 'preparado') return 'Informe preparado';
  if (status === 'completado') return id === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado';
  if (status === 'error' || status === 'interrumpido') return 'Ejecución interrumpida';
  if (status === 'pendiente') return 'En cola';
  return 'Sin análisis en curso';
};

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
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  } catch {
    // El historial visible sigue siendo la fuente de verdad si el audio no está disponible.
  }
};

export const AgentOffice = () => {
  const { execution } = useAgentExecution();
  const { session } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResult, setRunResult] = useState('');
  const [history, setHistory] = useState<AgentExecutionHistory[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [officeData, setOfficeData] = useState<OfficeVivaData>();
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('office-sound') === 'true');
  const [browserNotifications, setBrowserNotifications] = useState(() => localStorage.getItem('office-browser-notifications') === 'true' && Notification.permission === 'granted');
  const previousRunStateRef = useRef<string | null>(null);
  const userRole = String(session?.user.app_metadata?.rol || session?.user.user_metadata?.rol || 'admin').toLowerCase();
  const canRun = userRole === 'admin';
  const readOnly = ['direccion', 'dirección'].includes(userRole);
  const officeStateSnapshot = JSON.stringify({
    stage: execution?.etapa ?? '',
    agents: execution?.agentes ?? {},
  });
  // El poll puede devolver objetos nuevos sin cambios. Mantener esta referencia evita
  // que el módulo reinicie una animación cuando el estado confirmado es el mismo.
  const officeAgents = useMemo<OfficeAgentState[]>(() => {
    const snapshot = JSON.parse(officeStateSnapshot) as { stage: string; agents: Partial<Record<OfficeVivaAgentId, string>> };
    return (['maria', 'lucia', 'mattia', 'ceo'] as OfficeVivaAgentId[]).map(id => {
      const status = snapshot.agents[id] ?? 'pendiente';
      const stage = status === 'trabajando' ? snapshot.stage : undefined;
      return { id, status: officeAgentStatus(status), stage, lastTask: officeAgentTask(id, status, stage) };
    });
  }, [officeStateSnapshot]);

  useEffect(() => {
    getAgentExecutionHistory(10)
      .then(items => { setHistory(items); setHistoryError(''); })
      .catch(() => setHistoryError('No se pudo cargar el historial de ejecuciones.'));
  }, [execution?.run_id, execution?.estado]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const pollOfficeData = async () => {
      try {
        const data = await getOfficeVivaData();
        if (!cancelled) setOfficeData(data);
      } catch {
        if (!cancelled) setRunError('No se pudo actualizar el Centro de mando de la oficina.');
      } finally {
        if (!cancelled) timer = setTimeout(pollOfficeData, 30_000);
      }
    };
    void pollOfficeData();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

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

  const start = async () => {
    if (!canRun) return;
    setStarting(true);
    setRunError('');
    setRunResult('');
    try {
      await runAgentAnalysis();
      setRunResult('El análisis se ha iniciado. La oficina mostrará el estado confirmado por el servidor.');
    } catch {
      setRunError('No se pudo confirmar la ejecución. Revisa el estado del equipo y las fases activas en el gabinete antes de reintentar.');
    } finally {
      setStarting(false);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('office-sound', String(next));
    if (next) playTone(520);
  };

  const toggleBrowserNotifications = async () => {
    if (browserNotifications) {
      setBrowserNotifications(false);
      localStorage.setItem('office-browser-notifications', 'false');
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    setBrowserNotifications(enabled);
    localStorage.setItem('office-browser-notifications', String(enabled));
    if (!enabled) setHistoryError('El navegador no concedió permiso para mostrar avisos.');
  };

  const onOfficeAction = async (name: OfficeActionName, payload: Record<string, unknown>) => {
    if (name === 'alert.update') {
      const patch = (payload.patch || {}) as { status?: 'abierta' | 'reconocida' | 'resuelta'; owner?: string; feedback?: 'util' | 'no_util' | null };
      await updateOfficeVivaAlert(String(payload.id), patch);
    } else if (name === 'decision.update') {
      const patch = (payload.patch || {}) as Record<string, unknown>;
      const status = patch.status === 'hecha' ? 'completada' : patch.status === 'rechazada' ? 'descartada' : patch.status;
      await updateAgentDecision(Number(payload.id), { estado: status as 'propuesta' | 'aceptada' | 'en_curso' | 'completada' | 'descartada' | undefined, responsable: typeof patch.owner === 'string' ? patch.owner : undefined });
    } else if (name === 'decision.step') {
      const decision = officeData?.decisions?.find(item => item.id === String(payload.id));
      const step = decision?.steps[Number(payload.index)] as ({ step_id?: number; done: boolean } | undefined);
      if (!step?.step_id) throw new Error('La decisión no tiene un paso persistido.');
      await updateAgentDecisionStep(String(payload.id), step.step_id, Boolean(payload.done));
    } else if (name === 'pm.notify') {
      await notifyAgentProductManager(String(payload.pmId));
    } else if (name === 'inventory.export') {
      await downloadOfficeVivaDeadInventory();
    }
    setOfficeData(await getOfficeVivaData());
  };

  return <div className="agent-office">
    <div className="agent-office-shell">
      <header className="agent-office-heading">
        <div><p>Equipo de análisis · Five Minutes</p><h1>Oficina de analistas</h1></div>
        <nav aria-label="Navegación de Control IA"><Link to="/ai-control"><ArrowLeft size={16} />Prioridades de hoy</Link><Link to="/ai-control/analistas">Gabinete <ArrowUpRight size={15} /></Link>{canRun && <Link to="/ai-control/avisos"><Mail size={15} />Avisos PM</Link>}</nav>
      </header>
      {(runError || runResult) && <p className={`agent-office-status ${runError ? 'is-error' : 'is-success'}`} role="status">{runError || runResult}</p>}
      <section className="agent-office-viva-stage" aria-label="Oficina isométrica de agentes">
        <OfficeViva
          className="agent-office-viva"
          theme={theme === 'dark' ? 'dark' : 'light'}
          canRun={canRun && !starting}
          readOnly={readOnly}
          agents={officeAgents}
          stages={OFFICE_STAGES}
          data={officeData}
          onRunRequested={() => start()}
          onOpenExpediente={(agentId) => navigate(agentUrl(agentId))}
          onOpenChat={(agentId) => navigate(`/ai-control/analistas?agent=${agentId}&view=chat`)}
          onOpenInforme={() => navigate(agentUrl('ceo'))}
          onAction={onOfficeAction}
          onError={() => setRunError('La oficina no pudo completar la acción solicitada. Revisa el Gabinete de Analistas IA.')}
        />
      </section>
      <section className="office-history" aria-labelledby="office-history-title">
        <header className="office-history-header"><div><span className="office-scene-eyebrow">Trazabilidad</span><h2 id="office-history-title"><History size={19} /> Historial de ejecuciones</h2></div><div className="office-preferences" aria-label="Preferencias de avisos">
          <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} title="Aviso sonoro"><Volume2 size={16} />Sonido <span>{soundEnabled ? 'Sí' : 'No'}</span></button>
          <button type="button" onClick={() => void toggleBrowserNotifications()} aria-pressed={browserNotifications} title="Aviso del navegador"><Bell size={16} />Navegador <span>{browserNotifications ? 'Sí' : 'No'}</span></button>
        </div></header>
        {historyError && <p className="office-history-error" role="alert"><AlertTriangle size={16} />{historyError}</p>}
        {history.length ? <div className="office-history-list">{history.map(run => <details key={run.run_id} className="office-history-run"><summary><span className="office-history-status" data-state={run.estado}>{run.estado}</span><strong>{new Date(run.inicio).toLocaleString('es-ES')}</strong><span>{duration(run.duracion_ms)}</span><span className="office-history-stage">{errorLabel(run.error_code) || run.etapa_final}</span></summary><div className="office-history-members">{run.agentes.map(agent => <div key={agent.agent_name}><strong>{ROSTER.find(item => item.id === agent.agent_name)?.name || agent.agent_name}</strong><span data-state={agent.estado}>{agent.estado}</span><span>{duration(agent.duracion_ms)}</span><small>{errorLabel(agent.error_code) || agent.etapa_final}</small></div>)}</div></details>)}</div> : !historyError && <p className="office-history-empty">Todavía no hay ejecuciones registradas en el historial.</p>}
      </section>
    </div>
  </div>;
};
