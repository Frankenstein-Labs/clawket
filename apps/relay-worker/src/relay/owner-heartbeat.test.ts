import { describe, expect, it, vi } from 'vitest';
import { RELAY_OWNER_PONG_V1_CAPABILITY } from '@clawket/shared';
import { policyForBackend } from '../backend-policy';
import { CLIENT_CHANNELS } from './client-channels';
import { sendRelayReady, serializeControlEnvelope } from './control';
import { consumeOwnerHeartbeatControl } from './owner-heartbeat';
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
const ping = control('relay.owner-ping');
const pong = control('relay.owner-pong');
const asWs = (socket: Socket) => socket as unknown as WebSocket;

function setup(backend = 'openclaw') {
  const owner = new Socket({ role: 'gateway', clientId: 'owner', connectedAt: 1,
    capabilities: [CLIENT_CHANNELS, RELAY_OWNER_PONG_V1_CAPABILITY] });
  const phone = new Socket({ role: 'client', clientId: 'phone', diagnosticId: 'phone-socket', connectedAt: 2,
    authScope: 'full', activeClient: true, pendingRequests: [['phone-rpc', 99_000]] });
  const channel = new Socket({ role: 'gateway', clientId: 'owner', connectedAt: 3,
    targetConnectionId: 'phone-socket', capabilities: [RELAY_OWNER_PONG_V1_CAPABILITY] });
  const sockets = backend === 'openclaw' ? [owner, phone, channel] : [owner, phone];
  const state = { getWebSockets: () => sockets, id: { toString: () => 'test' } } as unknown as DurableObjectState;
  const runtime = new RelayRuntime(state, {} as Env, policyForBackend(backend));
  rehydrateSockets(runtime);
  return { runtime, state, owner, phone, channel };
}
const consume = (runtime: RelayRuntime, socket: Socket, text = ping, now = 1_000, binary = false) =>
  consumeOwnerHeartbeatControl(runtime, asWs(socket), binary ? new TextEncoder().encode(text).buffer : text, text, now);

describe('negotiated same-socket owner heartbeat', () => {
  it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi', 'local-model'])('echoes only the authenticated %s owner without routing or leasing effects', backend => {
    const { runtime, owner, phone } = setup(backend);
    expect(consume(runtime, owner)).toBe(true);
    expect(owner.sent).toEqual([pong]);
    expect(phone.sent).toEqual([]);
    expect(runtime.owner).toBeNull();
    expect(runtime.gatewayLastActivityAt).toBe(1);
    expect(JSON.stringify(owner.deserializeAttachment())).not.toContain(nonce);
    expect(phone.deserializeAttachment().pendingRequests).toEqual([['phone-rpc', 99_000]]);
  });
  it('echoes a current OpenClaw channel on the channel itself', () => {
    const { runtime, owner, phone, channel } = setup();
    expect(consume(runtime, channel)).toBe(true);
    expect(channel.sent).toEqual([pong]);
    expect(owner.sent).toEqual([]);
    expect(phone.sent).toEqual([]);
  });
  it('preserves rate limits, capability negotiation and routes after memory discard', () => {
    const { runtime, state, owner, phone } = setup();
    for (let index = 0; index < 4; index++) consume(runtime, owner);
    const restored = new RelayRuntime(state, {} as Env, policyForBackend('openclaw'));
    rehydrateSockets(restored);
    consume(restored, owner, ping, 1_999);
    expect(owner.sent).toEqual(Array(4).fill(pong));
    consume(restored, owner, ping, 2_000);
    expect(owner.sent).toEqual(Array(5).fill(pong));
    expect(restored.activeClientId).toBe('phone');
    expect(phone.deserializeAttachment().pendingRequests).toEqual([['phone-rpc', 99_000]]);
  });
  it.each(['client', 'pairing', 'legacy', 'replaced', 'orphan-channel', 'closed'])('does not echo or forward %s traffic', kind => {
    const { runtime, owner, phone, channel } = setup();
    let socket = owner;
    if (kind === 'client' || kind === 'pairing') {
      socket = phone;
      phone.serializeAttachment({ ...phone.deserializeAttachment(), capabilities: [RELAY_OWNER_PONG_V1_CAPABILITY],
        ...(kind === 'pairing' ? { authScope: 'pairing' } : {}) });
    }
    if (kind === 'legacy') owner.serializeAttachment({ ...owner.deserializeAttachment(), capabilities: [] });
    if (kind === 'replaced') socket = new Socket({ ...owner.deserializeAttachment() });
    if (kind === 'orphan-channel') { socket = channel; runtime.clients.clear(); }
    if (kind === 'closed') owner.close();
    expect(consume(runtime, socket)).toBe(true);
    expect(socket.sent).toEqual([]);
    expect(phone.sent).toEqual([]);
  });
  it.each([null, {}, [], { nonce: 123 }, { nonce: 'a'.repeat(31) }, { nonce: 'A'.repeat(32) }, { nonce: 'g'.repeat(32) },
    { nonce, padding: 'x'.repeat(512) }])('consumes a malformed/big reserved payload without a reply: %j', payload => {
    const { runtime, owner } = setup();
    expect(consume(runtime, owner, control('relay.owner-ping', payload))).toBe(true);
    expect(owner.sent).toEqual([]);
  });
  it.each([pong, control('relay.ready', { capabilities: [RELAY_OWNER_PONG_V1_CAPABILITY] }),
    CONTROL_PREFIX + '{"event":"relay.owner-ping",', control(' relay.owner-ping '),
    CONTROL_PREFIX + JSON.stringify({ type: 'req', event: 'relay.owner-ping', payload: { nonce } })])('consumes forged, malformed or wrong-type Relay controls', text => {
    const { runtime, owner, phone, channel } = setup();
    for (const socket of [owner, phone, channel]) expect(consume(runtime, socket, text)).toBe(true);
    expect([owner.sent, phone.sent, channel.sent]).toEqual([[], [], []]);
  });
  it('rejects binary heartbeat envelopes and does not affect normal application/control traffic', () => {
    const { runtime, owner } = setup();
    expect(consume(runtime, owner, ping, 1_000, true)).toBe(true);
    expect(owner.sent).toEqual([]);
    expect(consume(runtime, owner, '{"type":"event","event":"health"}')).toBe(false);
    expect(consume(runtime, owner, control('client_connected'))).toBe(false);
  });
  it('does not reply if attachment persistence fails', () => {
    const { runtime, owner } = setup();
    vi.spyOn(owner, 'serializeAttachment').mockImplementation(() => { throw new Error('attachment failed'); });
    expect(consume(runtime, owner)).toBe(true);
    expect(owner.sent).toEqual([]);
  });
  it.each(['echo_sent', 'attachment_failed', 'send_failed'] as const)('records only the local %s action of an authenticated current owner', outcome => {
    const { runtime, owner } = setup();
    const diagnosticId = '01234567-89ab-4def-8abc-0123456789ab';
    owner.serializeAttachment({ ...owner.deserializeAttachment(), diagnosticId });
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      if (outcome === 'attachment_failed') vi.spyOn(owner, 'serializeAttachment').mockImplementation(() => { throw new Error('private attachment failure'); });
      if (outcome === 'send_failed') vi.spyOn(owner, 'send').mockImplementation(() => { throw new Error('private send failure'); });
      consume(runtime, owner);
      const entries = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual({ scope: 'relay_worker', event: 'owner_heartbeat', ts: expect.any(String),
        diagnosticId, socketKind: 'owner', heartbeatOutcome: outcome, backend: 'openclaw', ownerConnected: true });
      expect(JSON.stringify(entries)).not.toContain(nonce);
      expect(JSON.stringify(entries)).not.toContain('private');
      expect(owner.sent).toEqual(outcome === 'echo_sent' ? [pong] : []);
    } finally { logs.mockRestore(); }
  });
  it('bounds rate-limit diagnostics across hibernation and never logs unauthenticated or malformed controls', () => {
    const { runtime, state, owner, phone } = setup();
    for (let index = 0; index < 4; index++) consume(runtime, owner);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      consume(runtime, owner, ping, 1_100);
      consume(runtime, owner, ping, 1_200);
      const restored = new RelayRuntime(state, {} as Env, policyForBackend('openclaw'));
      rehydrateSockets(restored);
      consume(restored, owner, ping, 1_300);
      consume(restored, phone, ping, 1_400);
      consume(restored, owner, control('relay.owner-ping', { nonce: 'private-invalid' }), 1_500);
      const entries = logs.mock.calls.map(([line]) => JSON.parse(String(line)))
        .filter(entry => entry.event === 'owner_heartbeat');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ heartbeatOutcome: 'rate_limited', socketKind: 'owner' });
      expect(JSON.stringify(entries)).not.toContain(nonce);
      expect(JSON.stringify(entries)).not.toContain('private');
      expect(owner.sent).toEqual(Array(4).fill(pong));
      expect(phone.sent).toEqual([]);
    } finally { logs.mockRestore(); }
  });
  it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi'])('echoes distinct jitter-compressed %s owner probes', backend => {
    const { runtime, owner } = setup(backend);
    const second = 'fedcba9876543210fedcba9876543210';
    consume(runtime, owner, ping, 1_800);
    consume(runtime, owner, control('relay.owner-ping', { nonce: second }), 2_100);
    expect(owner.sent).toEqual([pong, control('relay.owner-pong', { nonce: second })]);
  });
  it('retains a legacy timestamp budget across the first upgraded owner call', () => {
    const { runtime, owner } = setup();
    owner.serializeAttachment({ ...owner.deserializeAttachment(), lastOwnerPingAt: 1_000 });
    consume(runtime, owner, ping, 1_999);
    expect(owner.sent).toEqual([]);
    consume(runtime, owner, ping, 2_000);
    consume(runtime, owner, ping, 2_001);
    expect(owner.sent).toEqual([pong]);
    expect(owner.deserializeAttachment().heartbeatEchoBudget).toEqual({ updatedAt: 2_000, creditMs: 0 });
  });
  it('keeps a sent echo successful when diagnostic output throws', () => {
    const { runtime, owner } = setup();
    const logs = vi.spyOn(console, 'log').mockImplementation(() => { throw new Error('logger unavailable'); });
    try {
      expect(consume(runtime, owner)).toBe(true);
      expect(owner.sent).toEqual([pong]);
      expect(logs).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(logs.mock.calls[0][0]))).toMatchObject({ heartbeatOutcome: 'echo_sent' });
    } finally { logs.mockRestore(); }
  });
  it('advertises the echo capability only to opted-in owners and channels, preserving legacy ready bytes', () => {
    const { owner, phone, channel } = setup();
    phone.serializeAttachment({ ...phone.deserializeAttachment(), capabilities: [RELAY_OWNER_PONG_V1_CAPABILITY] });
    for (const socket of [owner, phone, channel]) sendRelayReady(asWs(socket));
    const ready = (caps: string[]) => control('relay.ready', { capabilities: caps });
    expect(owner.sent).toEqual([ready(['relay.frame-limit.v2', RELAY_OWNER_PONG_V1_CAPABILITY])]);
    expect(channel.sent).toEqual(owner.sent);
    expect(phone.sent).toEqual([ready(['relay.frame-limit.v2'])]);
    owner.serializeAttachment({ ...owner.deserializeAttachment(), capabilities: [] });
    sendRelayReady(asWs(owner));
    expect(owner.sent[1]).toBe(ready(['relay.frame-limit.v2']));
  });
});
