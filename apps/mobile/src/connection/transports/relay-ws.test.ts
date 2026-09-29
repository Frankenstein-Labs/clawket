import {
  FRAME_TOO_LARGE_CLOSE_CODE,
  FRAME_TOO_LARGE_ERROR_CODE,
  WEBSOCKET_FRAME_LIMIT_BYTES,
  WebSocketFrameTooLargeError,
} from './frame-limit';
import { RELAY_CLIENT_PONG_CAPABILITY, RelayWsTransport } from './relay-ws';
import { RELAY_CLIENT_PING_CAPABILITY } from '../protocol/relay-control';
import type { WebSocketCloseEventLike, WebSocketLike } from './types';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: { message?: string; type?: string }) => void) | null = null;
  onclose: ((event?: WebSocketCloseEventLike) => void) | null = null;
  readonly sent: unknown[] = [];
  readonly closeCalls: Array<[number | undefined, string | undefined]> = [];

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push([code, reason]);
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(data: unknown): void {
    this.onmessage?.({ data });
  }

  serverClose(event: WebSocketCloseEventLike = {}): void {
    this.readyState = 3;
    this.onclose?.(event);
  }
}

// Mirrors Android RN: close while native Upgrade is pending is not cancellation.
class DeferredNativeSocket extends FakeWebSocket {
  nativeCloses = 0;
  throwOnOpenedClose = false;

  override close(code?: number, reason?: string): void {
    this.closeCalls.push([code, reason]);
    if (this.readyState === 0) { this.readyState = 2; return; }
    if (this.readyState === 1) {
      if (this.throwOnOpenedClose) throw new Error('private native failure');
      this.nativeCloses += 1;
      this.readyState = 3;
    }
  }
}

describe('RelayWsTransport', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['disconnect', 'reconnect', 'open-timeout'] as const)(
    'closes only a retired connecting native socket if Upgrade arrives after %s', (retire) => {
      const sockets: DeferredNativeSocket[] = [];
      const transport = new RelayWsTransport({
        url: 'wss://relay.example/ws', reconnectJitter: false, openTimeoutMs: 25,
        webSocketFactory: () => { const socket = new DeferredNativeSocket(); sockets.push(socket); return socket; },
      });
      const opened = jest.fn(); const retired = jest.fn(); const messages = jest.fn();
      transport.onOpen(opened); transport.onSocketRetired(retired); transport.onMessage(messages);
      transport.connect();
      const old = sockets[0];
      if (retire === 'disconnect') transport.disconnect();
      else if (retire === 'reconnect') transport.reconnect();
      else { jest.advanceTimersByTime(25); jest.advanceTimersByTime(800); }
      expect(old.readyState).toBe(2);
      expect(old.nativeCloses).toBe(0);
      const cleanup = old.onopen;
      const replacement = sockets[1];
      if (replacement) { replacement.open(); transport.markReady(); }
      const state = transport.state; const attempt = transport.reconnectAttempt;
      const openCount = opened.mock.calls.length;
      const retiredCount = retired.mock.calls.length;
      const factoryCount = sockets.length;
      old.open();
      expect(old.nativeCloses).toBe(1);
      expect(old.closeCalls).toHaveLength(2);
      expect(old.onopen).toBeNull();
      old.receive('retired-payload'); old.serverClose({ code: 1006 }); cleanup?.();
      expect(old.closeCalls).toHaveLength(2);
      expect(messages).not.toHaveBeenCalled();
      expect(transport.state).toBe(state);
      expect(transport.reconnectAttempt).toBe(attempt);
      expect(opened).toHaveBeenCalledTimes(openCount);
      expect(retired).toHaveBeenCalledTimes(retiredCount);
      expect(sockets).toHaveLength(factoryCount);
      if (replacement) {
        expect(replacement.readyState).toBe(1);
        expect(replacement.closeCalls).toHaveLength(0);
        expect(replacement.sent).toEqual([]);
        transport.send('current-payload');
        expect(replacement.sent).toEqual(['current-payload']);
      }
      transport.disconnect();
    },
  );

  it('isolates a throwing late-open disposal from the current ready connection', () => {
    const sockets: DeferredNativeSocket[] = [];
    const transport = new RelayWsTransport({ url: 'wss://relay.example/ws',
      webSocketFactory: () => { const socket = new DeferredNativeSocket(); sockets.push(socket); return socket; },
    });
    transport.connect(); const old = sockets[0]; transport.reconnect();
    sockets[1].open(); transport.markReady(); old.throwOnOpenedClose = true;
    expect(() => old.open()).not.toThrow();
    expect(old.onopen).toBeNull();
    expect(transport.state).toBe('ready');
    expect(sockets[1].closeCalls).toEqual([]);
    transport.disconnect();
  });

  it.each(['manual', 'remote', 'handshake', 'heartbeat'] as const)(
    'retires each socket once on %s replacement, including callbacks arriving late', (cause) => {
      const sockets: FakeWebSocket[] = [];
      const transport = new RelayWsTransport({
        url: 'wss://relay.example/ws', handshakeTimeoutMs: 25,
        tickIntervalMs: 10, missedTickTolerance: 3, reconnectJitter: false,
        webSocketFactory: () => { const socket = new FakeWebSocket(); sockets.push(socket); return socket; },
      });
      const retired = jest.fn();
      transport.onSocketRetired(retired);
      transport.connect();
      const socket = sockets[0];
      const lateClose = socket.onclose;
      socket.open();
      if (cause !== 'handshake') transport.markReady();
      if (cause === 'manual') transport.reconnect();
      else if (cause === 'remote') socket.serverClose({ code: 1012 });
      else jest.advanceTimersByTime(cause === 'handshake' ? 25 : 30);
      expect(retired).toHaveBeenCalledTimes(1);
      lateClose?.({ code: 1006 });
      expect(retired).toHaveBeenCalledTimes(1);
      transport.disconnect();
    },
  );

  it('does not reset reconnect backoff until the adapter confirms ready', () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      reconnectJitter: false,
      webSocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    transport.connect();
    sockets[0].open();
    expect(transport.state).toBe('handshaking');
    expect(transport.reconnectAttempt).toBe(0);

    sockets[0].serverClose({ code: 1012, reason: 'restart' });
    expect(transport.state).toBe('reconnecting');
    expect(transport.reconnectAttempt).toBe(1);

    jest.advanceTimersByTime(800);
    sockets[1].open();
    expect(transport.state).toBe('handshaking');
    expect(transport.reconnectAttempt).toBe(1);

    transport.markReady();
    expect(transport.state).toBe('ready');
    expect(transport.reconnectAttempt).toBe(0);
  });

  it('answers only ticks that negotiate relay.client-pong.v1', () => {
    const socket = new FakeWebSocket();
    const received: unknown[] = [];
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      webSocketFactory: () => socket,
    });
    transport.onMessage((frame) => received.push(frame));
    transport.connect();
    socket.open();

    socket.receive(JSON.stringify({ type: 'tick', ts: 12, extra: 'allowed' }));
    socket.receive(JSON.stringify({
      type: 'tick',
      ts: 13,
      ack: RELAY_CLIENT_PONG_CAPABILITY,
      futureField: { ok: true },
    }));
    socket.receive(JSON.stringify({
      type: 'tick',
      ts: '14',
      ack: RELAY_CLIENT_PONG_CAPABILITY,
    }));

    expect(socket.sent).toEqual([JSON.stringify({ type: 'pong', ts: 13 })]);
    expect(received).toHaveLength(3);
    expect(transport.advertisedCapabilities).toEqual([RELAY_CLIENT_PONG_CAPABILITY, RELAY_CLIENT_PING_CAPABILITY, 'relay.transfer-hint.v1']);
  });

  it('accepts exactly 8 MiB outbound and rejects a larger frame before send', () => {
    const socket = new FakeWebSocket();
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      webSocketFactory: () => socket,
    });
    transport.connect();
    socket.open();
    const atLimit = 'a'.repeat(WEBSOCKET_FRAME_LIMIT_BYTES);
    const overLimit = `${atLimit}b`;

    transport.send(atLimit);
    expect(() => transport.send(overLimit)).toThrow(WebSocketFrameTooLargeError);
    expect(socket.sent).toEqual([atLimit]);
  });

  it('closes an oversized inbound frame with the stable wire error', () => {
    const socket = new FakeWebSocket();
    const errors: string[] = [];
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      reconnectJitter: false,
      webSocketFactory: () => socket,
    });
    transport.onError((error) => errors.push(error.code));
    transport.connect();
    socket.open();

    socket.receive('a'.repeat(WEBSOCKET_FRAME_LIMIT_BYTES + 1));

    expect(errors).toEqual([FRAME_TOO_LARGE_ERROR_CODE]);
    expect(socket.closeCalls).toContainEqual([
      FRAME_TOO_LARGE_CLOSE_CODE,
      FRAME_TOO_LARGE_ERROR_CODE,
    ]);
    expect(transport.state).toBe('reconnecting');
  });

  it('recycles a socket whose handshake never becomes ready', () => {
    const socket = new FakeWebSocket();
    const errors: string[] = [];
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      handshakeTimeoutMs: 25,
      reconnectJitter: false,
      webSocketFactory: () => socket,
    });
    transport.onError((error) => errors.push(error.code));
    transport.connect();
    socket.open();

    jest.advanceTimersByTime(25);

    expect(errors).toEqual(['challenge_timeout']);
    expect(socket.closeCalls).toHaveLength(1);
    expect(transport.state).toBe('reconnecting');
  });

  it('recycles a ready socket after the negotiated heartbeat goes stale', () => {
    const socket = new FakeWebSocket();
    const errors: string[] = [];
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      tickIntervalMs: 10,
      missedTickTolerance: 2,
      reconnectJitter: false,
      webSocketFactory: () => socket,
    });
    transport.onError((error) => errors.push(error.code));
    transport.connect();
    socket.open();
    transport.markReady();

    jest.advanceTimersByTime(15);
    socket.receive(JSON.stringify({ type: 'tick', ts: 1 }));
    jest.advanceTimersByTime(19);
    expect(transport.state).toBe('ready');

    jest.advanceTimersByTime(6);
    expect(errors).toContain('heartbeat_timeout');
    expect(transport.state).toBe('reconnecting');
  });

  it('treats unknown close codes as reconnectable transport failures', () => {
    const socket = new FakeWebSocket();
    const transport = new RelayWsTransport({
      url: 'wss://relay.example/ws',
      reconnectJitter: false,
      webSocketFactory: () => socket,
    });
    transport.connect();
    socket.open();
    socket.serverClose({ code: 4999, reason: 'future-code' });

    expect(transport.state).toBe('reconnecting');
    expect(transport.reconnectAttempt).toBe(1);
  });
});
