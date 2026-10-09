import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1; readyState = 1; bufferedAmount = 0;
    send = vi.fn(); ping = vi.fn(); terminate = vi.fn(() => this.emit('close', 1006));
    constructor(readonly url: string) { super(); state.sockets.push(this); }
  }
  return { default: Socket };
});
import { ClaudeRelay } from './claude-code/relay.js';
import { CodexRelay } from './codex/relay.js';
import { PiRelay } from './pi/relay.js';
import { RELAY_OWNER_PONG_CAPABILITY } from './relay-owner-pong.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); state.sockets.length = 0; });

describe.each([['Claude', ClaudeRelay], ['Codex', CodexRelay], ['Pi', PiRelay]] as const)('%s relay capacity', (_name, Relay) => {
  const prefix = '__clawket_relay_control__:';
  // Local-model timing is unchanged by this five-agent optimization.
  const firstEchoAt = _name === 'local model' ? 30_000 : 16_000;
  const echoWindowMs = _name === 'local model' ? 5000 : 4000;
  const subsequentEchoDelay = _name === 'local model' ? 30_000 : 15_000;
  const advertise = (socket: any) => socket.emit('message', prefix + JSON.stringify({ event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY] } }));
  const lastNonce = (socket: any): string => JSON.parse(socket.send.mock.calls.filter(([frame]: [string]) => frame.startsWith(prefix)).at(-1)![0].slice(prefix.length)).payload.nonce;
  const echo = (socket: any, nonce: string) => socket.emit('message', prefix + JSON.stringify({ event: 'relay.owner-pong', payload: { nonce } }));

  it('sends no application heartbeats while protocol pongs keep arriving', async () => {
    vi.useFakeTimers();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); advertise(socket);
      for (let i = 0; i < 12; i++) {
        await vi.advanceTimersByTimeAsync(15_000); socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? ''));
      }
      expect(socket.send).not.toHaveBeenCalled(); expect(socket.terminate).not.toHaveBeenCalled();
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('checks only after the first unanswered probe and retires at the bounded echo deadline', async () => {
    vi.useFakeTimers();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); advertise(socket);
      await vi.advanceTimersByTimeAsync(firstEchoAt - 1);
      expect(socket.ping).toHaveBeenCalledTimes(1); expect(socket.send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.send).toHaveBeenCalledTimes(1); expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(echoWindowMs - 1);
      expect(socket.send).toHaveBeenCalledTimes(1); expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.terminate).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('accepts a delayed current protocol pong during the echo window and cancels its deadline', async () => {
    vi.useFakeTimers();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); advertise(socket);
      await vi.advanceTimersByTimeAsync(firstEchoAt + echoWindowMs - 1);
      expect(socket.send).toHaveBeenCalledTimes(1);
      socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? '')); socket.ping.mockImplementation((nonce?: string) => socket.emit('pong', Buffer.from(nonce ?? '')));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socket.terminate).not.toHaveBeenCalled(); expect(socket.send).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('clears the first-miss echo deadline on stop without reconnecting', async () => {
    vi.useFakeTimers();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); advertise(socket);
      await vi.advanceTimersByTimeAsync(firstEchoAt); expect(socket.send).toHaveBeenCalledTimes(1);
      relay.stop(); expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000); expect(state.sockets).toHaveLength(1);
    } finally { relay.stop(); }
  });

  it('rescues missing protocol pongs using one current echo but rejects stale socket evidence', async () => {
    vi.useFakeTimers();
    const request = vi.fn();
    const relay = new Relay({ conversation: new EventEmitter(), request } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const old = state.sockets[0]; old.emit('open'); advertise(old);
      await vi.advanceTimersByTimeAsync(firstEchoAt);
      expect(old.terminate).not.toHaveBeenCalled(); const firstNonce = lastNonce(old);
      echo(old, firstNonce);
      await vi.advanceTimersByTimeAsync(subsequentEchoDelay);
      const nextNonce = lastNonce(old); expect(nextNonce).not.toBe(firstNonce);
      echo(old, firstNonce); expect(old.terminate).not.toHaveBeenCalled();
      old.emit('close', 1006); await vi.advanceTimersByTimeAsync(2_000);
      const replacement = state.sockets[1]; replacement.emit('open'); advertise(replacement);
      await vi.advanceTimersByTimeAsync(firstEchoAt);
      echo(old, lastNonce(replacement)); echo(replacement, nextNonce);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(replacement.terminate).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('still retires a one-way socket when ordinary requests arrive but neither pong returns', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => ({ ok: true }));
    const relay = new Relay({ conversation: new EventEmitter(), request } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); advertise(socket);
      await vi.advanceTimersByTimeAsync(firstEchoAt);
      const trafficCount = _name === 'local model' ? 4 : 3;
      for (let i = 0; i < trafficCount; i++) {
        socket.emit('message', JSON.stringify({ type: 'req', id: `live-${i}`, method: 'health' }));
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(socket.terminate).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(trafficCount);
      const controlFrames = socket.send.mock.calls.filter(([frame]: [string]) => frame.startsWith(prefix));
      expect(controlFrames).toHaveLength(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('rejects excess requests explicitly without dispatch, then recovers capacity after completion', async () => {
    const finish: Array<() => void> = [];
    const request = vi.fn(() => new Promise(resolve => finish.push(() => resolve({ ok: true }))));
    const relay = new Relay({ conversation: new EventEmitter(), request } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const socket = state.sockets[0];
      for (let i = 0; i < 17; i++) socket.emit('message', JSON.stringify({ type: 'req', id: `r${i}`, method: 'sessions.list' }));
      expect(request).toHaveBeenCalledTimes(16);
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'res', id: 'r16', ok: false,
        error: { code: 'BRIDGE_BUSY', message: 'The Bridge is handling other requests. Please retry.' } }));
      finish.splice(0).forEach(resolve => resolve()); await Promise.resolve(); await Promise.resolve();
      socket.emit('message', JSON.stringify({ type: 'req', id: 'next', method: 'health' }));
      expect(request).toHaveBeenCalledTimes(17);
    } finally { finish.splice(0).forEach(resolve => resolve()); relay.stop(); }
  });
  it('distinguishes a local heartbeat timeout from an unexplained transport close without logging credentials', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T00:00:00Z'));
    const log = vi.fn();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'private-id', relaySecret: 'private-secret' }, () => {}, log);
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open');
      socket.emit('message', '__clawket_relay_control__:' + JSON.stringify({ event: 'relay.ready' }));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket.ping).toHaveBeenCalledTimes(1);
      expect(socket.terminate).not.toHaveBeenCalled();
      socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? ''));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket.terminate).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('relay heartbeat delayed missedPongs=1'));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(socket.terminate).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('relay heartbeat timeout idleMs=60000 schedulerDelayMs=0 queuedBytes=0'));
      expect(log.mock.calls.flat().join(' ')).not.toMatch(/private-id|private-secret/);
    } finally { relay.stop(); }
  });
  it('recovers from one missed pong without dropping clients and resets the consecutive-miss budget', async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {}, log);
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open');
      socket.emit('message', '__clawket_relay_control__:' + JSON.stringify({ event: 'relay.ready' }));
      for (let repeat = 0; repeat < 3; repeat++) {
        await vi.advanceTimersByTimeAsync(30_000);
        expect(socket.terminate).not.toHaveBeenCalled();
        socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? ''));
      }
      expect(log).toHaveBeenCalledWith(expect.stringContaining('relay heartbeat recovered missedPongs=1'));
      expect(state.sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(45_000);
      expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket.terminate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(state.sockets).toHaveLength(2);
      const replacement = state.sockets[1]; replacement.emit('open');
      replacement.emit('message', '__clawket_relay_control__:' + JSON.stringify({ event: 'relay.ready' }));
      await vi.advanceTimersByTimeAsync(45_000);
      socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? '')); // A late event from the closed socket cannot rescue its replacement.
      await vi.advanceTimersByTimeAsync(15_000);
      expect(replacement.terminate).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); }
  });

});

describe.each([['Claude', ClaudeRelay], ['Codex', CodexRelay], ['Pi', PiRelay]] as const)('%s verified owner recovery', (_name, Relay) => {
  const ready = '__clawket_relay_control__:' + JSON.stringify({ event: 'relay.ready',
    payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY] } });

  it('retries one healthy incarnation promptly with the same owner identity and never repeats a write', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const request = vi.fn(async () => ({ runId: 'recorded-once' }));
    const relay = new Relay({ conversation: new EventEmitter(), request } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const old = state.sockets[0]; old.emit('open'); old.emit('message', ready);
      await vi.advanceTimersByTimeAsync(15_000); old.emit('pong', Buffer.from(old.ping.mock.calls.at(-1)?.[0] ?? ''));
      old.emit('message', JSON.stringify({ type: 'req', id: 'send-once', method: 'chat.send',
        params: { sessionKey: 'qa', text: 'once', idempotencyKey: 'once' } }));
      await Promise.resolve(); await Promise.resolve();
      old.emit('close', 1006);
      await vi.advanceTimersByTimeAsync(124); expect(state.sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); expect(state.sockets).toHaveLength(2);
      const next = state.sockets[1];
      expect(new URL(next.url).searchParams.get('clientId')).toBe(new URL(old.url).searchParams.get('clientId'));
      next.emit('open'); next.emit('message', ready);
      old.emit('pong', Buffer.from(old.ping.mock.calls.at(-1)?.[0] ?? '')); // A retired socket cannot grant its successor a fast retry.
      next.emit('close', 1006);
      await vi.advanceTimersByTimeAsync(1999); expect(state.sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1); expect(state.sockets).toHaveLength(3);
      expect(request).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); random.mockRestore(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('retains the lease retry delay after the one fast recovery attempt', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const old = state.sockets[0]; old.emit('open'); old.emit('message', ready);
      await vi.advanceTimersByTimeAsync(15_000); old.emit('pong', Buffer.from(old.ping.mock.calls.at(-1)?.[0] ?? '')); old.emit('close', 1006);
      await vi.advanceTimersByTimeAsync(1); expect(state.sockets).toHaveLength(2);
      const next = state.sockets[1]; next.emit('error', new Error('Unexpected server response: 409')); next.emit('close', 1006);
      await vi.advanceTimersByTimeAsync(1999); expect(state.sockets).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1); expect(state.sockets).toHaveLength(3);
    } finally { relay.stop(); random.mockRestore(); expect(vi.getTimerCount()).toBe(0); }
  });

  it.each([4001, 4010])('yields to replacement code %s even after verified health', async code => {
    vi.useFakeTimers();
    const relay = new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
    try {
      relay.start(); const old = state.sockets[0]; old.emit('open'); old.emit('message', ready);
      await vi.advanceTimersByTimeAsync(15_000); old.emit('pong', Buffer.from(old.ping.mock.calls.at(-1)?.[0] ?? '')); old.emit('close', code);
      await vi.advanceTimersByTimeAsync(60_000); expect(state.sockets).toHaveLength(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });
});

describe.each([['Claude', ClaudeRelay], ['Codex', CodexRelay], ['Pi', PiRelay]] as const)('%s presence-driven owner cadence', (name, Relay) => {
  const prefix = '__clawket_relay_control__:';
  const presence = (socket: any, count: number, extra = {}) => socket.emit('message', prefix + JSON.stringify({ event: 'client_count', count, ...extra }));
  const ready = (socket: any) => socket.emit('message', prefix + JSON.stringify({ event: 'relay.ready', payload: { capabilities: [RELAY_OWNER_PONG_CAPABILITY] } }));
  const create = () => {
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    return new Relay({ conversation: new EventEmitter(), request: vi.fn() } as never,
      { relayUrl: 'wss://example.test/ws', gatewayId: 'qa', relaySecret: 'qa' }, () => {});
  };
  it('uses trusted active presence without changing health', async () => {
    vi.useFakeTimers(); const relay = create();
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); ready(socket);
      presence(socket, 1, { sourceClientId: 'client' }); presence(socket, 129);
      await vi.advanceTimersByTimeAsync(4000); expect(socket.ping).not.toHaveBeenCalled();
      presence(socket, 1);
      await vi.advanceTimersByTimeAsync(name === 'local model' ? 11_000 : 1000);
      expect(socket.ping).toHaveBeenCalledTimes(1);
      socket.emit('pong', Buffer.from(socket.ping.mock.calls.at(-1)?.[0] ?? ''));
      await vi.advanceTimersByTimeAsync(name === 'local model' ? 15_000 : 5000);
      expect(socket.ping).toHaveBeenCalledTimes(2);
      expect(socket.send).not.toHaveBeenCalled();
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  it('preserves old Relay timing even when active presence is received', async () => {
    vi.useFakeTimers(); const relay = create();
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); presence(socket, 1);
      socket.emit('message', prefix + JSON.stringify({ event: 'relay.ready', payload: { capabilities: [] } }));
      await vi.advanceTimersByTimeAsync(14_999); expect(socket.ping).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); expect(socket.ping).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  if (name !== 'local model') it('resets presence on replacement and ignores late old-socket controls', async () => {
    vi.useFakeTimers(); const relay = create();
    try {
      relay.start(); const old = state.sockets[0]; old.emit('open'); ready(old); presence(old, 1);
      old.emit('close', 1006);
      await vi.advanceTimersByTimeAsync(2000);
      const current = state.sockets[1]; current.emit('open'); ready(current);
      presence(old, 1);
      await vi.advanceTimersByTimeAsync(14_999); expect(current.ping).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); expect(current.ping).toHaveBeenCalledTimes(1);
      expect(old.ping).not.toHaveBeenCalled();
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });

  if (name !== 'local model') it('does not postpone the active deadline when client counts flap to zero', async () => {
    vi.useFakeTimers(); const relay = create();
    try {
      relay.start(); const socket = state.sockets[0]; socket.emit('open'); ready(socket); presence(socket, 1);
      await vi.advanceTimersByTimeAsync(5000); expect(socket.ping).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(1000); presence(socket, i % 2); }
      expect(socket.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000); expect(socket.terminate).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); expect(vi.getTimerCount()).toBe(0); }
  });
});
