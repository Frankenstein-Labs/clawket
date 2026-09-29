import { RELAY_CLIENT_PING_CAPABILITY, RELAY_CONTROL_PREFIX, RELAY_TRANSFER_HINT_CAPABILITY } from '../protocol/relay-control';
import { setTransportAppActive } from './foreground';
import { RelayWsTransport } from './relay-ws';
import { RELAY_TRANSFER_MIN_BYTES } from './transfer-lease';
import type { WebSocketCloseEventLike, WebSocketLike } from './types';

class Socket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  onclose: ((event?: WebSocketCloseEventLike) => void) | null = null;
  sent: string[] = [];
  send = jest.fn((data: unknown) => { this.sent.push(String(data)); });
  close = jest.fn(() => { this.readyState = 3; });
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: unknown) { this.onmessage?.({ data }); }
}
const control = (event: string, payload: unknown) => `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event, payload })}`;
const hint = (bytes = RELAY_TRANSFER_MIN_BYTES) => control('relay.transfer-start', { bytes });
const nonceOf = (socket: Socket) => JSON.parse(socket.sent.filter(frame => frame.startsWith(RELAY_CONTROL_PREFIX)).at(-1)!.slice(RELAY_CONTROL_PREFIX.length)).payload.nonce as string;

describe('negotiated Relay large-frame protection', () => {
  const transports: RelayWsTransport[] = [];
  beforeEach(() => { jest.useFakeTimers(); setTransportAppActive(true); });
  afterEach(() => { for (const transport of transports.splice(0)) transport.disconnect(); setTransportAppActive(true); jest.restoreAllMocks(); jest.useRealTimers(); });
  const setup = (transfer = true, markReady = true) => {
    const sockets: Socket[] = [];
    const transport = new RelayWsTransport({ url: 'wss://relay.test/ws', reconnectJitter: false,
      webSocketFactory: () => { const socket = new Socket(); sockets.push(socket); return socket; } });
    transports.push(transport); transport.connect(); sockets[0].open();
    sockets[0].receive(control('relay.ready', { capabilities: [RELAY_CLIENT_PING_CAPABILITY, ...(transfer ? [RELAY_TRANSFER_HINT_CAPABILITY] : [])] }));
    if (markReady) transport.markReady();
    return { transport, sockets, socket: sockets[0] };
  };

  it.each(['outgoing', 'incoming'])('waits for a slow %s frame and clears grace only on its subsequent exact echo', direction => {
    const { transport, socket } = setup();
    if (direction === 'outgoing') transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    else socket.receive(hint());
    jest.advanceTimersByTime(25_000);
    expect(transport.state).toBe('ready');
    expect(transport.getTransferGraceMs()).toBe(65_000);
    if (direction === 'incoming') socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.getTransferGraceMs()).toBe(0);
    jest.advanceTimersByTime(9_999); expect(socket.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(transport.state).toBe('reconnecting');
  });

  it('keeps a newer frame protected when an earlier probe finally returns', () => {
    const { transport, socket } = setup();
    transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    jest.advanceTimersByTime(15_000); const earlierNonce = nonceOf(socket);
    jest.advanceTimersByTime(2_000); socket.receive(hint());
    socket.receive(control('relay.client-pong', { nonce: earlierNonce }));
    expect(transport.getTransferGraceMs()).toBe(73_000);
    jest.advanceTimersByTime(1_000);
    socket.receive(control('relay.client-pong', { nonce: earlierNonce }));
    expect(transport.getTransferGraceMs()).toBe(72_000);
    socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    jest.advanceTimersByTime(1_000);
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.getTransferGraceMs()).toBe(0);
  });

  it('an older-generation echo near expiry cannot add a fresh cadence beyond the 90-second budget', () => {
    const { transport, socket } = setup(); socket.receive(hint());
    jest.advanceTimersByTime(15_000); const nonce = nonceOf(socket);
    jest.advanceTimersByTime(74_500); socket.receive(hint());
    socket.receive(control('relay.client-pong', { nonce }));
    jest.advanceTimersByTime(499); expect(transport.state).toBe('ready');
    jest.advanceTimersByTime(1); expect(transport.state).toBe('reconnecting');
  });

  it('does not extend 90 seconds with repeated valid hints, large sends or business traffic', () => {
    const { transport, socket } = setup(); socket.receive(hint());
    for (let step = 0; step < 8; step += 1) {
      jest.advanceTimersByTime(10_000); socket.receive(hint());
      transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
      socket.receive(JSON.stringify({ type: 'tick', ts: Date.now() }));
    }
    jest.advanceTimersByTime(9_999); expect(socket.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(transport.state).toBe('reconnecting');
  });

  it('preserves the absolute budget across backgrounding and cannot renew an expired lease with hints', () => {
    const { transport, socket } = setup(); transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    jest.advanceTimersByTime(15_000); setTransportAppActive(false);
    jest.advanceTimersByTime(90_000); expect(socket.close).not.toHaveBeenCalled();
    setTransportAppActive(true);
    expect(transport.getTransferGraceMs()).toBe(0);
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    socket.receive(hint()); expect(transport.getTransferGraceMs()).toBe(90_000);
  });

  it('does not grant grace on send failure or an oversized attempted write', () => {
    const { transport, socket } = setup();
    socket.send.mockImplementationOnce(() => { throw new Error('fixture'); });
    expect(() => transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES))).toThrow('fixture');
    expect(transport.getTransferGraceMs()).toBe(0);
    expect(() => transport.send('x'.repeat(8 * 1024 * 1024 + 1))).toThrow();
    expect(transport.getTransferGraceMs()).toBe(0);
    jest.advanceTimersByTime(10_000); expect(transport.state).toBe('reconnecting');
  });

  it('ignores unnegotiated and malformed hints without forwarding them to the backend', () => {
    const legacy = setup(false); legacy.socket.receive(hint());
    legacy.transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    expect(legacy.transport.getTransferGraceMs()).toBe(0);
    const { transport, socket } = setup(); const messages = jest.fn(); transport.onMessage(messages);
    for (const bytes of [0, 131071, 8 * 1024 * 1024 + 1, 131072.5]) socket.receive(hint(bytes));
    socket.receive(control('relay.transfer-start', { bytes: '131072' }));
    expect(transport.getTransferGraceMs()).toBe(0); expect(messages).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000); expect(transport.state).toBe('reconnecting');
  });

  it('fences a retired socket and discards its remaining transfer grace', () => {
    const { transport, socket, sockets } = setup(); socket.receive(hint());
    const stale = socket.onmessage;
    transport.reconnect(); sockets[1].open(); transport.markReady();
    stale?.({ data: hint() });
    expect(transport.getTransferGraceMs()).toBe(0);
    expect(transport.state).toBe('ready');
  });

  it('protects an authenticated large handshake response, without declaring backend readiness', () => {
    const { transport, socket } = setup(true, false); socket.receive(hint());
    jest.advanceTimersByTime(30_000);
    expect(transport.state).toBe('handshaking'); expect(socket.sent).toEqual([]);
    socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    expect(transport.state).toBe('handshaking'); expect(socket.sent).toEqual([]);
    transport.markReady();
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.state).toBe('ready'); expect(transport.getTransferGraceMs()).toBe(0);
  });

  it('still times out an incomplete protected handshake within 90 seconds', () => {
    const { transport, socket } = setup(true, false); socket.receive(hint());
    jest.advanceTimersByTime(89_999); expect(transport.state).toBe('handshaking');
    socket.receive(hint()); jest.advanceTimersByTime(1);
    expect(transport.state).toBe('reconnecting');
  });

  it('does not retain an idle 90-second grace after an entire download has arrived', () => {
    const { transport, socket } = setup();
    socket.receive(hint());
    socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    expect(transport.getTransferGraceMs()).toBe(0);
    expect(nonceOf(socket)).toMatch(/^[a-f0-9]{32}$/);
    expect(transport.lastHeartbeatAt).toBeNull(); // Receiving the frame is not health.
    jest.advanceTimersByTime(4_999); expect(transport.state).toBe('ready');
    jest.advanceTimersByTime(1); expect(transport.state).toBe('reconnecting');
  });

  it('queues an upload confirmation immediately behind the large send and keeps its full bounded budget', () => {
    const { transport, socket } = setup(); const frame = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES);
    transport.send(frame);
    expect(socket.sent[0]).toBe(frame);
    expect(socket.sent[1]).toContain('relay.client-ping');
    jest.advanceTimersByTime(25_000);
    expect(transport.state).toBe('ready'); expect(transport.getTransferGraceMs()).toBe(65_000);
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.getTransferGraceMs()).toBe(0);
  });

  it('never treats completion of a concurrent download as confirmation of a queued upload', () => {
    const { transport, socket } = setup(); transport.send('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    const oldNonce = nonceOf(socket);
    jest.advanceTimersByTime(2_000); socket.receive(hint()); socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    expect(transport.getTransferGraceMs()).toBe(88_000);
    const currentNonce = nonceOf(socket); expect(currentNonce).not.toBe(oldNonce);
    socket.receive(control('relay.client-pong', { nonce: oldNonce }));
    expect(transport.getTransferGraceMs()).toBe(88_000);
    socket.receive(control('relay.client-pong', { nonce: currentNonce }));
    expect(transport.getTransferGraceMs()).toBe(0);
  });

  it('coalesces complete transfers to at most one probe per second and rejects the previous nonce', () => {
    const { transport, socket } = setup();
    socket.receive(hint()); socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES));
    const oldNonce = nonceOf(socket);
    for (let count = 0; count < 10; count += 1) { socket.receive(hint()); socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES)); }
    expect(socket.sent).toHaveLength(1);
    socket.receive(control('relay.client-pong', { nonce: oldNonce }));
    expect(transport.lastHeartbeatAt).toBeNull();
    jest.advanceTimersByTime(999); expect(socket.sent).toHaveLength(1);
    jest.advanceTimersByTime(1); expect(socket.sent).toHaveLength(2);
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.lastHeartbeatAt).not.toBeNull();
  });

  it('keeps protection if the hinted frame is incomplete, mismatched or only control traffic arrives', () => {
    const { transport, socket } = setup(); socket.receive(hint());
    socket.receive('x'.repeat(RELAY_TRANSFER_MIN_BYTES - 1));
    socket.receive(JSON.stringify({ type: 'tick', ts: Date.now() }));
    expect(socket.sent).toEqual([]);
    jest.advanceTimersByTime(15_000);
    socket.receive(control('relay.client-pong', { nonce: nonceOf(socket) }));
    expect(transport.getTransferGraceMs()).toBe(75_000);
  });
});
