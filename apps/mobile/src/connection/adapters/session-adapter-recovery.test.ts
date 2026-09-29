import type { AgentAdapter, ConnectionRecord } from '@clawket/agent-protocol';
import type { WebSocketLike, WebSocketCloseEventLike } from '../transports/types';
import { ClaudeCodeAdapter } from './claude-code';
import { CodexAdapter } from './codex';
import { PiAdapter } from './pi';
import { RELAY_CLIENT_CAPABILITIES, RELAY_CONTROL_PREFIX } from '../protocol/relay-control';

class Socket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  onclose: ((event?: WebSocketCloseEventLike) => void) | null = null;
  sent: string[] = [];
  send(data: unknown) { this.sent.push(String(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  reply(payload: unknown) {
    const request = JSON.parse(this.sent.at(-1)!);
    this.onmessage?.({ data: JSON.stringify({ type: 'res', id: request.id, ok: true, payload }) });
  }
  fail(code: string, message: string) {
    const request = JSON.parse(this.sent.at(-1)!);
    this.onmessage?.({ data: JSON.stringify({ type: 'res', id: request.id, ok: false, error: { code, message } }) });
  }
}

describe.each([
  ['codex', CodexAdapter], ['claude-code', ClaudeCodeAdapter], ['pi', PiAdapter],
] as const)('%s socket incarnation recovery', (backendKind, Adapter) => {
  let adapter: AgentAdapter;
  let sockets: Socket[];
  let urls: string[];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    sockets = [];
    urls = [];
    const record: ConnectionRecord = {
      id: 'connection', backendKind, transportKind: 'relay', label: 'Computer',
      url: 'wss://example.com/ws', createdAt: 1,
      relay: { gatewayId: 'gateway', clientToken: 'fixture', serverUrl: 'https://example.com' },
    };
    adapter = new Adapter(record, { webSocketFactory: url => {
      urls.push(url);
      const socket = new Socket(); sockets.push(socket); return socket;
    } });
  });
  afterEach(() => {
    adapter.disconnect(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
  });

  it('preserves an explicit authorization close reason for its recovery owner', async () => {
    const state = jest.fn(); adapter.on('state', state);
    const connected = adapter.connect(); sockets[0].open();
    sockets[0].reply({ backend: backendKind, models: [] }); await connected;
    sockets[0].readyState = 3; sockets[0].onclose?.({ code: 1008, reason: 'auth_rejected' });
    expect(state).toHaveBeenCalledWith('reconnecting', 'auth_rejected');
  });

  it('rejects an explicit auth handshake immediately and stops automatic socket retries', async () => {
    const connected = adapter.connect().catch(error => error); sockets[0].open();
    sockets[0].fail('unauthorized', 'Credentials need attention');
    await expect(connected).resolves.toMatchObject({ code: 'unauthorized' });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(1);
    expect(adapter.state).toBe('error');
  });

  it('preserves explicit health authorization failures for the owner without treating session permissions as disconnects', async () => {
    const connected = adapter.connect(); sockets[0].open(); sockets[0].reply({ backend: backendKind, models: [] });
    await connected;
    const session = adapter.listSessions().catch(error => error);
    sockets[0].fail('permission_denied', 'Session permission denied');
    await session;
    expect(adapter.state).toBe('ready');
    const health = adapter.probe().catch(error => error);
    sockets[0].fail('unauthorized', 'Credentials need attention');
    await expect(health).resolves.toMatchObject({ code: 'unauthorized' });
    expect(sockets).toHaveLength(1);
  });

  it('queries receipts only after positive negotiation and downgrades on an older peer', async () => {
    const connected = adapter.connect();
    sockets[0].open(); sockets[0].reply({ backend: backendKind, vision: false, model: 'fixture', models: [] });
    await connected;
    expect(adapter.capabilities.promptStatus).toBe(false);
    await expect(adapter.getPromptStatus!('session', 'key')).resolves.toEqual({ status: 'unknown' });
    expect(sockets[0].sent).toHaveLength(1);
    const fresh = adapter.probe(); sockets[0].reply({ backend: backendKind, promptStatus: true, models: [] }); await fresh;
    const receipt = adapter.getPromptStatus!('session', 'key');
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toMatchObject({ method: 'chat.promptStatus', params: { sessionKey: 'session', idempotencyKey: 'key' } });
    sockets[0].reply({ status: 'recorded', runId: 'recorded-run' });
    await expect(receipt).resolves.toEqual({ status: 'recorded', runId: 'recorded-run' });
    const older = adapter.probe(); sockets[0].reply({ backend: backendKind, models: [] }); await older;
    expect(adapter.capabilities.promptStatus).toBe(false);
  });

  it('rejects pending reads immediately at heartbeat retirement and cannot accept their late response', async () => {
    const connected = adapter.connect();
    sockets[0].open();
    sockets[0].reply({ backend: backendKind, vision: false, model: 'fixture', models: [] });
    await connected;
    await jest.advanceTimersByTimeAsync(89_900);
    let settled = false;
    const pending = adapter.listSessions().catch(error => { settled = true; return error; });
    const oldRequest = JSON.parse(sockets[0].sent.at(-1)!);
    const lateMessage = sockets[0].onmessage;
    await jest.advanceTimersByTimeAsync(100);
    expect(settled).toBe(true);
    await expect(pending).resolves.toMatchObject({ code: 'network' });

    await jest.advanceTimersByTimeAsync(600);
    sockets[1].open();
    sockets[1].reply({ backend: backendKind, vision: false, model: 'fixture', models: [] });
    await jest.advanceTimersByTimeAsync(0);
    expect(adapter.state).toBe('ready');
    let currentSettled = false;
    const current = adapter.listSessions().then(value => { currentSettled = true; return value; });
    lateMessage?.({ data: JSON.stringify({ type: 'res', id: oldRequest.id, ok: true, payload: [{ key: 'stale' }] }) });
    await Promise.resolve();
    expect(currentSettled).toBe(false);
    sockets[1].reply([]);
    await expect(current).resolves.toEqual([]);
    expect(sockets[1].sent.map(frame => JSON.parse(frame).method)).toEqual(['health', 'sessions.list']);
  });

  it('negotiates foreground client probes and retires pending native RPCs on a silent return path', async () => {
    const connected = adapter.connect(); sockets[0].open();
    expect(new URL(urls[0]).searchParams.get('capabilities')).toBe(RELAY_CLIENT_CAPABILITIES);
    sockets[0].onmessage?.({ data: `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event: 'relay.ready', payload: { capabilities: ['relay.client-ping.v1'] } })}` });
    sockets[0].reply({ backend: backendKind, models: [] }); await connected;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(sockets[0].sent.at(-1)).toContain('relay.client-ping');
    const pending = adapter.listSessions().catch(error => error);
    const oldRequest = JSON.parse(sockets[0].sent.at(-1)!);
    const lateMessage = sockets[0].onmessage;
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toMatchObject({ code: 'network' });
    expect(sockets[0].readyState).toBe(3);
    await jest.advanceTimersByTimeAsync(600);
    sockets[1].open(); sockets[1].reply({ backend: backendKind, models: [] });
    await jest.advanceTimersByTimeAsync(0);
    lateMessage?.({ data: JSON.stringify({ type: 'res', id: oldRequest.id, ok: true, payload: [{ key: 'stale' }] }) });
    expect(adapter.state).toBe('ready');
    expect(sockets[1].sent.map(frame => JSON.parse(frame).method)).toEqual(['health']);
  });

  it('allows a queued large prompt and health request to finish after 25 seconds without replay', async () => {
    const connected = adapter.connect(); sockets[0].open();
    const socket = sockets[0];
    socket.onmessage?.({ data: `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event: 'relay.ready', payload: { capabilities: ['relay.client-ping.v1', 'relay.transfer-hint.v1'] } })}` });
    socket.reply({ backend: backendKind, vision: true, models: [] }); await connected;
    let settled = false;
    const prompt = adapter.prompt('session', { text: 'x'.repeat(128 * 1024), idempotencyKey: 'exact-send' }).then(value => { settled = true; return value; });
    const request = socket.sent.filter(frame => frame.startsWith('{')).map(frame => JSON.parse(frame)).find(frame => frame.method === 'chat.send');
    const health = adapter.probe(5_000);
    const healthRequest = JSON.parse(socket.sent.at(-1)!);
    await jest.advanceTimersByTimeAsync(25_000);
    expect(settled).toBe(false); expect(adapter.state).toBe('ready');
    const ping = JSON.parse(socket.sent.filter(frame => frame.startsWith(RELAY_CONTROL_PREFIX)).at(-1)!.slice(RELAY_CONTROL_PREFIX.length));
    socket.onmessage?.({ data: `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event: 'relay.client-pong', payload: ping.payload })}` });
    await jest.advanceTimersByTimeAsync(2_000);
    socket.onmessage?.({ data: JSON.stringify({ type: 'res', id: request.id, ok: true, payload: { runId: 'native-run' } }) });
    socket.onmessage?.({ data: JSON.stringify({ type: 'res', id: healthRequest.id, ok: true, payload: { backend: backendKind, models: [] } }) });
    await expect(prompt).resolves.toEqual({ runId: 'native-run' }); await expect(health).resolves.toBe(true);
    expect(socket.sent.filter(frame => frame.startsWith('{')).map(frame => JSON.parse(frame).method)).toEqual(['health', 'chat.send', 'health']);
  });

  it('extends both initial health and outer connect while a negotiated large handshake response is pending', async () => {
    const connected = adapter.connect(); sockets[0].open(); const socket = sockets[0];
    const request = JSON.parse(socket.sent.at(-1)!);
    for (const [event, payload] of [
      ['relay.ready', { capabilities: ['relay.client-ping.v1', 'relay.transfer-hint.v1'] }],
      ['relay.transfer-start', { bytes: 128 * 1024 }],
    ] as const) socket.onmessage?.({ data: `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event, payload })}` });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(adapter.state).toBe('handshaking');
    socket.onmessage?.({ data: JSON.stringify({ type: 'res', id: request.id, ok: true, payload: { backend: backendKind, models: [] } }) });
    await expect(connected).resolves.toBeUndefined(); expect(adapter.state).toBe('ready');
  });

  it('rejects failed large prompt sends immediately without leaving a grace window or replaying', async () => {
    const connected = adapter.connect(); sockets[0].open(); const socket = sockets[0];
    socket.onmessage?.({ data: `${RELAY_CONTROL_PREFIX}${JSON.stringify({ type: 'control', event: 'relay.ready', payload: { capabilities: ['relay.client-ping.v1', 'relay.transfer-hint.v1'] } })}` });
    socket.reply({ backend: backendKind, models: [] }); await connected;
    const send = jest.spyOn(socket, 'send').mockImplementationOnce(() => { throw new Error('fixture send failure'); });
    await expect(adapter.prompt('session', { text: 'x'.repeat(128 * 1024), idempotencyKey: 'never-replay' })).rejects.toThrow('fixture send failure');
    await jest.advanceTimersByTimeAsync(20_000);
    expect(socket.readyState).toBe(3);
    expect(send).toHaveBeenCalledTimes(2); // one rejected write and one independent liveness probe
  });
});
