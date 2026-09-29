import { ensureHeartbeat } from './heartbeat';
import type { RelayRuntime } from './runtime';
import { loadGatewayOwner, loadMirroredClientTokenHashes, loadRoomMeta, rehydrateSockets } from './storage';
import { logRuntimeTelemetry } from './telemetry';

const SLOW_INITIALIZATION_MS = 1_000;
const MAX_RECORDED_DURATION_MS = 60_000;
type InitializationStep = 'room_meta' | 'client_tokens' | 'owner' | 'sockets' | 'heartbeat';

/** Keep the constructor's authenticated rehydration/input gate serial and intact. */
export async function initializeRelayRuntime(runtime: RelayRuntime): Promise<void> {
  const startedAt = Date.now();
  let step: InitializationStep = 'room_meta';
  const durations: Partial<Record<InitializationStep, number>> = {};
  const observe = (initializationOutcome: 'ready' | 'error'): void => {
    const initializationMs = durationSince(startedAt);
    if (initializationOutcome === 'ready' && initializationMs < SLOW_INITIALIZATION_MS) return;
    try {
      logRuntimeTelemetry(runtime, 'room_initialization', {
        initializationOutcome,
        initializationStep: step,
        initializationMs,
        roomMetaMs: durations.room_meta,
        clientTokensMs: durations.client_tokens,
        ownerLoadMs: durations.owner,
        socketsRehydrateMs: durations.sockets,
        heartbeatSetupMs: durations.heartbeat,
      });
    } catch { /* Diagnostic failure cannot change initialization or its original error. */ }
  };
  const run = async (next: InitializationStep, action: () => void | Promise<void>): Promise<void> => {
    step = next;
    const before = Date.now();
    try { await action(); } finally { durations[next] = durationSince(before); }
  };
  try {
    await run('room_meta', () => loadRoomMeta(runtime));
    await run('client_tokens', () => loadMirroredClientTokenHashes(runtime));
    await run('owner', () => loadGatewayOwner(runtime));
    // Preserve the synchronous rehydration before scheduling the existing alarm.
    step = 'sockets';
    const before = Date.now();
    try { rehydrateSockets(runtime); } finally { durations.sockets = durationSince(before); }
    await run('heartbeat', () => ensureHeartbeat(runtime));
  } catch (error) {
    observe('error');
    throw error;
  }
  observe('ready');
}

function durationSince(startedAt: number): number {
  // In Workers this clock advances at I/O boundaries, not during synchronous CPU
  // execution. This is stage wall-time evidence, not a CPU or pre-wakeup timer.
  const elapsed = Date.now() - startedAt;
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(MAX_RECORDED_DURATION_MS, Math.round(elapsed))) : 0;
}
