import type { AgentAdapter } from '@clawket/agent-protocol';
import { ChatCacheService } from '../services/chat-cache';

type ResetTarget = Readonly<{ agentId: string; key: string }>;
type ResetConsumer = { isCurrent(): boolean; retire(): void; reload?(cacheDeleted: boolean): void | Promise<unknown> };
type PrepareReset = (target: ResetTarget) => ResetConsumer | null;
const consumers = new WeakMap<AgentAdapter, Set<PrepareReset>>();

/** Local acknowledged management action; never a wire event or a write retry. */
export function onSessionReset(adapter: AgentAdapter, prepare: PrepareReset): () => void {
  const listeners = consumers.get(adapter) ?? new Set<PrepareReset>();
  consumers.set(adapter, listeners);
  listeners.add(prepare);
  return () => {
    listeners.delete(prepare);
    if (!listeners.size) consumers.delete(adapter);
  };
}

export async function resetSessionHistory(adapter: AgentAdapter, agentId: string, key: string): Promise<void> {
  if (!adapter.resetSession) throw new Error('Reset unavailable');
  // Capture before dispatch. Consumers fence ACK against their original scope,
  // including leaving and returning to the same logical conversation.
  const prepared = [...(consumers.get(adapter) ?? [])]
    .map(prepare => prepare({ agentId, key })).filter((item): item is ResetConsumer => item !== null);
  await adapter.resetSession(key);
  // Validate every captured scope before any consumer retires its epoch.
  const accepted = prepared.filter(consumer => consumer.isCurrent());
  for (const consumer of accepted) consumer.retire();
  // Auto-cache retires its debounce synchronously above. Already dispatched
  // saves precede this deletion on the cache service's existing index lock.
  const cacheDeleted = await ChatCacheService.deleteMessages(adapter.connection.id, agentId, key)
    .then(() => true, () => false);
  await Promise.all(accepted.map(consumer => Promise.resolve(consumer.reload?.(cacheDeleted)).catch(() => undefined)));
}
