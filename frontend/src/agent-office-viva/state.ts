import type { AgentExecution, AgentWorkState } from '../services/api';
import type { OfficeAgentId, OfficeEvent, OfficeSnapshot } from './api';

const AGENTS: readonly OfficeAgentId[] = ['maria', 'lucia', 'mattia', 'ceo'];

const readableStage = (agentId: OfficeAgentId, state: AgentWorkState): string => {
  if (state === 'trabajando') {
    return agentId === 'maria' ? 'Analizando inventario'
      : agentId === 'lucia' ? 'Analizando ventas'
        : agentId === 'mattia' ? 'Analizando finanzas'
          : 'Consolidando informes';
  }
  if (state === 'preparado') return 'Informe preparado';
  if (state === 'completado') return agentId === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado';
  if (state === 'error' || state === 'interrumpido') return 'Revisión necesaria';
  if (state === 'pendiente') return 'En cola';
  return 'En espera';
};

const officeStatus = (state: AgentWorkState): OfficeSnapshot['agents'][OfficeAgentId]['status'] => {
  if (state === 'trabajando') return 'working';
  if (state === 'preparado' || state === 'completado') return 'done';
  if (state === 'error' || state === 'interrumpido') return 'error';
  return 'idle';
};

export type ExecutionSnapshot = OfficeSnapshot & { runId: string | null };

export function snapshotFromExecution(execution: AgentExecution | null): ExecutionSnapshot {
  return {
    runId: execution?.run_id ?? null,
    agents: Object.fromEntries(AGENTS.map(agentId => {
      const state = execution?.agentes[agentId] ?? 'omitido';
      return [agentId, {
        status: officeStatus(state),
        stage: readableStage(agentId, state),
        delivered: state === 'preparado' || state === 'completado',
      }];
    })) as OfficeSnapshot['agents'],
  };
}

/** Emits only new server-confirmed transitions after the initial hydration. */
export function eventsSince(previous: ExecutionSnapshot, current: ExecutionSnapshot): OfficeEvent[] {
  const events: OfficeEvent[] = [];
  const newRun = current.runId !== previous.runId && current.runId !== null;
  if (newRun) events.push({ type: 'run.start' });

  for (const agentId of AGENTS) {
    const before = newRun ? { status: 'idle' as const, stage: '', delivered: false } : previous.agents[agentId];
    const after = current.agents[agentId];
    if (after.status === 'working' && before.status !== 'working') {
      events.push({ type: 'agent.start', agentId });
      events.push({ type: 'agent.stage', agentId, stage: after.stage });
      continue;
    }
    if (after.status === 'working' && before.stage !== after.stage) events.push({ type: 'agent.stage', agentId, stage: after.stage });
    if (after.status === 'done' && before.status !== 'done') {
      if (before.status !== 'working') {
        events.push({ type: 'agent.start', agentId });
        events.push({ type: 'agent.stage', agentId, stage: after.stage });
      }
      events.push({ type: 'agent.end', agentId, ok: true });
    }
    if (after.status === 'error' && before.status !== 'error') {
      if (before.status !== 'working') events.push({ type: 'agent.start', agentId });
      events.push({ type: 'agent.end', agentId, ok: false });
    }
  }
  return events;
}
