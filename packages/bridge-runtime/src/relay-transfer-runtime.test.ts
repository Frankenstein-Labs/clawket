import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0; bufferedAmount = 0; terminated = false; autoPong = false;
    sent: string[] = []; pings: string[] = [];
    constructor(readonly url: string) { super(); state.sockets.push(this); }
    send(data: unknown) { this.sent.push(String(data)); }
    ping(data?: string) { this.pings.push(data ?? ''); if (this.autoPong) this.emit('pong', Buffer.from(data ?? '')); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.emit('close', code, Buffer.alloc(0)); }
    terminate() { this.terminated = true; this.close(1006); }
    open() { this.readyState = 1; this.emit('open'); }
    message(text: string) { this.emit('message', Buffer.from(text), false); }
  }
  return { default: Socket };
});
import { ClaudeRelay } from './claude-code/relay.js';
import { CodexRelay } from './codex/relay.js';
import { PiRelay } from './pi/relay.js';
import { BridgeRuntime } from './openclaw/runtime.js';
import { HermesRelayRuntime } from './hermes/relay.js';
import { RELAY_TRANSFER_CAPABILITY, RELAY_TRANSFER_MIN_BYTES } from './relay-transfer-lease.js';

const PREFIX = '__clawket_relay_control__:';
const control = (event: string, payload: object) => PREFIX + JSON.stringify({ type: 'control', event, payload });
const ready = control('relay.ready', { capabilities: ['relay.owner-pong.v1', RELAY_TRANSFER_CAPABILITY] });
type Backend = 'openclaw' | 'hermes' | 'codex' | 'claude' | 'pi';

function fixture(backend: Backend, channels = false) {
  const conversation = new EventEmitter();
  const base = { serverUrl: 'https://registry.test', relayUrl: 'wss://relay.test/ws', relaySecret: 'qa',
    instanceId: 'qa', displayName: 'qa', createdAt: '2026-09-28', updatedAt: '2026-09-28' };
  const runtime = backend === 'openclaw'
    ? new BridgeRuntime({ config: { ...base, gatewayId: 'gw_qa' }, gatewayUrl: 'ws://127.0.0.1:18789', clientChannels: channels })
    : backend === 'hermes'
      ? new HermesRelayRuntime({ config: { ...base, bridgeId: 'hbg_qa' }, bridgeUrl: 'ws://127.0.0.1:4319' })
      : new ({ codex: CodexRelay, claude: ClaudeRelay, pi: PiRelay }[backend])(
        { conversation, request: vi.fn(async () => ({})) } as never,
        { relayUrl: base.relayUrl, gatewayId: 'qa', relaySecret: 'qa' }, () => {});
  const cloud = () => state.sockets.filter(socket => String(socket.url).startsWith('wss:'));
  const sendLarge = (socket: any) => {
    const text = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES);
    if (backend === 'openclaw' || backend === 'hermes') {
      // Exercise the exact forwarding boundary shared by all local responses.
      (runtime as unknown as { sendFrame(socket: unknown, data: string, direction: string): boolean }).sendFrame(socket, text, 'relay_out');
    } else conversation.emit('update', { text });
  };
  return { runtime, cloud, sendLarge };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); state.sockets.length = 0; });

describe.each(['openclaw', 'hermes', 'codex', 'claude', 'pi'] as const)('%s large-frame liveness', backend => {
  it.each(['send', 'receive'] as const)('keeps a legitimate slow %s frame alive but closes at the absolute 90s bound', async direction => {
    vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const f = fixture(backend);
    try {
      f.runtime.start(); const socket = f.cloud()[0]; socket.open(); socket.message(ready);
      expect(new URL(String(socket.url)).searchParams.get('capabilities')).toContain(RELAY_TRANSFER_CAPABILITY);
      if (direction === 'send') f.sendLarge(socket);
      else socket.message(control('relay.transfer-start', { bytes: RELAY_TRANSFER_MIN_BYTES }));
      await vi.advanceTimersByTimeAsync(30_000); expect(socket.terminated).toBe(false);
      socket.message(control('relay.transfer-start', { bytes: RELAY_TRANSFER_MIN_BYTES }));
      await vi.advanceTimersByTimeAsync(59_999); expect(socket.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1); expect(socket.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('clears protection with a new exact pong and keeps subsequent misses bounded', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const f = fixture(backend);
    try {
      f.runtime.start(); const socket = f.cloud()[0]; socket.open(); socket.message(ready); f.sendLarge(socket);
      const cadence = backend === 'openclaw' ? 10_000 : 15_000;
      await vi.advanceTimersByTimeAsync(0);
      const echo = [...socket.sent].reverse().find((frame: string) => frame.startsWith(PREFIX) && frame.includes('relay.owner-ping'));
      expect(echo).toBeDefined();
      const nonce = JSON.parse(echo.slice(PREFIX.length)).payload.nonce;
      socket.message(control('relay.owner-pong', { nonce }));
      await vi.advanceTimersByTimeAsync(cadence + 10_000);
      expect(socket.terminated).toBe(true); // No unused 90s grace after the exact proof.
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('rechecks immediately after the full hinted UTF8 frame and does not retain idle grace', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const f = fixture(backend);
    try {
      f.runtime.start(); const socket = f.cloud()[0]; socket.open(); socket.message(ready);
      // Non-ASCII payload catches accidental JS string-length accounting.
      const frame = JSON.stringify({ type: 'req', id: 'qa', method: 'health', params: { note: '中'.repeat(50_000) } });
      socket.message(control('relay.transfer-start', { bytes: Buffer.byteLength(frame) }));
      await vi.advanceTimersByTimeAsync(25_000); expect(socket.terminated).toBe(false);
      socket.message(frame); await vi.advanceTimersByTimeAsync(0);
      expect(socket.sent.some((sent: string) => sent.includes('relay.owner-ping'))).toBe(true);
      await vi.advanceTimersByTimeAsync(4999); expect(socket.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1); expect(socket.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('does not grant a transfer allowance when the large send throws', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const f = fixture(backend);
    try {
      f.runtime.start(); const socket = f.cloud()[0]; socket.open(); socket.message(ready);
      vi.spyOn(socket, 'send').mockImplementationOnce(() => { throw new Error('send rejected'); });
      expect(() => f.sendLarge(socket)).toThrow('send rejected');
      await vi.advanceTimersByTimeAsync((backend === 'openclaw' ? 10_000 : 15_000) + 10_000);
      expect(socket.terminated).toBe(true);
    } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
  });
});

it('keeps OpenClaw secondary transfer leases independent of its healthy owner', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  const f = fixture('openclaw', true);
  try {
    f.runtime.start(); const owner = f.cloud()[0]; owner.autoPong = true; owner.open(); owner.message(ready);
    owner.message(control('client.sockets', { clients: ['11111111-1111-4111-8111-111111111111'] }));
    const channel = f.cloud()[1]; channel.open(); channel.message(ready);
    channel.message(control('relay.transfer-start', { bytes: RELAY_TRANSFER_MIN_BYTES }));
    await vi.advanceTimersByTimeAsync(89_999);
    expect(owner.terminated).toBe(false); expect(channel.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(owner.terminated).toBe(false); expect(channel.terminated).toBe(true);
  } finally { await f.runtime.stop(); expect(vi.getTimerCount()).toBe(0); }
});
