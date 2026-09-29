import type { AgentAdapter } from '@clawket/agent-protocol';

export type AdapterRecoveryReason = 'probe_failed' | 'foreground';
type RecoveryOwner = (timeoutMs?: number, reason?: AdapterRecoveryReason) => Promise<boolean>;
const owners = new WeakMap<AgentAdapter, RecoveryOwner>();
const recoveredListeners = new WeakMap<AgentAdapter, Set<(generation: number) => void>>();

/** Ephemeral notification only: no replay queue, state transition or write retry. */
export function onAdapterPathRecovered(adapter: AgentAdapter, listener: (generation: number) => void): () => void {
  const listeners = recoveredListeners.get(adapter) ?? new Set<(generation: number) => void>();
  recoveredListeners.set(adapter, listeners);
  listeners.add(listener);
  return () => {
    if (!listeners.delete(listener)) return;
    if (!listeners.size && recoveredListeners.get(adapter) === listeners) recoveredListeners.delete(adapter);
  };
}

export function notifyAdapterPathRecovered(adapter: AgentAdapter, generation: number): void {
  for (const listener of [...(recoveredListeners.get(adapter) ?? [])]) {
    try { listener(generation); } catch { /* A view cannot invalidate verified health. */ }
  }
}

/** The active coordinator owns recovery; retired adapters keep their inert owner. */
export function bindAdapterRecovery(adapter: AgentAdapter, owner: RecoveryOwner): void {
  owners.set(adapter, owner);
}

/** Views request recovery without owning sockets, retry timers, or message replay. */
export function recoverAdapterConnection(
  adapter: AgentAdapter | null,
  timeoutMs?: number,
  reason: AdapterRecoveryReason = 'probe_failed',
): Promise<boolean> {
  if (!adapter) return Promise.resolve(false);
  const owner = owners.get(adapter);
  // Standalone adapters may be inspected, but only a registered owner may reconnect.
  return owner ? owner(timeoutMs, reason) : adapter.probe(timeoutMs).catch(() => false);
}
