import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { mountOffice } from './api';
import type { AgentExecution } from '../services/api';
import type { OfficeAgentId, OfficeEngineSnapshot, OfficeHandle } from './api';
import { eventsSince, snapshotFromExecution } from './state';

type OfficeVivaCanvasProps = {
  dayNight: boolean;
  connected: boolean;
  execution: AgentExecution | null;
  onAgentClick: (agentId: OfficeAgentId | null) => void;
  onSnapshot: (snapshot: OfficeEngineSnapshot) => void;
  className?: string;
};

export type OfficeVivaCanvasHandle = {
  startExecutiveMeeting: () => void;
  startAgentMeeting: (agentId: OfficeAgentId) => void;
  endMeeting: () => void;
  select: (agentId: OfficeAgentId | null) => void;
  setDayNight: (enabled: boolean) => void;
  portrait: (agentId: OfficeAgentId, size: number) => string;
};

/** React boundary for the Canvas-only office. All HUD remains outside the canvas. */
export const OfficeVivaCanvas = forwardRef<OfficeVivaCanvasHandle, OfficeVivaCanvasProps>(function OfficeVivaCanvas({ dayNight, connected, execution, onAgentClick, onSnapshot, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onAgentClickRef = useRef(onAgentClick);
  const onSnapshotRef = useRef(onSnapshot);
  const officeRef = useRef<OfficeHandle | null>(null);
  const previousRef = useRef<ReturnType<typeof snapshotFromExecution> | null>(null);
  const hydratedRef = useRef(false);
  const connectedRef = useRef(connected);
  const executionRef = useRef(execution);

  useEffect(() => { onAgentClickRef.current = onAgentClick; }, [onAgentClick]);
  useEffect(() => { onSnapshotRef.current = onSnapshot; }, [onSnapshot]);
  useEffect(() => { connectedRef.current = connected; executionRef.current = execution; }, [connected, execution]);

  useEffect(() => {
    officeRef.current?.setDayNight(dayNight);
  }, [dayNight]);

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
      onSelect: agentId => onAgentClickRef.current(agentId),
    });
    officeRef.current = office;
    const unsubscribe = office.subscribe(snapshot => onSnapshotRef.current(snapshot));
    if (connectedRef.current) {
      const initial = snapshotFromExecution(executionRef.current);
      office.hydrate(initial);
      previousRef.current = initial;
      hydratedRef.current = true;
    }
    return () => {
      unsubscribe();
      office.destroy();
      officeRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    startExecutiveMeeting: () => officeRef.current?.meeting('executive'),
    startAgentMeeting: (agentId) => officeRef.current?.meeting('agent', agentId),
    endMeeting: () => officeRef.current?.endMeeting(),
    select: (agentId) => officeRef.current?.select(agentId),
    setDayNight: (enabled) => officeRef.current?.setDayNight(enabled),
    portrait: (agentId, size) => officeRef.current?.portrait(agentId, size) || '',
  }), []);

  return <canvas ref={canvasRef} className={className} aria-label="Oficina viva de agentes" />;
});
