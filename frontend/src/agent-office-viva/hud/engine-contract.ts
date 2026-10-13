// Lo que el motor de la oficina (mountOffice) debe exponer para que el HUD funcione.

export type RealStatus = 'idle' | 'working' | 'done' | 'error';

export type OfficeEvent =
  | { type: 'run.start' }
  | { type: 'agent.start'; agentId: string }
  | { type: 'agent.stage'; agentId: string; stage: string }
  | { type: 'agent.end'; agentId: string; ok: boolean };

/** Estado que conoce el motor (lo que pasa dentro de la oficina). */
export interface EngineAgentState {
  id: string;
  status: RealStatus;
  stage: string;     // etapa actual (texto genérico)
  progress: number;  // 0..1
  ambient: string;   // «Tomando café», «Fuera un momento»…
}

export interface EngineSnapshot {
  agents: EngineAgentState[];
  hour: number;              // hora mostrada en el reloj (decimal, 0..24)
  selectedId: string | null;
}

export interface OfficeEngine {
  apply(event: OfficeEvent): void;
  select(agentId: string | null): void;                 // resalta y centra la cámara
  setDayNight(on: boolean): void;
  getSnapshot(): EngineSnapshot;
  subscribe(listener: (s: EngineSnapshot) => void): () => void; // como mucho 4 veces por segundo
  portrait(agentId: string, size: number): string;       // dataURL del retrato pixel
  destroy(): void;
}

export interface MountOptions {
  onSelect?: (agentId: string | null) => void;           // clic en un personaje o en el vacío
  /** Hora del reloj y de la luz. Por defecto, hora real de Europe/Madrid. */
  hourSource?: () => number;
}
