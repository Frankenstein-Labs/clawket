import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeRuntime } from './openclaw/runtime.js';
import { HermesRelayRuntime } from './hermes/relay.js';
import { RELAY_OWNER_PONG_CAPABILITY } from './relay-owner-pong.js';
import { RELAY_TRANSFER_CAPABILITY, RELAY_TRANSFER_MIN_BYTES } from './relay-transfer-lease.js';

const PREFIX = '__clawket_relay_control__:';
const control = (event: string, payload?: object) => PREFIX + JSON.stringify({ type: 'control', event, payload });
const ready = control('relay.ready', { capabilities: [RELAY_OWNER_PONG_CAPABILITY] });
class Socket extends EventEmitter {
  readyState = 0;
  autoPong = false;
  pingCount = 0;
  pingPayload: string | undefined;
  terminated = false;
  sent: string[] = [];
  constructor(readonly url: string) { super(); }
  send(data: string | Buffer): void { this.sent.push(String(data)); }
  ping(data?: string): void { this.pingCount++; this.pingPayload = data; if (this.autoPong) this.emit('pong', Buffer.from(data ?? '')); }
  open(): void { this.readyState = 1; this.emit('open'); }
  message(text: string): void { this.emit('message', Buffer.from(text), false); }
  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3; this.emit('close', code, Buffer.from(reason));
  }
  terminate(): void { this.terminated = true; this.close(1006); }
  echoes(): Array<{ payload: { nonce: string } }> {
    return this.sent.filter(frame => frame.startsWith(PREFIX)).map(frame => JSON.parse(frame.slice(PREFIX.length)))
      .filter(frame => frame.event === 'relay.owner-ping');
  }
}

function fixture(backend: 'openclaw' | 'hermes', channels = false, options: { defaultTimings?: boolean; reconnectBaseDelayMs?: number } = {}) {
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  const sockets: Socket[] = [];
  const config = { serverUrl: 'https://registry.test', relayUrl: 'wss://relay.test/ws', relaySecret: 'qa',
    instanceId: 'qa', displayName: 'qa', createdAt: '2026-09-28', updatedAt: '2026-09-28' };
  const createWebSocket = (url: string) => { const socket = new Socket(url); sockets.push(socket); return socket as never; };
  const runtime = backend === 'openclaw'
    ? new BridgeRuntime({ config: { ...config, gatewayId: 'gw_qa' }, gatewayUrl: 'ws://127.0.0.1:18789',
      clientChannels: channels, ...(options.defaultTimings ? {} : { heartbeatIntervalMs: 1000, heartbeatTimeoutMs: 3000 }),
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 100, createWebSocket })
    : new HermesRelayRuntime({ config: { ...config, bridgeId: 'hbg_qa' }, bridgeUrl: 'ws://127.0.0.1:4319',
      ...(options.defaultTimings ? {} : { relayPingIntervalMs: 1000, relayPongTimeoutMs: 3000 }),
      reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 100, createWebSocket });
  return { runtime, sockets, cloud: () => sockets.filter(socket => socket.url.startsWith('wss:')) };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe.each(['openclaw', 'hermes'] as const)('%s bounded cloud hedge', backend => {
  const cadence = backend === 'openclaw' ? 10_000 : 15_000;
  it('adds no application pings when protocol pongs are healthy', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.autoPong = true; relay.open(); relay.message(ready);
      expect(new URL(relay.url).searchParams.get('capabilities')).toContain(RELAY_OWNER_PONG_CAPABILITY);
      await vi.advanceTimersByTimeAsync(cadence * 3);
      expect(relay.pingCount).toBe(3); expect(relay.echoes()).toHaveLength(0); expect(relay.terminated).toBe(false);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('hedges after 1s and retires once at the original 5s deadline', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready);
      await vi.advanceTimersByTimeAsync(cadence + 999);
      expect(relay.pingCount).toBe(1); expect(relay.echoes()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(relay.echoes()).toHaveLength(1); expect(relay.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(3999); expect(relay.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1); expect(relay.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('uses an exact echo once, while stale echoes and business traffic cannot clear the next cycle', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready);
      await vi.advanceTimersByTimeAsync(cadence + 1000);
      const oldNonce = relay.echoes()[0].payload.nonce;
      relay.message(control('relay.owner-pong', { nonce: oldNonce }));
      // The losing protocol response must not schedule a duplicate Hermes ping.
      relay.emit('pong', Buffer.from(relay.pingPayload!));
      await vi.advanceTimersByTimeAsync(cadence + 1000);
      expect(relay.pingCount).toBe(2); expect(relay.echoes()).toHaveLength(2);
      relay.message(control('relay.owner-pong', { nonce: oldNonce }));
      for (let i = 0; i < 4; i++) {
        relay.message(PREFIX + JSON.stringify({ event: 'client_count', count: 0 }));
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(relay.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('rejects matching echoes on a retired socket and wrong echoes on its replacement', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const old = f.cloud()[0]; old.open(); old.message(ready);
      await vi.advanceTimersByTimeAsync(cadence + 1000); const oldNonce = old.echoes()[0].payload.nonce;
      old.terminate(); await vi.advanceTimersByTimeAsync(100);
      const replacement = f.cloud().at(-1)!; expect(replacement).not.toBe(old);
      replacement.open(); replacement.message(ready);
      await vi.advanceTimersByTimeAsync(cadence + 1000);
      old.message(control('relay.owner-pong', { nonce: replacement.echoes()[0].payload.nonce }));
      replacement.message(control('relay.owner-pong', { nonce: oldNonce }));
      await vi.advanceTimersByTimeAsync(4000); expect(replacement.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('cancels the hedge with a later exact protocol pong and schedules only one next cycle', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready);
      await vi.advanceTimersByTimeAsync(cadence + 2000);
      relay.emit('pong', Buffer.from(relay.pingPayload!)); relay.autoPong = true;
      await vi.advanceTimersByTimeAsync(cadence);
      expect(relay.pingCount).toBe(2); expect(relay.terminated).toBe(false); expect(relay.echoes()).toHaveLength(1);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('disposes both pending probes on explicit stop', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready);
    await vi.advanceTimersByTimeAsync(cadence + 1000); expect(relay.echoes()).toHaveLength(1);
    await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.cloud()).toHaveLength(1); expect(relay.terminated).toBe(false);
  });
});

it('preserves OpenClaw legacy inbound-activity liveness without negotiated support', async () => {
  vi.useFakeTimers();
  const f = fixture('openclaw');
  try {
    f.runtime.start(); const relay = f.cloud()[0]; relay.open();
    relay.message(control('relay.ready', { capabilities: ['relay.frame-limit.v2'] }));
    for (let i = 0; i < 8; i++) {
      relay.message(PREFIX + JSON.stringify({ event: 'client_count', count: 0 }));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(relay.terminated).toBe(false); expect(relay.echoes()).toHaveLength(0);
  } finally { await f.runtime.stop(); }
});

it('negotiates independent OpenClaw owner and channel echoes without crossing their nonce scope', async () => {
  vi.useFakeTimers();
  const f = fixture('openclaw', true, { defaultTimings: true });
  try {
    f.runtime.start(); const owner = f.cloud()[0]; owner.autoPong = true; owner.open(); owner.message(ready);
    expect(new URL(owner.url).searchParams.get('capabilities')).toBe('bridge.client-sockets.v1,relay.owner-pong.v1,relay.transfer-hint.v1');
    owner.message(control('client.sockets', { clients: ['11111111-1111-4111-8111-111111111111'] }));
    const channel = f.cloud()[1]; channel.open(); channel.message(ready);
    expect(new URL(channel.url).searchParams.get('targetConnectionId')).toBe('11111111-1111-4111-8111-111111111111');
    expect(new URL(channel.url).searchParams.get('capabilities')).toBe('relay.owner-pong.v1,relay.transfer-hint.v1');
    await vi.advanceTimersByTimeAsync(11_000);
    owner.message(control('relay.owner-pong', { nonce: channel.echoes()[0].payload.nonce }));
    await vi.advanceTimersByTimeAsync(4000);
    expect(owner.terminated).toBe(false); expect(owner.echoes()).toHaveLength(0);
    expect(channel.terminated).toBe(true);
  } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
});

describe.each(['openclaw', 'hermes'] as const)('%s independent protocol deadline', backend => {
  it('keeps the production cadence with a 1s hedge and shared 5s deadline', async () => {
    vi.useFakeTimers();
    const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready);
      const cadence = backend === 'openclaw' ? 10_000 : 15_000;
      await vi.advanceTimersByTimeAsync(cadence - 1); expect(relay.pingCount).toBe(0);
      await vi.advanceTimersByTimeAsync(1); expect(relay.pingCount).toBe(1);
      await vi.advanceTimersByTimeAsync(999); expect(relay.echoes()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1); expect(relay.echoes()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(3999); expect(relay.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1); expect(relay.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('fast-retries only the verified socket, preserving owner identity and normal next-attempt backoff', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = fixture(backend, false, { reconnectBaseDelayMs: 1000 });
    try {
      f.runtime.start(); const old = f.cloud()[0]; old.open(); old.message(ready);
      old.autoPong = true; await vi.advanceTimersByTimeAsync(1000);
      old.terminate();
      await vi.advanceTimersByTimeAsync(124); expect(f.cloud()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); expect(f.cloud()).toHaveLength(2);
      const next = f.cloud()[1];
      expect(new URL(next.url).searchParams.get('clientId')).toBe(new URL(old.url).searchParams.get('clientId'));
      next.open(); next.message(ready); old.emit('pong', Buffer.from('clawket-1')); next.terminate();
      await vi.advanceTimersByTimeAsync(999); expect(f.cloud()).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(3001); expect(f.cloud()).toHaveLength(3);
    } finally { await f.runtime.stop(); random.mockRestore(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('retains fast-retry eligibility through a missed-pong recycle after an earlier confirmed round trip', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = fixture(backend, false, { reconnectBaseDelayMs: 1000 });
    try {
      f.runtime.start(); const old = f.cloud()[0]; old.autoPong = true; old.open(); old.message(ready);
      await vi.advanceTimersByTimeAsync(1000); old.autoPong = false;
      const untilTimeout = backend === 'openclaw' ? 2000 : 4000;
      await vi.advanceTimersByTimeAsync(untilTimeout); expect(old.terminated).toBe(true);
      await vi.advanceTimersByTimeAsync(124); expect(f.cloud()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); expect(f.cloud()).toHaveLength(2);
    } finally { await f.runtime.stop(); random.mockRestore(); expect(vi.getTimerCount()).toBe(0); }
  });
});


it('Hermes does not dispatch an untracked protocol ping during a transfer-triggered check', async () => {
  vi.useFakeTimers();
  const f = fixture('hermes', false, { defaultTimings: true });
  try {
    f.runtime.start(); const relay = f.cloud()[0]; relay.open();
    relay.message(control('relay.ready', { capabilities: [RELAY_OWNER_PONG_CAPABILITY, RELAY_TRANSFER_CAPABILITY] }));
    await vi.advanceTimersByTimeAsync(14_000);
    relay.message(control('relay.transfer-start', { bytes: RELAY_TRANSFER_MIN_BYTES }));
    relay.message('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    await vi.advanceTimersByTimeAsync(0); expect(relay.echoes()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(relay.pingCount).toBe(0); expect(relay.terminated).toBe(false);
    relay.message(control('relay.owner-pong', { nonce: relay.echoes()[0].payload.nonce }));
    relay.autoPong = true;
    await vi.advanceTimersByTimeAsync(14_999); expect(relay.pingCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(relay.pingCount).toBe(1);
    expect(relay.terminated).toBe(false);
  } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
});

describe.each(['openclaw', 'hermes'] as const)('%s active full-client cadence', backend => {
  const idleMs = backend === 'openclaw' ? 10_000 : 15_000;
  const presence = (count: number, extra = {}) => PREFIX + JSON.stringify({ event: 'client_count', count, ...extra });
  it('uses 5s only after trusted negotiated presence, and zero returns subsequent probes to idle cadence', async () => {
    vi.useFakeTimers(); const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.autoPong = true; relay.open(); relay.message(ready);
      relay.message(presence(1, { sourceClientId: 'forwarded' }));
      relay.message(presence(129));
      await vi.advanceTimersByTimeAsync(4000); expect(relay.pingCount).toBe(0);
      relay.message(presence(1));
      await vi.advanceTimersByTimeAsync(1000); expect(relay.pingCount).toBe(1);
      await vi.advanceTimersByTimeAsync(5000); expect(relay.pingCount).toBe(2);
      relay.message(presence(0));
      await vi.advanceTimersByTimeAsync(5000); expect(relay.pingCount).toBe(3);
      await vi.advanceTimersByTimeAsync(idleMs - 1); expect(relay.pingCount).toBe(3);
      await vi.advanceTimersByTimeAsync(1); expect(relay.pingCount).toBe(4);
      expect(relay.echoes()).toHaveLength(0);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('zero/flapping during an unanswered active probe never resets its 5s deadline', async () => {
    vi.useFakeTimers(); const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.open(); relay.message(ready); relay.message(presence(1));
      await vi.advanceTimersByTimeAsync(5000); expect(relay.pingCount).toBe(1);
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000); relay.message(presence(i % 2));
      }
      expect(relay.terminated).toBe(false); expect(relay.echoes()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1000); expect(relay.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('keeps old Relay presence at the original interval', async () => {
    vi.useFakeTimers(); const f = fixture(backend, false, { defaultTimings: true });
    try {
      f.runtime.start(); const relay = f.cloud()[0]; relay.autoPong = true; relay.open(); relay.message(presence(1));
      await vi.advanceTimersByTimeAsync(idleMs - 1); expect(relay.pingCount).toBe(0);
      await vi.advanceTimersByTimeAsync(1); expect(relay.pingCount).toBe(1);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });
});

it('applies active cadence independently to negotiated OpenClaw owner and secondary sockets', async () => {
  vi.useFakeTimers();
  const f = fixture('openclaw', true, { defaultTimings: true });
  try {
    f.runtime.start(); const owner = f.cloud()[0]; owner.autoPong = true; owner.open(); owner.message(ready);
    owner.message(control('client.sockets', { clients: ['00000000-0000-4000-8000-000000000001'] }));
    const channel = f.cloud()[1]; channel.autoPong = true; channel.open(); channel.message(ready);
    channel.message(PREFIX + JSON.stringify({ event: 'client_count', count: 1 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(owner.pingCount).toBe(1); expect(channel.pingCount).toBe(1);
    owner.message(control('client.sockets', { clients: [] }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(owner.pingCount).toBe(2); expect(channel.pingCount).toBe(1);
  } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
});
