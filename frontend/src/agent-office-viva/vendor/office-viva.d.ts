// Tipos del módulo cerrado office-viva.js. NO EDITAR.

export type AgentId = 'maria' | 'lucia' | 'mattia' | 'ceo';
export type AgentStatus = 'idle' | 'working' | 'done' | 'error';

/** Estado real de cada agente, tal como llega del servidor (polling o tiempo real). */
export interface OfficeAgentState {
  id: AgentId;
  status: AgentStatus;
  stage?: string;        // etapa genérica, sin clientes/SKU/importes
  progress?: number;     // 0..1 (opcional; si no, se estima por etapas)
  lastTask?: string;
  finding?: string;      // hallazgo principal (solo si el rol puede verlo)
}

export type Severity = 'alta' | 'media' | 'baja';
export interface OfficeAlert {
  id: string; agent: AgentId; sev: Severity; title: string; detail: string;
  since: string | Date;
  status?: 'abierta' | 'reconocida' | 'resuelta';
  owner?: string | null;
  feedback?: 'util' | 'no_util' | null;
  pm?: string;           // id de la cartera de PM si aplica
}
export interface PmHealth {
  id: string; name: string; skus: number;
  cov: number;           // cobertura en días
  breaks: number;        // roturas
  over: number;          // % sobrestock
  dead: number;          // referencias sin venta en 90 días
  score: number;         // 0-100
  issues: string[];
}
export interface Decision {
  id: string; title: string; why: string; impact: string; agents: AgentId[];
  status: 'propuesta' | 'aceptada' | 'en_curso' | 'hecha' | 'rechazada';
  owner?: string | null;
  steps: ({ label: string; done: boolean } | [string, boolean])[];
}
export interface Run { id: string; start: string | Date; durMin: number; status: 'ok' | 'error'; alerts: number; }
export interface Finding { t: string; e: string; m: string; }   // título, evidencia, métrica
export interface KpiSeries { value?: number; delta?: number | null; spark?: number[]; }
export interface Inventory {
  valueEur: number; valueDelta: number;
  units: number; unitsDelta: number;
  agingDays: number; agingDelta: number;
  deadEur: number; deadDays?: number;          // por defecto 180
  coverageDays: number;
  updatedAt: string | Date;
  trendEur: number[];                          // últimas 12 semanas, en euros
  aging: [label: string, eur: number][];       // 0-30, 31-90, 91-180, >180
  deadByCat: [label: string, eur: number][];
}

export interface OfficeVivaData {
  kpis?: { sales?: KpiSeries; stockHealth?: KpiSeries; margin?: KpiSeries; alertsSpark?: number[] } | null;
  alerts?: OfficeAlert[];
  pms?: PmHealth[];
  findings?: Partial<Record<AgentId, Finding[]>>;
  sales?: [chain: string, thousandsEur: number, deltaPct: number][];
  mgWeeks?: number[];                          // margen bruto % de las últimas semanas
  mgd?: [category: string, pct: number][];
  decisions?: Decision[];
  runs?: Run[];
  notified?: Record<string, string | Date>;    // pmId -> fecha del último aviso
  inventory?: Inventory | null;
}

export type OfficeActionName = 'alert.update' | 'decision.update' | 'decision.step' | 'pm.notify' | 'inventory.export';

export interface OfficeVivaOptions {
  demo?: boolean;                 // datos simulados y demo automática (solo para comparar)
  readOnly?: boolean;             // dirección: sin botones de acción
  canRun?: boolean;               // muestra «Iniciar análisis»
  theme?: 'light' | 'dark' | 'auto';
  clock?: 'real' | 'demo';        // por defecto real (Europe/Madrid) salvo en demo
  timeZone?: string;
  loadFonts?: boolean;            // inyecta Pixelify Sans y Nunito (por defecto sí)
  stages?: Partial<Record<AgentId, string[]>>;   // etapas reales, para la barra de progreso
  onRunRequested?: () => Promise<unknown> | void;
  onAction?: (name: OfficeActionName, payload: Record<string, unknown>) => Promise<unknown>;
  onOpenExpediente?: (agentId: AgentId) => void;
  onOpenChat?: (agentId: AgentId) => void;
  onOpenInforme?: () => void;
  onError?: (err: unknown) => void;
}

export interface OfficeVivaApi {
  syncAgents(states: OfficeAgentState[]): void;   // la primera llamada no anima; las siguientes animan solo los cambios
  setData(partial: OfficeVivaData): void;
  select(agentId: AgentId | null): void;
  openMenu(tab?: 'resumen' | 'almacen' | AgentId | 'alertas' | 'decisiones' | 'historial'): void;
  closeMenu(): void;
  setTheme(theme: 'light' | 'dark' | 'auto'): void;
  setReadOnly(readOnly: boolean): void;
  setCanRun(canRun: boolean): void;
  destroy(): void;
}

export function mountOfficeViva(container: HTMLElement, options?: OfficeVivaOptions): OfficeVivaApi;
