import { useEffect, useState } from 'react';
import { getAgentExecution } from '../services/api';
import type { AgentExecution } from '../services/api';
import { useAuth } from '../context/useAuth';

export const useAgentExecution = () => {
  const { session } = useAuth();
  const [execution, setExecution] = useState<AgentExecution | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let active = false;
      try {
        const result = await getAgentExecution(controller.signal);
        if (controller.signal.aborted) return;
        setExecution(result);
        setError('');
        active = result?.estado === 'ejecutando';
      } catch {
        if (controller.signal.aborted) return;
        setError('No se puede confirmar el estado del equipo. Reintentando conexión…');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(poll, active ? 3000 : 8000);
        }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [session?.user.id]);
  return { execution, error, loading };
};
