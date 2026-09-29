import { describe, expect, it, vi } from 'vitest';
import { RELAY_CLIENT_PING_V1_CAPABILITY, RELAY_FRAME_LIMIT_V2 } from '@clawket/shared';
import { policyForBackend } from '../backend-policy';
import { consumeClientHeartbeatControl } from './client-heartbeat';
import { sendRelayReady, serializeControlEnvelope } from './control';
import { RelayRuntime } from './runtime';
import { rehydrateSockets } from './storage';
import { CONTROL_PREFIX, type Env, type SocketAttachment } from './types';

class Socket {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  constructor(private attachment: SocketAttachment) {}
  deserializeAttachment() { return this.attachment; }
  serializeAttachment(value: SocketAttachment) { this.attachment = value; }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = WebSocket.CLOSED; }
}
const nonce = '0123456789abcdef0123456789abcdef';
const control = (event: string, payload: unknown = { nonce }) => serializeControlEnvelope({ type: 'control', event, payload });
const ping = control('relay.client-ping');
const pong = control('relay.client-pong');
const asWs = (socket: Socket) => socket as unknown as WebSocket;
function setup(backend = 'openclaw') {
  const owner = new Socket({ role: 'gateway', clientId: 'owner', connectedAt: 1 });
  const phone = new Socket({ role: 'client', clientId: 'phone', connectedAt: 2, authScope: 'full',
    credentialHash: 'test-hash', activeClient: true, lastPongAt: 100, pendingRequests: [['request', 99_000]],
    capabilities: [RELAY_CLIENT_PING_V1_CAPABILITY] });
  const state = { getWebSockets: () => [owner, phone], id: { toString: () => 'test' } } as unknown as DurableObjectState;
  const runtime = new RelayRuntime(state, {} as Env, policyForBackend(backend));
  rehydrateSockets(runtime);
  return { runtime, state, owner, phone };
}
const consume = (runtime: RelayRuntime, socket: Socket, text = ping, now = 1_000, binary = false) =>
  consumeClientHeartbeatControl(runtime, asWs(socket), binary ? new TextEncoder().encode(text).buffer : text, text, now);

describe('negotiated same-socket full-client heartbeat', () => {
  it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi', 'local-model'])('echoes %s without touching owner health or legacy ACK time', backend => {
    const { runtime, owner, phone } = setup(backend);
    const before = { ...phone.deserializeAttachment() };
    expect(consume(runtime, phone)).toBe(true);
    expect(phone.sent).toEqual([pong]);
    expect(owner.sent).toEqual([]);
    expect(runtime.gatewayLastActivityAt).toBe(1);
    expect(phone.deserializeAttachment()).toEqual({ ...before, lastClientPingAt: 1_000,
      heartbeatEchoBudget: { updatedAt: 1_000, creditMs: 3_000 } });
    expect(JSON.stringify(phone.deserializeAttachment())).not.toContain(nonce);
  });
  it('advertises only an explicitly negotiated full-client echo, preserving legacy ready bytes', () => {
    const { phone, owner } = setup();
    sendRelayReady(asWs(phone));
    expect(phone.sent).toEqual([serializeControlEnvelope({ type: 'control', event: 'relay.ready',
      payload: { capabilities: [RELAY_FRAME_LIMIT_V2, RELAY_CLIENT_PING_V1_CAPABILITY] } })]);
    for (const patch of [{ capabilities: [] }, { authScope: 'pairing' as const }, { backendSessionRetired: true as const }]) {
      const peer = new Socket({ ...phone.deserializeAttachment(), ...patch });
      sendRelayReady(asWs(peer));
      expect(peer.sent).toEqual([serializeControlEnvelope({ type: 'control', event: 'relay.ready', payload: { capabilities: [RELAY_FRAME_LIMIT_V2] } })]);
    }
    owner.serializeAttachment({ ...owner.deserializeAttachment(), capabilities: [RELAY_CLIENT_PING_V1_CAPABILITY] });
    sendRelayReady(asWs(owner));
    expect(owner.sent).toEqual([serializeControlEnvelope({ type: 'control', event: 'relay.ready', payload: { capabilities: [RELAY_FRAME_LIMIT_V2] } })]);
  });
  it('retains the rate budget and unrelated routing fields after hibernation', () => {
    const { runtime, state, phone } = setup();
    for (let index = 0; index < 4; index++) consume(runtime, phone);
    const restored = new RelayRuntime(state, {} as Env, policyForBackend('openclaw'));
    rehydrateSockets(restored);
    consume(restored, phone, ping, 1_999);
    expect(phone.sent).toEqual(Array(4).fill(pong));
    consume(restored, phone, ping, 2_000);
    expect(phone.sent).toEqual(Array(5).fill(pong));
    expect(phone.deserializeAttachment()).toMatchObject({ activeClient: true, credentialHash: 'test-hash',
      lastPongAt: 100, pendingRequests: [['request', 99_000]], lastClientPingAt: 2_000 });
  });
  it.each(['owner', 'channel', 'pairing', 'legacy-auth', 'legacy-cap', 'replaced', 'retired', 'closed'])('consumes without echoing/forwarding %s controls', kind => {
    const { runtime, phone, owner } = setup();
    let socket = phone;
    if (kind === 'owner' || kind === 'channel') {
      socket = owner;
      owner.serializeAttachment({ ...owner.deserializeAttachment(), authScope: 'full', capabilities: [RELAY_CLIENT_PING_V1_CAPABILITY],
        ...(kind === 'channel' ? { targetConnectionId: 'test-channel' } : {}) });
    }
    if (kind === 'pairing') phone.serializeAttachment({ ...phone.deserializeAttachment(), authScope: 'pairing' });
    if (kind === 'legacy-auth') phone.serializeAttachment({ ...phone.deserializeAttachment(), authScope: undefined });
    if (kind === 'legacy-cap') phone.serializeAttachment({ ...phone.deserializeAttachment(), capabilities: [] });
    if (kind === 'replaced') socket = new Socket({ ...phone.deserializeAttachment() });
    if (kind === 'retired') phone.serializeAttachment({ ...phone.deserializeAttachment(), backendSessionRetired: true });
    if (kind === 'closed') phone.close();
    expect(consume(runtime, socket)).toBe(true);
    expect([socket.sent, phone.sent, owner.sent]).toEqual([[], [], []]);
  });
  it.each([null, {}, [], { nonce: 123 }, { nonce: 'a'.repeat(31) }, { nonce: 'A'.repeat(32) },
    { nonce: 'g'.repeat(32) }, { nonce, padding: 'x'.repeat(512) },
    { nonce, padding: '😀'.repeat(110) }])('rejects malformed/oversized nonce envelopes %j', payload => {
    const { runtime, phone } = setup();
    expect(consume(runtime, phone, control('relay.client-ping', payload))).toBe(true);
    expect(phone.sent).toEqual([]);
    expect(phone.deserializeAttachment().lastClientPingAt).toBeUndefined();
  });
  it('reserves replies, whitespace variants, malformed JSON and binary frames but leaves unrelated application controls alone', () => {
    const { runtime, phone } = setup();
    for (const text of [pong, control(' relay.client-ping '), CONTROL_PREFIX + '{', ping.replace('"control"', '"event"')]) {
      expect(consume(runtime, phone, text)).toBe(true);
    }
    expect(consume(runtime, phone, ping, 1_000, true)).toBe(true);
    expect(phone.sent).toEqual([]);
    expect(consume(runtime, phone, control('client_pong'))).toBe(false);
    expect(consume(runtime, phone, '{"type":"req"}')).toBe(false);
  });
  it('fails closed when attachment persistence fails, without echoing or forwarding', () => {
    const { runtime, phone, owner } = setup();
    vi.spyOn(phone, 'serializeAttachment').mockImplementation(() => { throw new Error('test'); });
    expect(() => consume(runtime, phone)).not.toThrow();
    expect([phone.sent, owner.sent]).toEqual([[], []]);
  });
  it('keeps the durable budget when send fails, and does not infer success', () => {
    const { runtime, phone } = setup();
    const send = vi.spyOn(phone, 'send').mockImplementation(() => { throw new Error('test'); });
    for (let index = 0; index < 4; index++) expect(() => consume(runtime, phone)).not.toThrow();
    consume(runtime, phone, ping, 1_500);
    expect(send).toHaveBeenCalledTimes(4);
    expect(phone.deserializeAttachment().lastClientPingAt).toBe(1_000);
  });
  it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi'])('echoes distinct jitter-compressed %s client probes', backend => {
    const { runtime, phone } = setup(backend);
    const second = 'fedcba9876543210fedcba9876543210';
    consume(runtime, phone, ping, 1_800);
    consume(runtime, phone, control('relay.client-ping', { nonce: second }), 2_100);
    expect(phone.sent).toEqual([pong, control('relay.client-pong', { nonce: second })]);
    expect(phone.deserializeAttachment().lastPongAt).toBe(100);
  });
  it('fails closed on malformed credits without resetting the client allowance', () => {
    const { runtime, phone } = setup();
    phone.serializeAttachment({ ...phone.deserializeAttachment(),
      heartbeatEchoBudget: { updatedAt: 1_000, creditMs: NaN } });
    consume(runtime, phone, ping, 10_000);
    expect(phone.sent).toEqual([]);
  });
});
