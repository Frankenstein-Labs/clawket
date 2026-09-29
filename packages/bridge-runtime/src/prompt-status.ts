import type { PromptStatus } from '@clawket/agent-protocol';

export function readPromptIdentity(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200) throw new Error('Invalid message identity');
  return value;
}

/** A receipt is not proof of native dispatch, running state or completion. */
export function recordedPromptStatus(value: unknown): PromptStatus {
  if (!value || typeof value !== 'object') return { status: 'unknown' };
  const receipt = value as { hash?: unknown; runId?: unknown };
  if (typeof receipt.hash !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.hash)
    || typeof receipt.runId !== 'string' || !receipt.runId || receipt.runId.length > 200) return { status: 'unknown' };
  return { status: 'recorded', runId: receipt.runId };
}
