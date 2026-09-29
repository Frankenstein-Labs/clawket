import { buildRelayClientWsUrl, RELAY_CLIENT_CAPABILITIES, RELAY_CLIENT_PING_CAPABILITY, RELAY_CONTROL_PREFIX } from '../protocol/relay-control';
import { setTransportAppActive } from './foreground';
import { RelayWsTransport } from './relay-ws';
import type { WebSocketCloseEventLike, WebSocketLike } from './types';

class Socket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event?: WebSocketCloseEventLike) => void) | null = null;
  sent: string[] = [];
  send = jest.fn((data: unknown) => { this.sent.push(String(data)); });
  close = jest.fn(() => { this.readyState = 3; });
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: unknown) { this.onmessage?.({ data }); }
}

const control = (event: string, payload: unknown) => `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event, payload })}`;
const ready = () => control('relay.ready', { capabilities: [RELAY_CLIENT_PING_CAPABILITY] });
const pong = (nonce: string) => control('relay.client-pong', { nonce });
const nonceOf = (socket: Socket) => JSON.parse(socket.sent.filter(frame => frame.startsWith(RELAY_CONTROL_PREFIX)).at(-1)!.slice(RELAY_CONTROL_PREFIX.length)).payload.nonce as string;

describe('negotiated foreground Relay client round trips', () => {
  const transports: RelayWsTransport[] = [];
  beforeEach(() => { jest.useFakeTimers(); setTransportAppActive(true); });
  afterEach(() => { for (const transport of transports.splice(0)) transport.disconnect(); setTransportAppActive(true); jest.restoreAllMocks(); jest.useRealTimers(); });
  const setup = (negotiate = true, markReady = true) => {
    const sockets: Socket[] = [];
    const transport = new RelayWsTransport({ url: 'wss://relay.test/ws', reconnectJitter: false,
      tickIntervalMs: 30_000, webSocketFactory: () => { const socket = new Socket(); sockets.push(socket); return socket; } });
    transports.push(transport);
    transport.connect(); sockets[0].open();
    if (negotiate) sockets[0].receive(ready());
    if (markReady) transport.markReady();
    return { transport, sockets, socket: sockets[0] };
  };

  it.each(['gatewayId', 'bridgeId'] as const)('keeps raw socket capabilities conservative for %s', relayIdQueryParam => {
    const url = new URL(buildRelayClientWsUrl({ relayUrl: 'wss://relay.test', gatewayId: 'test', token: 'test', clientId: 'test', relayIdQueryParam }));
    expect(url.searchParams.get('capabilities')).toBe('relay.client-pong.v1');
    expect(url.searchParams.get(relayIdQueryParam)).toBe('test');
  });

  it.each(['gatewayId', 'bridgeId'] as const)('explicitly opts a full Gateway transport into all supported capabilities for %s', relayIdQueryParam => {
    const url = new URL(buildRelayClientWsUrl({ relayUrl: 'wss://relay.test', gatewayId: 'test', token: 'test', clientId: 'test', relayIdQueryParam,
      capabilities: RELAY_CLIENT_CAPABILITIES }));
    expect(url.searchParams.get('capabilities')).toBe('relay.client-pong.v1,relay.client-ping.v1,relay.transfer-hint.v1');
    expect(url.searchParams.get(relayIdQueryParam)).toBe('test');
  });

  it('waits for native ready and then sends one bounded nonce after five seconds', () => {
    const { transport, socket } = setup(true, false);
    jest.advanceTimersByTime(14_000);
    expect(socket.sent).toEqual([]);
    expect(transport.state).toBe('handshaking');
    transport.markReady();
    jest.advanceTimersByTime(4_999);
    expect(socket.sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(nonceOf(socket)).toMatch(/^[a-f0-9]{32}$/);
    expect(socket.sent[0].length).toBeLessThan(512);
    jest.advanceTimersByTime(4_999);
    expect(socket.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(transport.state).toBe('reconnecting');
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('does not postpone the next probe or its deadline on repeated readiness or ordinary traffic', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(4_000);
    transport.markReady();
    socket.receive(ready());
    socket.receive(JSON.stringify({ type: 'event', event: 'health', payload: {} }));
    jest.advanceTimersByTime(999);
    expect(socket.sent).toEqual([]);
    jest.advanceTimersByTime(1);
    const nonce = nonceOf(socket);
    for (let count = 0; count < 4; count += 1) {
      jest.advanceTimersByTime(1_000);
      transport.markReady();
      socket.receive(ready());
      socket.receive(JSON.stringify({ type: 'event', event: 'health', payload: {} }));
    }
    expect(nonceOf(socket)).toBe(nonce);
    expect(socket.sent).toHaveLength(1);
    jest.advanceTimersByTime(999);
    expect(socket.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(transport.state).toBe('reconnecting');
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('retains legacy silence behavior when the new capability is absent', () => {
    const { socket, transport } = setup(false);
    socket.receive(control('relay.ready', { capabilities: ['relay.frame-limit.v2'] }));
    jest.advanceTimersByTime(20_001);
    expect(socket.sent).toEqual([]);
    expect(transport.state).toBe('ready');
  });

  it('supports relay.ready arriving after native readiness without resetting an in-flight deadline', () => {
    const { socket, transport } = setup(false);
    socket.receive(ready());
    jest.advanceTimersByTime(5_000);
    const nonce = nonceOf(socket);
    socket.receive(ready()); transport.markReady();
    jest.advanceTimersByTime(5_000);
    expect(socket.sent.filter(frame => frame.startsWith(RELAY_CONTROL_PREFIX))).toHaveLength(1);
    expect(nonceOf(socket)).toBe(nonce);
    expect(transport.state).toBe('reconnecting');
  });

  it('does not let ordinary tick or business traffic hide a failed return path', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(5_000);
    jest.advanceTimersByTime(4_000);
    socket.receive(JSON.stringify({ type: 'tick', ts: 1, ack: 'relay.client-pong.v1' }));
    socket.receive(JSON.stringify({ type: 'event', event: 'codex.update', payload: {} }));
    jest.advanceTimersByTime(1_000);
    expect(transport.state).toBe('reconnecting');
  });

  it('accepts only the exact current nonce and consumes the echo without backend payload delivery', () => {
    const { socket, transport } = setup();
    const messages = jest.fn(); transport.onMessage(messages);
    jest.advanceTimersByTime(5_000);
    const nonce = nonceOf(socket);
    socket.receive(pong('f'.repeat(32) === nonce ? 'a'.repeat(32) : 'f'.repeat(32)));
    jest.advanceTimersByTime(4_000);
    socket.receive(pong(nonce));
    expect(messages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_001);
    expect(transport.state).toBe('ready');
    jest.advanceTimersByTime(3_999);
    expect(nonceOf(socket)).not.toBe(nonce);
  });

  it('handles a synchronous echo without leaving a deadline that closes the healthy socket', () => {
    const { socket, transport } = setup();
    socket.send.mockImplementation(data => { socket.sent.push(String(data)); socket.receive(pong(nonceOf(socket))); });
    jest.advanceTimersByTime(60_000);
    expect(transport.state).toBe('ready');
    expect(socket.sent).toHaveLength(12);
  });

  it('rejects an echo received after its monotonic deadline even when the timer callback has not run', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(5_000);
    const clock = jest.spyOn(globalThis.performance, 'now').mockReturnValue(10_001);
    socket.receive(pong(nonceOf(socket)));
    expect(transport.state).toBe('reconnecting');
    expect(socket.close).toHaveBeenCalledTimes(1);
    clock.mockRestore();
  });

  it('rejects a stale echo after deep sleep before the paused timer callback runs', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(5_000);
    jest.setSystemTime(Date.now() + 91_000);
    socket.receive(pong(nonceOf(socket)));
    expect(transport.state).toBe('reconnecting');
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('retires immediately if the client probe cannot be sent and never replays application writes', () => {
    const { socket, transport } = setup();
    const error = jest.fn(); transport.onError(error);
    socket.send.mockImplementation(() => { throw new Error('fixture'); });
    jest.advanceTimersByTime(5_000);
    expect(transport.state).toBe('reconnecting');
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'heartbeat_timeout' }));
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed or non-control capability announcements', () => {
    const { socket, transport } = setup(false);
    socket.receive(ready().replace('"control"', '"event"'));
    socket.receive(control('relay.ready', { capabilities: RELAY_CLIENT_PING_CAPABILITY }));
    socket.receive(`${RELAY_CONTROL_PREFIX}{`);
    jest.advanceTimersByTime(20_001);
    expect(socket.sent).toEqual([]);
    expect(transport.state).toBe('ready');
  });

  it('pauses pending checks in the background and resumes with a new nonce rather than a stale deadline', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(5_000);
    const firstNonce = nonceOf(socket);
    setTransportAppActive(false);
    jest.advanceTimersByTime(120_000);
    expect(socket.sent).toHaveLength(1); // No additional background probes.
    expect(socket.close).not.toHaveBeenCalled();
    setTransportAppActive(true);
    jest.advanceTimersByTime(5_000);
    expect(nonceOf(socket)).not.toBe(firstNonce);
    socket.receive(pong(firstNonce));
    jest.advanceTimersByTime(5_000);
    expect(transport.state).toBe('reconnecting');
  });

  it('does not arm checks for a socket whose handshake completes in the background', () => {
    setTransportAppActive(false);
    const { socket, transport } = setup();
    jest.advanceTimersByTime(60_000);
    expect(socket.sent).toEqual([]);
    expect(transport.state).toBe('ready');
    setTransportAppActive(true);
    jest.advanceTimersByTime(5_000);
    expect(socket.sent).toHaveLength(1);
  });

  it('sends a fresh probe before foreground health for an expired transfer, keeping its latch until exact confirmation', () => {
    const { socket, transport } = setup();
    socket.receive(control('relay.ready', { capabilities: [RELAY_CLIENT_PING_CAPABILITY, 'relay.transfer-hint.v1'] }));
    socket.receive(control('relay.transfer-start', { bytes: 128 * 1024 }));
    setTransportAppActive(false); jest.advanceTimersByTime(91_000);
    setTransportAppActive(true);
    expect(socket.sent).toHaveLength(1); // Synchronous, before coordinator's subsequent health request.
    expect(transport.getTransferGraceMs()).toBe(0);
    socket.receive(control('relay.transfer-start', { bytes: 128 * 1024 }));
    expect(transport.getTransferGraceMs()).toBe(0);
    // A newer frame also requires a newer probe; the first one cannot unlock it.
    socket.receive(pong(nonceOf(socket)));
    expect(transport.state).toBe('reconnecting');
  });

  it('allows a new large frame after the fresh foreground probe confirms the exhausted window', () => {
    const { socket, transport } = setup();
    socket.receive(control('relay.ready', { capabilities: [RELAY_CLIENT_PING_CAPABILITY, 'relay.transfer-hint.v1'] }));
    socket.receive(control('relay.transfer-start', { bytes: 128 * 1024 }));
    socket.receive('x'.repeat(128 * 1024));
    setTransportAppActive(false); jest.advanceTimersByTime(91_000); setTransportAppActive(true);
    socket.receive(pong(nonceOf(socket)));
    transport.send('x'.repeat(128 * 1024));
    expect(transport.getTransferGraceMs()).toBe(90_000);
  });

  it('rate limits repeated expired-window foreground probes without treating them as confirmation', () => {
    const { socket } = setup();
    socket.receive(control('relay.ready', { capabilities: [RELAY_CLIENT_PING_CAPABILITY, 'relay.transfer-hint.v1'] }));
    socket.receive(control('relay.transfer-start', { bytes: 128 * 1024 }));
    setTransportAppActive(false); jest.advanceTimersByTime(91_000); setTransportAppActive(true);
    setTransportAppActive(false); setTransportAppActive(true);
    expect(socket.sent).toHaveLength(1);
    jest.advanceTimersByTime(999); expect(socket.sent).toHaveLength(1);
    jest.advanceTimersByTime(1); expect(socket.sent).toHaveLength(2);
  });

  it('fences old socket callbacks, requires negotiation on the replacement and cancels pending state', () => {
    const { socket, sockets, transport } = setup();
    jest.advanceTimersByTime(5_000);
    const nonce = nonceOf(socket), late = socket.onmessage;
    transport.reconnect(); sockets[1].open(); transport.markReady();
    late?.({ data: ready() }); late?.({ data: pong(nonce) });
    jest.advanceTimersByTime(20_000);
    expect(sockets[1].sent).toEqual([]);
    expect(transport.state).toBe('ready');
    sockets[1].receive(ready());
    jest.advanceTimersByTime(5_000);
    sockets[1].receive(pong(nonce));
    jest.advanceTimersByTime(5_000);
    expect(transport.state).toBe('reconnecting');
  });

  it('disconnect removes lifecycle observers and never reconnects on a later foreground', () => {
    const { socket, transport } = setup();
    jest.advanceTimersByTime(5_000);
    transport.disconnect();
    setTransportAppActive(false); setTransportAppActive(true);
    jest.advanceTimersByTime(90_000);
    expect(socket.sent).toHaveLength(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe('closed');
  });

  it('an echo before native ready never completes the handshake or resets reconnect backoff', () => {
    const { socket, sockets, transport } = setup(true, false);
    socket.onclose?.({ code: 1006 });
    expect(transport.reconnectAttempt).toBe(1);
    jest.advanceTimersByTime(800); sockets[1].open();
    sockets[1].receive(ready()); sockets[1].receive(pong('a'.repeat(32)));
    expect(transport.state).toBe('handshaking');
    expect(transport.reconnectAttempt).toBe(1);
  });
});
