import type { OfficeAgentId, OfficeEvent } from './api';

export const OFFICE_AGENT_IDS = Object.freeze(['maria', 'lucia', 'mattia', 'ceo'] as const satisfies readonly OfficeAgentId[]);

/** Only generic operational events can enter the shared office. */
export function isOfficeEvent(value: unknown): value is OfficeEvent {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  return ['run.start', 'agent.start', 'agent.stage', 'agent.end'].includes(String(value.type));
}
