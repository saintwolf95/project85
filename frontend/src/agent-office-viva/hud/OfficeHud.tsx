'use client';
// Componentes del HUD de la oficina viva: cabecera con reloj, controles,
// tarjetas del equipo y ficha rápida. Copia fiel del prototipo.
import { useEffect, useRef } from 'react';
import type { RealStatus } from './engine-contract';
import s from './OfficeHud.module.css';

/** Datos de un agente tal como los pinta el HUD (motor + datos de la app). */
export interface OfficeAgentView {
  id: string;
  name: string;               // «María»
  role: string;               // «Inventario»
  status: RealStatus;
  stage: string;
  progress: number;           // 0..1
  ambient: string;
  portrait: string;           // dataURL del motor
  lastTask: string;           // genérica, sin clientes/SKU/importes
  finding: string | null;     // null = el rol no puede verlo
  updatedAt: Date | null;
}

export function stateText(a: Pick<OfficeAgentView, 'id' | 'status' | 'stage'>): string {
  if (a.status === 'working') return a.stage || 'Trabajando';
  if (a.status === 'done') return a.id === 'ceo' ? 'Informe ejecutivo listo' : 'Informe entregado';
  if (a.status === 'error') return 'Revisión necesaria';
  return 'Libre';
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtHour = (h: number) => `${pad(Math.floor(h) % 24)}:${pad(Math.floor((h % 1) * 60))}`;
const skyIcon = (h: number) => (h >= 20 || h < 7 ? '☾' : h >= 17.5 ? '◐' : '☀');
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function relative(d: Date | null): string {
  if (!d) return 'Sin datos';
  const min = Math.round((d.getTime() - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

/* ---------- Cabecera: logo, marca y reloj ---------- */
export function OfficeTopBar({ hour, subtitle = 'Oficina de agentes' }: { hour: number; subtitle?: string }) {
  return (
    <header className={`${s.panel} ${s.topLeft}`}>
      <div className={s.logo} aria-hidden="true">5</div>
      <div className={s.brand}>
        <h1>Five Minutes</h1>
        <p>{subtitle}</p>
      </div>
      <div className={s.clock} aria-label={`Hora de la oficina: ${fmtHour(hour)}`}>
        <span aria-hidden="true">{skyIcon(hour)}</span>
        <span>{fmtHour(hour)}</span>
      </div>
    </header>
  );
}

/* ---------- Controles: día y noche + iniciar análisis ---------- */
interface ControlsProps {
  canRun: boolean;          // solo administrador
  running: boolean;
  dayNight: boolean;
  onToggleDayNight: () => void;
  onRun: () => void;
}
export function OfficeControls({ canRun, running, dayNight, onToggleDayNight, onRun }: ControlsProps) {
  return (
    <div className={`${s.panel} ${s.topRight}`}>
      <button type="button" className={`${s.btn} ${s.toggle}`} aria-pressed={dayNight} onClick={onToggleDayNight}>
        Día y noche
      </button>
      {canRun && (
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={running} onClick={onRun}>
          {running ? 'Análisis en curso…' : 'Iniciar análisis'}
        </button>
      )}
    </div>
  );
}

/* ---------- Tarjetas del equipo ---------- */
interface TeamProps {
  agents: OfficeAgentView[];
  selectedId: string | null;
  onSelect: (agentId: string | null) => void;
}
export function TeamCards({ agents, selectedId, onSelect }: TeamProps) {
  return (
    <section className={s.team} aria-label="Equipo">
      {agents.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`${s.panel} ${s.card}`}
          data-s={a.status}
          aria-pressed={selectedId === a.id}
          onClick={() => onSelect(selectedId === a.id ? null : a.id)}
        >
          <img className={s.avatar} src={a.portrait} alt="" width={48} height={48} />
          <div>
            <div className={s.who}>{a.name} · {a.role}</div>
            <div className={s.state}>
              <span className={s.dot} aria-hidden="true" />
              <span>{stateText(a)}</span>
            </div>
            <div className={s.bar} aria-hidden="true">
              <i style={{ width: `${Math.round((a.status === 'idle' ? 0 : a.progress) * 100)}%` }} />
            </div>
          </div>
        </button>
      ))}
    </section>
  );
}

/* ---------- Ficha rápida ---------- */
interface FichaProps {
  agent: OfficeAgentView;
  onClose: () => void;
  onOpenExpediente: (agentId: string) => void;
  onOpenChat: (agentId: string) => void;
  onOpenInforme: () => void;
}
export function AgentFicha({ agent: a, onClose, onOpenExpediente, onOpenChat, onOpenInforme }: FichaProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [a.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finding = a.finding === null ? 'Disponible en el expediente' : a.finding || 'Aún sin hallazgos en esta ejecución';
  const isCeo = a.id === 'ceo';

  return (
    <aside className={`${s.panel} ${s.ficha}`} aria-label={`Ficha de ${a.name}`} aria-live="polite">
      <button ref={closeRef} type="button" className={`${s.btn} ${s.close}`} aria-label="Cerrar ficha" onClick={onClose}>✕</button>
      <header className={s.fichaHead}>
        <img className={s.avatar} src={a.portrait} alt="" width={64} height={64} />
        <div>
          <h2>{a.name}</h2>
          <div className={s.role}>{a.role}</div>
        </div>
      </header>
      <dl className={s.rows}>
        <div><dt>Estado del análisis</dt><dd>{stateText(a)}</dd></div>
        <div><dt>Última actualización</dt><dd>{relative(a.updatedAt)}</dd></div>
        <div><dt>Última tarea</dt><dd>{a.lastTask}</dd></div>
        <div><dt>Hallazgo principal</dt><dd>{finding}</dd></div>
        <div><dt>Ahora mismo en la oficina</dt><dd className={s.ambient}>{a.ambient}</dd></div>
      </dl>
      <div className={s.actions}>
        {isCeo ? (
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={onOpenInforme}>Ver informe ejecutivo</button>
        ) : (
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => onOpenExpediente(a.id)}>Ver expediente</button>
        )}
        <button type="button" className={s.btn} onClick={() => onOpenChat(a.id)}>Abrir chat</button>
      </div>
    </aside>
  );
}
