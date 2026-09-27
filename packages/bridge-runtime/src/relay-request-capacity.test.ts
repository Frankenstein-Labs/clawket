import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    static OPEN = 1; readyState = 1; bufferedAmount = 0;
    send = vi.fn(); ping = vi.fn(); terminate = vi.fn(() => this.emit('close', 1006));
    constructor() { super(); state.sockets.push(this); }
  }
  return { default: Socket };
});
import { ClaudeRelay } from './claude-code/relay.js';
import { CodexRelay } from './codex/relay.js';
import { PiRelay } from './pi/relay.js';
import { LocalModelRelay } from './local-model/relay.js';
afterEach(() => { vi.useRealTimers(); state.sockets.length = 0; });

describe.each([['Claude', ClaudeRelay], ['Codex', CodexRelay], ['Pi', PiRelay], ['local model', LocalModelRelay]] as const)('%s relay capacity', (_name, Relay) => {
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
      socket.emit('pong');
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
        socket.emit('pong');
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
      socket.emit('pong'); // A late event from the closed socket cannot rescue its replacement.
      await vi.advanceTimersByTimeAsync(15_000);
      expect(replacement.terminate).toHaveBeenCalledTimes(1);
    } finally { relay.stop(); }
  });

});
