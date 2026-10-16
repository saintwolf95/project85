// Envoltorio React del módulo cerrado. Es lo único que la app importa.
import { useEffect, useRef } from 'react';
import { mountOfficeViva } from './vendor/office-viva.js';
import type { OfficeAgentState, OfficeVivaApi, OfficeVivaData, OfficeVivaOptions } from './vendor/office-viva';
import './vendor/office-viva.css';

export interface OfficeVivaProps extends OfficeVivaOptions {
  agents?: OfficeAgentState[];     // estado real (cada poll)
  data?: OfficeVivaData;           // datos del Centro de mando y del almacén
  activeFilters?: Record<string, string>;  // opcional: filtros fijados desde fuera
  className?: string;
  onReady?: (api: OfficeVivaApi) => void;
}

export default function OfficeViva(props: OfficeVivaProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<OfficeVivaApi | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    if (!host.current) return undefined;
    const p = latest.current;
    const office = mountOfficeViva(host.current, {
      demo: p.demo, readOnly: p.readOnly, canRun: p.canRun, theme: p.theme, clock: p.clock, timeZone: p.timeZone,
      loadFonts: p.loadFonts, stages: p.stages,
      onRunRequested: () => latest.current.onRunRequested?.(),
      onAction: (name, payload) => latest.current.onAction?.(name, payload) ?? Promise.resolve(),
      onOpenExpediente: (id) => latest.current.onOpenExpediente?.(id),
      onOpenChat: (id) => latest.current.onOpenChat?.(id),
      onOpenInforme: () => latest.current.onOpenInforme?.(),
      onError: (err) => latest.current.onError?.(err),
      filters: p.filters, chartDims: p.chartDims,
      onFilterChange: (f) => latest.current.onFilterChange?.(f),
      onFilterSearch: p.onFilterSearch ? (k, t) => latest.current.onFilterSearch?.(k, t) ?? Promise.resolve([]) : undefined,
      onDrill: p.onDrill ? (q) => latest.current.onDrill?.(q) ?? Promise.resolve(null) : undefined,
    });
    api.current = office;
    if (p.agents) office.syncAgents(p.agents);
    if (p.data) office.setData(p.data);
    p.onReady?.(office);
    return () => { office.destroy(); api.current = null; };
  }, []);

  useEffect(() => { api.current?.setTheme(props.theme ?? 'auto'); }, [props.theme]);
  useEffect(() => { api.current?.setReadOnly(!!props.readOnly); }, [props.readOnly]);
  useEffect(() => { api.current?.setCanRun(props.canRun !== false); }, [props.canRun]);
  useEffect(() => { if (props.agents) api.current?.syncAgents(props.agents); }, [props.agents]);
  useEffect(() => { if (props.data) api.current?.setData(props.data); }, [props.data]);
  useEffect(() => { if (props.activeFilters) api.current?.setFilters(props.activeFilters); }, [props.activeFilters]);

  return <div ref={host} className={props.className} style={{ width: '100%', height: '100%' }} />;
}
