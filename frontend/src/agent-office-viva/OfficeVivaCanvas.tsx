import { useEffect, useRef } from 'react';
import { mountOffice } from './api';
import type { AgentExecution } from '../services/api';
import type { OfficeAgentId, OfficeHandle } from './api';
import { eventsSince, snapshotFromExecution } from './state';

type OfficeVivaCanvasProps = {
  dayNight: boolean;
  connected: boolean;
  execution: AgentExecution | null;
  onAgentClick: (agentId: OfficeAgentId) => void;
};

/** React boundary for the Canvas-only office. All HUD remains outside the canvas. */
export function OfficeVivaCanvas({ dayNight, connected, execution, onAgentClick }: OfficeVivaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onAgentClickRef = useRef(onAgentClick);
  const officeRef = useRef<OfficeHandle | null>(null);
  const previousRef = useRef<ReturnType<typeof snapshotFromExecution> | null>(null);
  const hydratedRef = useRef(false);
  const connectedRef = useRef(connected);
  const executionRef = useRef(execution);

  useEffect(() => { onAgentClickRef.current = onAgentClick; }, [onAgentClick]);
  useEffect(() => { connectedRef.current = connected; executionRef.current = execution; }, [connected, execution]);

  useEffect(() => {
    const office = officeRef.current;
    if (!office) return;
    if (!connected) {
      hydratedRef.current = false;
      previousRef.current = null;
      return;
    }
    const current = snapshotFromExecution(execution);
    if (!hydratedRef.current) {
      office.hydrate(current);
      previousRef.current = current;
      hydratedRef.current = true;
      return;
    }
    const previous = previousRef.current;
    if (previous) eventsSince(previous, current).forEach(event => office.apply(event));
    previousRef.current = current;
  }, [connected, execution]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const office = mountOffice(canvas, {
      dayNight,
      onSelect: agentId => { if (agentId) onAgentClickRef.current(agentId); },
    });
    officeRef.current = office;
    if (connectedRef.current) {
      const initial = snapshotFromExecution(executionRef.current);
      office.hydrate(initial);
      previousRef.current = initial;
      hydratedRef.current = true;
    }
    return () => {
      office.destroy();
      officeRef.current = null;
    };
  }, [dayNight]);

  return <div className="office-viva-canvas">
    <canvas ref={canvasRef} aria-label="Oficina viva de agentes" />
  </div>;
}
