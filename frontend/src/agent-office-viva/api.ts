import { createOfficeEngine } from './engine';

export type OfficeAgentId = 'maria' | 'lucia' | 'mattia' | 'ceo';

export type OfficeEvent =
  | { type: 'run.start' }
  | { type: 'agent.start'; agentId: OfficeAgentId }
  | { type: 'agent.stage'; agentId: OfficeAgentId; stage: string }
  | { type: 'agent.end'; agentId: OfficeAgentId; ok: boolean };

export type OfficeSnapshot = {
  agents: Record<OfficeAgentId, {
    status: 'idle' | 'working' | 'done' | 'error';
    stage: string;
    delivered: boolean;
  }>;
};

export type OfficeEngineAgentState = {
  id: OfficeAgentId;
  status: 'idle' | 'working' | 'done' | 'error';
  stage: string;
  progress: number;
  ambient: string;
};

export type OfficeEngineSnapshot = {
  agents: OfficeEngineAgentState[];
  hour: number;
  selectedId: OfficeAgentId | null;
};

export interface OfficeOptions {
  onSelect?: (agentId: OfficeAgentId | null) => void;
  onOpenExpediente?: (agentId: Exclude<OfficeAgentId, 'ceo'>) => void;
  onOpenChat?: (agentId: OfficeAgentId) => void;
  onOpenInforme?: () => void;
  /** User presentation preference; enabled by default. */
  dayNight?: boolean;
  /** Hora real de Madrid por defecto; el ciclo acelerado solo se permite en desarrollo. */
  hourSource?: () => number;
}

export interface OfficeHandle {
  apply(event: OfficeEvent): void;
  select(agentId: OfficeAgentId | null): void;
  /** Rebuilds an already-running office without replaying historical animations. */
  hydrate(snapshot: OfficeSnapshot): void;
  /** Starts a presentation-only meeting; it never changes server execution state. */
  meeting(type: 'executive' | 'agent', agentId?: OfficeAgentId): void;
  /** Returns attendees to their server-confirmed working or resting positions. */
  endMeeting(): void;
  setDayNight(on: boolean): void;
  getSnapshot(): OfficeEngineSnapshot;
  subscribe(listener: (snapshot: OfficeEngineSnapshot) => void): () => void;
  portrait(agentId: OfficeAgentId, size: number): string;
  destroy(): void;
}

/** Mounts only the Canvas 2D office. React owns every panel and control. */
export function mountOffice(canvas: HTMLCanvasElement, options: OfficeOptions = {}): OfficeHandle {
  return createOfficeEngine(canvas, options) as OfficeHandle;
}
