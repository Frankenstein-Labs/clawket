import { DirectWsTransport } from './direct-ws';
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

describe('DirectWsTransport', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disposes a retired native Upgrade without accepting its late direct handshake', () => {
    const old = new FakeWebSocket();
    old.close = jest.fn((code?: number, reason?: string) => {
      old.closeCalls.push([code, reason]);
      // Android has no native socket to close until Upgrade completes.
      old.readyState = old.readyState === 0 ? 2 : 3;
    });
    const current = new FakeWebSocket();
    const factory = jest.fn().mockReturnValueOnce(old).mockReturnValueOnce(current);
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      autoReadyOnFirstFrame: true,
      webSocketFactory: factory,
    });
    const messages = jest.fn();
    const opened = jest.fn();
    transport.onMessage(messages);
    transport.onOpen(opened);
    transport.connect();
    transport.reconnect();
    current.open();
    current.receive(JSON.stringify({ type: 'event', event: 'health' }));
    expect(transport.state).toBe('ready');
    messages.mockClear();

    old.open();
    old.receive(JSON.stringify({ type: 'event', event: 'health' }));
    old.serverClose({ code: 1006 });

    expect(old.closeCalls).toEqual([
      [undefined, undefined],
      [1000, 'retired_socket'],
    ]);
    expect(old.onopen).toBeNull();
    expect(messages).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe('ready');
    expect(transport.hasReceivedValidFrame).toBe(true);
    expect(current.closeCalls).toEqual([]);
    transport.disconnect();
  });

  it('resets backoff on the first valid frame, not on raw open or invalid JSON', () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      reconnectJitter: false,
      webSocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    });

    transport.connect();
    sockets[0].open();
    sockets[0].serverClose({ code: 1006 });
    jest.advanceTimersByTime(800);
    sockets[1].open();

    expect(transport.reconnectAttempt).toBe(1);
    sockets[1].receive('not-json');
    expect(transport.reconnectAttempt).toBe(1);
    expect(transport.hasReceivedValidFrame).toBe(false);

    sockets[1].receive(JSON.stringify({ type: 'event', event: 'health' }));
    expect(transport.reconnectAttempt).toBe(0);
    expect(transport.hasReceivedValidFrame).toBe(true);
    expect(transport.state).toBe('handshaking');
  });

  it('can enter ready on first valid frame when configured by an adapter', () => {
    const socket = new FakeWebSocket();
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      autoReadyOnFirstFrame: true,
      webSocketFactory: () => socket,
    });
    transport.connect();
    socket.open();
    expect(transport.state).toBe('handshaking');

    socket.receive(JSON.stringify({ type: 'event', event: 'health' }));

    expect(transport.state).toBe('ready');
  });

  it('allows an adapter to define a backend-neutral valid-frame predicate', () => {
    const socket = new FakeWebSocket();
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      autoReadyOnFirstFrame: true,
      isValidFrame: (frame) => frame === 'READY',
      webSocketFactory: () => socket,
    });
    transport.connect();
    socket.open();
    socket.receive('{}');
    expect(transport.state).toBe('handshaking');
    socket.receive('READY');
    expect(transport.state).toBe('ready');
  });

  it('recycles a socket if no valid frame arrives within the configured timeout', () => {
    const socket = new FakeWebSocket();
    const errors: string[] = [];
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      firstFrameTimeoutMs: 25,
      reconnectJitter: false,
      webSocketFactory: () => socket,
    });
    transport.onError((error) => errors.push(error.code));
    transport.connect();
    socket.open();
    socket.receive('invalid');

    jest.advanceTimersByTime(25);

    expect(errors).toEqual(['first_frame_timeout']);
    expect(socket.closeCalls).toHaveLength(1);
    expect(transport.state).toBe('reconnecting');
  });

  it('does not reconnect after an explicit disconnect', () => {
    const socket = new FakeWebSocket();
    const factory = jest.fn(() => socket);
    const transport = new DirectWsTransport({
      url: 'ws://bridge.example/ws',
      reconnectJitter: false,
      webSocketFactory: factory,
    });
    transport.connect();
    socket.open();
    transport.disconnect(1000, 'switch connection');
    jest.advanceTimersByTime(60_000);

    expect(transport.state).toBe('closed');
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it('reports fixed current-socket error and close metadata without peer text', () => {
    const sockets: FakeWebSocket[] = [];
    const diagnostic = jest.fn();
    const transport = new DirectWsTransport({ url: 'ws://private.example/?token=private',
      onDiagnostic: diagnostic, webSocketFactory: () => { const socket = new FakeWebSocket(); sockets.push(socket); return socket; },
    });
    transport.connect();
    const staleError = sockets[0].onerror;
    const staleClose = sockets[0].onclose;
    jest.advanceTimersByTime(50);
    sockets[0].onerror?.({ message: 'private native URL credential' });
    sockets[0].onerror?.({ message: 'another private message' });
    sockets[0].serverClose({ code: 1006, reason: 'private peer close body' });
    expect(diagnostic.mock.calls.map(([value]) => value)).toEqual([
      { event: 'error', phase: 'connecting', code: 'ws_error', elapsed_ms: 50 },
      { event: 'close', phase: 'connecting', code: 'unknown', close_code: 1006, elapsed_ms: 50 },
    ]);
    transport.reconnect();
    staleError?.({ message: 'late private error' });
    staleClose?.({ code: 4001, reason: 'old socket' });
    expect(diagnostic).toHaveBeenCalledTimes(2);
    transport.disconnect();
  });

  it('observes open timeout separately from an actual close without changing retry', () => {
    const diagnostic = jest.fn();
    const socket = new FakeWebSocket();
    const transport = new DirectWsTransport({ url: 'ws://bridge.example/ws',
      openTimeoutMs: 25, onDiagnostic: diagnostic, webSocketFactory: () => socket,
    });
    transport.connect();
    jest.advanceTimersByTime(25);
    expect(diagnostic).toHaveBeenCalledWith({ event: 'error', phase: 'connecting', code: 'ws_connect_timeout', elapsed_ms: 25 });
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe('reconnecting');
    transport.disconnect();
  });

  it('does not let a diagnostic callback prevent retirement or schedule a second retry', () => {
    const factory = jest.fn(() => new FakeWebSocket());
    const transport = new DirectWsTransport({ url: 'ws://bridge.example/ws', reconnectJitter: false,
      onDiagnostic: () => { throw new Error('observer failed'); }, webSocketFactory: factory,
    });
    transport.connect();
    const socket = factory.mock.results[0].value;
    expect(() => socket.serverClose({ code: 1006 })).not.toThrow();
    expect(transport.state).toBe('reconnecting');
    jest.advanceTimersByTime(800);
    expect(factory).toHaveBeenCalledTimes(2);
    transport.disconnect();
  });

});
