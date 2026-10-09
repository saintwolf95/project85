import { create } from 'zustand';
import type { AgentExecution } from '../services/api';
import { ACTIVITIES, adjacent, defaultAgent, realFromExecution, ROSTER, seats } from './model';
import type { ActivityId, AgentId, Point, RealAgent } from './model';

type Phase = 'seat' | 'real' | 'deliver' | 'consolidate' | 'ambient' | 'bathroom' | 'return';
export type CharacterState = { phase: Phase; target: Point; activity: ActivityId | null; bubble: string; until: number; hidden: boolean };
type OfficeState = {
  fingerprint: string;
  runId: number | string | null;
  running: boolean;
  real: Record<AgentId, RealAgent>;
  characters: Record<AgentId, CharacterState>;
  delivered: Record<Exclude<AgentId, 'ceo'>, boolean>;
  sync: (execution: AgentExecution | null) => void;
  advance: (now: number) => void;
  arrived: (id: AgentId, now: number) => void;
  resetAmbient: () => void;
};
const seatOf = (id: AgentId) => seats[ROSTER.find(agent => agent.id === id)!.seat];
const atSeat = (id: AgentId): CharacterState => ({ phase: 'seat', target: seatOf(id), activity: null, bubble: '', until: 0, hidden: false });
const initialCharacters = () => Object.fromEntries(ROSTER.map(a => [a.id, atSeat(a.id)])) as Record<AgentId, CharacterState>;
const initialReal = () => Object.fromEntries(ROSTER.map(a => [a.id, defaultAgent()])) as Record<AgentId, RealAgent>;
const freshDelivered = () => ({ maria: false, lucia: false, mattia: false });
const choice = () => {
  const total = ACTIVITIES.reduce((sum, activity) => sum + activity.weight, 0);
  let roll = Math.random() * total;
  return ACTIVITIES.find(activity => (roll -= activity.weight) < 0) ?? ACTIVITIES[0];
};
const duration = (range: [number, number]) => (range[0] + Math.random() * (range[1] - range[0])) * 1000;

export const useOffice = create<OfficeState>((set) => ({
  fingerprint: '', runId: null, running: false, real: initialReal(), characters: initialCharacters(), delivered: freshDelivered(),
  sync: execution => set(state => {
    const fingerprint = JSON.stringify([execution?.run_id, execution?.estado, execution?.etapa, execution?.agentes, execution?.actualizado_en]);
    if (fingerprint === state.fingerprint) return state;
    const real = realFromExecution(execution);
    const runId = execution?.run_id ?? null;
    const newRun = runId !== state.runId;
    const running = execution?.estado === 'ejecutando';
    const characters = newRun ? initialCharacters() : { ...state.characters };
    const delivered = newRun ? freshDelivered() : { ...state.delivered };
    for (const { id } of ROSTER) {
      const next = real[id];
      const previous = state.real[id];
      const current = characters[id];
      if (next.working) {
        // El trabajo real interrumpe de inmediato cualquier actividad ambiental.
        characters[id] = { ...atSeat(id), phase: id === 'ceo' && Object.values(delivered).every(Boolean) ? 'consolidate' : 'real', target: id === 'ceo' && Object.values(delivered).every(Boolean) ? (adjacent('T') ?? seatOf(id)) : seatOf(id), bubble: previous.working ? next.stage : 'Me pongo con ello' };
      } else if (id !== 'ceo' && !newRun && next.delivered && !delivered[id] && !previous.delivered) {
        characters[id] = { ...current, phase: 'deliver', target: adjacent('T') ?? seatOf(id), activity: null, bubble: 'Llevo mi informe', until: 0, hidden: false };
      } else if (newRun || (running && ['ambient', 'bathroom', 'return'].includes(current.phase)) || (!running && current.phase === 'real') || (!running && current.phase === 'consolidate')) {
        characters[id] = { ...atSeat(id), bubble: next.status === 'error' ? 'Error' : next.status === 'completado' && id === 'ceo' ? 'Informe ejecutivo listo' : '' };
      }
    }
    // Una visita tardía reconstruye los tres informes ya entregados sin animar hechos pasados.
    if (newRun) {
      for (const id of ['maria', 'lucia', 'mattia'] as const) delivered[id] = real[id].delivered;
      if (real.ceo.working && Object.values(delivered).every(Boolean)) characters.ceo = { ...atSeat('ceo'), phase: 'consolidate', target: adjacent('T') ?? seatOf('ceo'), bubble: real.ceo.stage };
    }
    return { fingerprint, runId, running, real, characters, delivered };
  }),
  arrived: (id, now) => set(state => {
    const c = state.characters[id];
    if (c.phase === 'deliver') {
      const delivered = { ...state.delivered, [id]: true };
      const characters = { ...state.characters, [id]: { ...atSeat(id), bubble: 'Informe preparado' } };
      if (Object.values(delivered).every(Boolean) && state.real.ceo.working) characters.ceo = { ...atSeat('ceo'), phase: 'consolidate', target: adjacent('T') ?? seatOf('ceo'), bubble: state.real.ceo.stage };
      return { delivered, characters };
    }
    if (c.phase === 'return') return { characters: { ...state.characters, [id]: atSeat(id) } };
    if (c.phase === 'ambient' && c.activity) {
      const activity = ACTIVITIES.find(item => item.id === c.activity)!;
      return { characters: { ...state.characters, [id]: { ...c, phase: c.activity === 'bathroom' ? 'bathroom' : c.phase, hidden: c.activity === 'bathroom', until: now + duration(activity.duration) } } };
    }
    return state;
  }),
  advance: now => set(state => {
    if (state.running || document.hidden) return state;
    const characters = { ...state.characters };
    let changed = false;
    const reserved = new Set(Object.values(characters).filter(c => c.phase === 'ambient' || c.phase === 'bathroom').map(c => c.activity));
    for (const { id } of ROSTER) {
      const c = characters[id];
      if ((c.phase === 'ambient' || c.phase === 'bathroom') && c.until > 0 && now >= c.until) {
        characters[id] = { ...atSeat(id), phase: 'return', activity: c.activity, bubble: c.activity === 'bathroom' ? 'Ya estoy aquí' : '', hidden: false }; changed = true; continue;
      }
      if (c.phase === 'ambient' && c.activity === 'chat' && c.until > now) {
        const phrase = Math.floor(now / 2600) % 2 === (id === 'lucia' || id === 'ceo' ? 0 : 1) ? '¿Todo en orden?' : 'Sí, seguimos en ello';
        if (c.bubble !== phrase) { characters[id] = { ...c, bubble: phrase }; changed = true; }
      }
      if (c.phase !== 'seat' || c.until > now || Math.random() > 0.055) continue;
      const activity = choice();
      if (activity.id !== 'notes' && activity.id !== 'stretch' && reserved.has(activity.id)) continue;
      if (activity.id === 'chat') {
        const partner = ROSTER.find(agent => agent.id !== id && characters[agent.id].phase === 'seat' && !state.real[agent.id].working);
        if (!partner) continue;
        const first = adjacent('S', 0), second = adjacent('S', 4);
        if (!first || !second) continue;
        characters[id] = { phase: 'ambient', target: first, activity: 'chat', bubble: activity.bubble, until: 0, hidden: false };
        characters[partner.id] = { phase: 'ambient', target: second, activity: 'chat', bubble: 'Todo bien por aquí', until: 0, hidden: false };
        reserved.add('chat'); changed = true; continue;
      }
      const target = activity.destination === 'own-seat' ? seatOf(id) : adjacent(activity.destination === 'bathroom' ? 'B' : activity.destination === 'coffee' ? 'C' : activity.destination === 'printer' ? 'I' : activity.destination === 'window' ? 'V' : 'W');
      if (!target) continue;
      characters[id] = { phase: 'ambient', target, activity: activity.id, bubble: activity.bubble, until: activity.destination === 'own-seat' ? now + duration(activity.duration) : 0, hidden: false };
      reserved.add(activity.id); changed = true;
    }
    return changed ? { characters } : state;
  }),
  resetAmbient: () => set(state => ({ characters: Object.fromEntries(ROSTER.map(({ id }) => [id, ['ambient', 'bathroom', 'return'].includes(state.characters[id].phase) ? atSeat(id) : state.characters[id]])) as Record<AgentId, CharacterState> })),
}));

export const deliveredCount = (state: OfficeState) => Object.values(state.delivered).filter(Boolean).length;
