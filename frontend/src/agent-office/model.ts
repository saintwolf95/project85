import type { AgentExecution, AgentWorkState } from '../services/api';

export type AgentId = 'maria' | 'lucia' | 'mattia' | 'ceo';
export type Point = { x: number; y: number };
export type ActivityId = 'notes' | 'coffee' | 'bathroom' | 'chat' | 'printer' | 'window' | 'board' | 'stretch';
export type Activity = { id: ActivityId; weight: number; destination: string; duration: [number, number]; bubble: string };

// Catálogo ambiental: las duraciones están en segundos y nunca representan trabajo real.
export const ACTIVITIES: Activity[] = [
  { id: 'notes', weight: 38, destination: 'own-seat', duration: [10, 19], bubble: 'Revisando notas' },
  { id: 'coffee', weight: 14, destination: 'coffee', duration: [5, 9], bubble: 'Voy a por un café' },
  { id: 'bathroom', weight: 7, destination: 'bathroom', duration: [20, 40], bubble: 'Ahora vuelvo' },
  { id: 'chat', weight: 12, destination: 'sofa', duration: [7, 12], bubble: '¿Cómo va todo?' },
  { id: 'printer', weight: 8, destination: 'printer', duration: [4, 7], bubble: 'Voy a la impresora' },
  { id: 'window', weight: 8, destination: 'window', duration: [6, 10], bubble: 'Un momento en la ventana' },
  { id: 'board', weight: 7, destination: 'board', duration: [5, 8], bubble: 'Revisando la pizarra' },
  { id: 'stretch', weight: 6, destination: 'own-seat', duration: [3, 5], bubble: 'Estirando las piernas' },
];

export const ROSTER: { id: AgentId; name: string; role: string; seat: number; shirt: number; hair: number; skin: number }[] = [
  { id: 'maria', name: 'María', role: 'Inventario', seat: 1, shirt: 0x607f8d, hair: 0x493627, skin: 0xe8b99c },
  { id: 'lucia', name: 'Lucía', role: 'Ventas', seat: 2, shirt: 0x867592, hair: 0x754a30, skin: 0xeac1a4 },
  { id: 'mattia', name: 'Mattia', role: 'Finanzas', seat: 3, shirt: 0x67827b, hair: 0x30303b, skin: 0xd3a582 },
  { id: 'ceo', name: 'CEO', role: 'Dirección', seat: 4, shirt: 0x718090, hair: 0x687282, skin: 0xd9aa88 },
];

// Mapa textual del módulo adaptado a los cuatro agentes reales.
// # pared, D mesa, 1-4 silla, T mesa central, S sofá, C café, B baño,
// I impresora, V ventana, W pizarra, P planta, . suelo.
export const MAP = [
  '####################',
  '#..V.....V......V..#',
  '#.D1...D2...D3.....#',
  '#..................#',
  '#..W.......III.....#',
  '#......TTTT........#',
  '#......TTTT....D4..#',
  '#..............DD..#',
  '#..SS...SS.........#',
  '#..SS...SS....C....#',
  '#P..............B.P#',
  '####################',
];
export const TILE_W = 64;
export const TILE_H = 32;
export const iso = (x: number, y: number): Point => ({ x: (x - y) * TILE_W / 2, y: (x + y) * TILE_H / 2 });
export const depth = (p: Point) => Math.round((p.x + p.y) * 100);
export const seats: Record<number, Point> = {};
export const tiles: { x: number; y: number; kind: string }[] = [];
export const walkable = MAP.map((row, y) => [...row].map((kind, x) => {
  tiles.push({ x, y, kind });
  if (/[1-4]/.test(kind)) seats[Number(kind)] = { x, y };
  return !'#DTICBWPV'.includes(kind);
}));
const DIRECTIONS: Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
export const isWalkable = (p: Point) => !!walkable[p.y]?.[p.x];
export function adjacent(kind: string, index = 0): Point | null {
  const matches = tiles.filter(tile => tile.kind === kind);
  const tile = matches[index % matches.length];
  if (!tile) return null;
  return DIRECTIONS.map(d => ({ x: tile.x + d.x, y: tile.y + d.y })).find(isWalkable) ?? null;
}
export function pathfind(from: Point, to: Point): Point[] {
  if (!isWalkable(to) || !isWalkable(from)) return [];
  const key = (p: Point) => `${p.x},${p.y}`;
  const start = key(from), goal = key(to);
  if (start === goal) return [];
  const previous = new Map<string, string>([[start, start]]);
  const queue = [from];
  for (let i = 0; i < queue.length && !previous.has(goal); i++) {
    for (const d of DIRECTIONS) {
      const next = { x: queue[i].x + d.x, y: queue[i].y + d.y };
      const nk = key(next);
      const otherChair = /[1-4]/.test(MAP[next.y]?.[next.x] ?? '') && nk !== goal;
      if (isWalkable(next) && !otherChair && !previous.has(nk)) { previous.set(nk, key(queue[i])); queue.push(next); }
    }
  }
  if (!previous.has(goal)) return [];
  const result: Point[] = [];
  for (let cursor = goal; cursor !== start; cursor = previous.get(cursor)!) {
    const [x, y] = cursor.split(',').map(Number);
    result.unshift({ x, y });
  }
  return result;
}

export type RealAgent = { status: AgentWorkState | 'inactivo'; stage: string; working: boolean; delivered: boolean };
export const defaultAgent = (): RealAgent => ({ status: 'inactivo', stage: 'Inactivo', working: false, delivered: false });
export const stageFor = (id: AgentId, status: AgentWorkState | 'inactivo'): string => {
  if (status === 'trabajando') return id === 'maria' ? 'Analizando inventario' : id === 'lucia' ? 'Analizando ventas' : id === 'mattia' ? 'Analizando finanzas' : 'Consolidando informes';
  if (status === 'preparado') return 'Informe preparado';
  if (status === 'completado') return id === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado';
  if (status === 'error' || status === 'interrumpido') return 'Error';
  if (status === 'pendiente') return 'En cola';
  return 'Inactivo';
};
export function realFromExecution(execution: AgentExecution | null): Record<AgentId, RealAgent> {
  return Object.fromEntries(ROSTER.map(({ id }) => {
    const status = execution?.agentes[id] ?? 'inactivo';
    return [id, { status, stage: stageFor(id, status), working: execution?.estado === 'ejecutando' && status === 'trabajando', delivered: status === 'preparado' || status === 'completado' }];
  })) as Record<AgentId, RealAgent>;
}
