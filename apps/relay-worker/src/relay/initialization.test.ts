import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureHeartbeat } from './heartbeat';
import { initializeRelayRuntime } from './initialization';
import type { RelayRuntime } from './runtime';
import { loadGatewayOwner, loadMirroredClientTokenHashes, loadRoomMeta, rehydrateSockets } from './storage';
import { logRuntimeTelemetry } from './telemetry';

vi.mock('./storage', () => ({
  loadRoomMeta: vi.fn(), loadMirroredClientTokenHashes: vi.fn(),
  loadGatewayOwner: vi.fn(), rehydrateSockets: vi.fn(),
}));
vi.mock('./heartbeat', () => ({ ensureHeartbeat: vi.fn() }));
vi.mock('./telemetry', () => ({ logRuntimeTelemetry: vi.fn() }));

const runtime = {} as RelayRuntime;
const stages = [loadRoomMeta, loadMirroredClientTokenHashes, loadGatewayOwner, rehydrateSockets, ensureHeartbeat] as const;
const names = ['room_meta', 'client_tokens', 'owner', 'sockets', 'heartbeat'] as const;
let now: number;

beforeEach(() => {
  now = 100_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  for (const stage of stages) vi.mocked(stage).mockReset();
  vi.mocked(logRuntimeTelemetry).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('room initialization observation', () => {
  it('keeps authentication reads serial and the existing heartbeat barrier awaited', async () => {
    let releaseMeta!: () => void;
    let releaseHeartbeat!: () => void;
    vi.mocked(loadRoomMeta).mockImplementation(() => new Promise<void>(resolve => { releaseMeta = resolve; }));
    vi.mocked(ensureHeartbeat).mockImplementation(() => new Promise<void>(resolve => { releaseHeartbeat = resolve; }));
    let completed = false;
    const pending = initializeRelayRuntime(runtime).then(() => { completed = true; });
    expect(loadRoomMeta).toHaveBeenCalledWith(runtime);
    expect(loadMirroredClientTokenHashes).not.toHaveBeenCalled();
    releaseMeta();
    for (let step = 0; step < 12; step++) await Promise.resolve();
    expect(stages.map(stage => vi.mocked(stage).mock.invocationCallOrder[0]))
      .toEqual([...stages.map(stage => vi.mocked(stage).mock.invocationCallOrder[0])].sort((a, b) => a - b));
    expect(completed).toBe(false);
    releaseHeartbeat();
    await pending;
    expect(completed).toBe(true);
    expect(logRuntimeTelemetry).not.toHaveBeenCalled();
  });

  it('omits healthy fast initialization and records the slow I/O stage at the threshold', async () => {
    vi.mocked(ensureHeartbeat).mockImplementation(async () => { now += 999; });
    await initializeRelayRuntime(runtime);
    expect(logRuntimeTelemetry).not.toHaveBeenCalled();
    vi.mocked(ensureHeartbeat).mockImplementation(async () => { now += 1_000; });
    await initializeRelayRuntime(runtime);
    expect(logRuntimeTelemetry).toHaveBeenCalledTimes(1);
    expect(logRuntimeTelemetry).toHaveBeenCalledWith(runtime, 'room_initialization', {
      initializationOutcome: 'ready', initializationStep: 'heartbeat', initializationMs: 1_000,
      roomMetaMs: 0, clientTokensMs: 0, ownerLoadMs: 0, socketsRehydrateMs: 0, heartbeatSetupMs: 1_000,
    });
  });

  it.each(names)('preserves the original %s failure and skips later initialization', async (name) => {
    const index = names.indexOf(name);
    const error = new Error('private credential/body/path must not be observed');
    vi.mocked(stages[index]).mockImplementation(() => { now += 20; throw error; });
    await expect(initializeRelayRuntime(runtime)).rejects.toBe(error);
    for (const stage of stages.slice(index + 1)) expect(stage).not.toHaveBeenCalled();
    expect(logRuntimeTelemetry).toHaveBeenCalledTimes(1);
    expect(logRuntimeTelemetry).toHaveBeenCalledWith(runtime, 'room_initialization', expect.objectContaining({
      initializationOutcome: 'error', initializationStep: name, initializationMs: 20,
    }));
    expect(JSON.stringify(vi.mocked(logRuntimeTelemetry).mock.calls)).not.toContain('private');
  });

  it('does not turn a diagnostic failure into a startup failure or hide an original failure', async () => {
    vi.mocked(logRuntimeTelemetry).mockImplementation(() => { throw new Error('observer'); });
    vi.mocked(ensureHeartbeat).mockImplementation(async () => { now += 1_500; });
    await expect(initializeRelayRuntime(runtime)).resolves.toBeUndefined();
    const original = new Error('storage');
    vi.mocked(loadRoomMeta).mockRejectedValue(original);
    await expect(initializeRelayRuntime(runtime)).rejects.toBe(original);
  });

  it('bounds clock jumps and keeps rollback durations nonnegative', async () => {
    vi.mocked(loadRoomMeta).mockImplementation(async () => { now -= 100; });
    vi.mocked(ensureHeartbeat).mockImplementation(async () => { now += 1_000_000; });
    await initializeRelayRuntime(runtime);
    expect(logRuntimeTelemetry).toHaveBeenCalledWith(runtime, 'room_initialization', expect.objectContaining({
      initializationMs: 60_000, roomMetaMs: 0, heartbeatSetupMs: 60_000,
    }));
  });
});
