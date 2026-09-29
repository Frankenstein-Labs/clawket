import { describe, expect, it, vi } from 'vitest';
import { RELAY_TRANSFER_HINT_V1_CAPABILITY } from '@clawket/shared';
import { policyForBackend } from '../backend-policy';
import { RelayRuntime } from './runtime';
import { rehydrateSockets } from './storage';
import { sendRelayReady } from './control';
import { isReservedTransferControl, RELAY_TRANSFER_MIN_BYTES, sendRelayFrame, transferAwarePongTimeout, transferAwareHandshakeTimeout } from './transfer';
import { ensureHeartbeat, pruneExpiredAwaitingChallenges, pruneStaleHandshakeClients, reconcileGatewayLiveness } from './heartbeat';
import { CONTROL_PREFIX, RELAY_FRAME_MAX_BYTES, type Env, type SocketAttachment } from './types';

class Socket {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  closeCode: number | undefined;
  constructor(private attachment: SocketAttachment) {}
  deserializeAttachment() { return this.attachment; }
  serializeAttachment(value: SocketAttachment) { this.attachment = value; }
  send(value: string) { this.sent.push(value); }
  close(code?: number) { this.readyState = WebSocket.CLOSED; this.closeCode = code; }
}
const asWs = (socket: Socket) => socket as unknown as WebSocket;
const hint = (bytes: number) => CONTROL_PREFIX + JSON.stringify({ type: 'control', event: 'relay.transfer-start', payload: { bytes } });
function setup(backend = 'openclaw') {
  const owner = new Socket({ role: 'gateway', clientId: 'owner', connectedAt: 1, authScope: 'full',
    capabilities: [RELAY_TRANSFER_HINT_V1_CAPABILITY, 'bridge.client-sockets.v1'] });
  const phone = new Socket({ role: 'client', clientId: 'phone', connectedAt: 2, authScope: 'full',
    diagnosticId: 'phone-socket', activeClient: true, capabilities: [RELAY_TRANSFER_HINT_V1_CAPABILITY],
    lastPongAt: 10, pendingRequests: [['request', 9999]] });
  const channel = new Socket({ role: 'gateway', clientId: 'owner', targetConnectionId: 'phone-socket', connectedAt: 3,
    authScope: 'full', capabilities: [RELAY_TRANSFER_HINT_V1_CAPABILITY] });
  const state = { getWebSockets: () => backend === 'openclaw' ? [owner, phone, channel] : [owner, phone], id: { toString: () => 'test' } } as unknown as DurableObjectState;
  const runtime = new RelayRuntime(state, {} as Env, policyForBackend(backend));
  rehydrateSockets(runtime);
  return { runtime, state, owner, phone, channel };
}

describe('Relay-generated bounded-transfer hints', () => {
  it.each([true, false])('bounds server challenge and awaiting cleanup without response-ID state (new cap: %s)', negotiated => {
    const { runtime, phone } = setup();
    phone.serializeAttachment({ ...phone.deserializeAttachment(), challengeDeliveredAt: 1,
      capabilities: negotiated ? [RELAY_TRANSFER_HINT_V1_CAPABILITY] : [] });
    runtime.awaitingChallenge.set('phone', { clientId: 'phone', queuedAt: 1 });
    expect(transferAwareHandshakeTimeout(phone.deserializeAttachment(), 25_000)).toBe(negotiated ? 90_000 : 25_000);
    expect(transferAwareHandshakeTimeout(phone.deserializeAttachment(), 120_000)).toBe(120_000);
    pruneExpiredAwaitingChallenges(runtime, 25_002);
    expect(runtime.awaitingChallenge.has('phone')).toBe(negotiated);
    pruneStaleHandshakeClients(runtime, 25_002);
    expect(phone.closeCode).toBe(negotiated ? undefined : 4009);
    if (negotiated) {
      pruneStaleHandshakeClients(runtime, 90_002);
      expect(phone.closeCode).toBe(4009);
      expect(runtime.awaitingChallenge.has('phone')).toBe(false);
    }
  });
  it.each([true, false])('uses one effective Hermes owner deadline for cleanup and alarm scheduling (new cap: %s)', async negotiated => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(46_001);
      const { runtime, owner, state } = setup('hermes');
      if (!negotiated) owner.serializeAttachment({ ...owner.deserializeAttachment(), capabilities: [] });
      const setAlarm = vi.fn();
      Object.assign(state, { storage: { getAlarm: async () => null, setAlarm, deleteAlarm: vi.fn() } });
      runtime.pendingGatewayPingAt = 1;
      runtime.gatewayLastActivityAt = 0;
      runtime.gatewayPingCapability = 'supported';
      await ensureHeartbeat(runtime);
      expect(setAlarm).toHaveBeenCalledWith(negotiated ? 76_001 : 45_001);
      reconcileGatewayLiveness(runtime, 46_001);
      expect(owner.closeCode).toBe(negotiated ? undefined : 4009);
      if (negotiated) {
        reconcileGatewayLiveness(runtime, 180_002);
        expect(owner.closeCode).toBe(4009);
      }
    } finally { vi.useRealTimers(); }
  });
  it('keeps legacy cleanup unchanged and adds bounded transfer headroom only for full negotiated clients', () => {
    const { runtime, phone } = setup('hermes');
    phone.serializeAttachment({ ...phone.deserializeAttachment(), capabilities: ['relay.client-pong.v1', RELAY_TRANSFER_HINT_V1_CAPABILITY], lastPongAt: 1 });
    expect(runtime.clientPongTimeoutMs()).toBe(90_000);
    expect(transferAwarePongTimeout(runtime, phone.deserializeAttachment(), 90_000)).toBe(180_000);
    expect(transferAwarePongTimeout(runtime, phone.deserializeAttachment(), 600_000)).toBe(600_000);
    for (const patch of [{ authScope: 'pairing' as const }, { authScope: undefined }, { capabilities: ['relay.client-pong.v1'] }, { backendSessionRetired: true as const }]) {
      expect(transferAwarePongTimeout(runtime, { ...phone.deserializeAttachment(), ...patch }, 90_000)).toBe(90_000);
    }
    pruneStaleHandshakeClients(runtime, 90_002);
    expect(phone.closeCode).toBeUndefined();
    pruneStaleHandshakeClients(runtime, 180_002);
    expect(phone.closeCode).toBe(4009);
  });
  it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi'])('sends an adjacent size-only hint in both %s directions without persisting content', backend => {
    const { runtime, owner, phone } = setup(backend);
    const frame = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES);
    for (const target of [owner, phone]) {
      const attachment = { ...target.deserializeAttachment() };
      sendRelayFrame(runtime, asWs(target), frame);
      expect(target.sent).toHaveLength(2);
      expect(target.sent[0]).toBe(hint(RELAY_TRANSFER_MIN_BYTES));
      expect(target.sent[1] === frame).toBe(true);
      expect(target.deserializeAttachment()).toEqual(attachment);
    }
  });
  it('covers the current OpenClaw secondary and restores negotiation after hibernation', () => {
    const { runtime, state, channel } = setup();
    const restored = new RelayRuntime(state, {} as Env, runtime.policy);
    rehydrateSockets(restored);
    const frame = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES);
    sendRelayFrame(restored, asWs(channel), frame);
    expect(channel.sent).toEqual([hint(RELAY_TRANSFER_MIN_BYTES), frame]);
  });
  it('counts UTF-8 bytes rather than JS character length, including the exact lower boundary', () => {
    const { runtime, phone } = setup();
    const frame = '😀'.repeat(RELAY_TRANSFER_MIN_BYTES / 4);
    expect(frame.length).toBe(RELAY_TRANSFER_MIN_BYTES / 2);
    sendRelayFrame(runtime, asWs(phone), frame);
    expect(phone.sent).toEqual([hint(RELAY_TRANSFER_MIN_BYTES), frame]);
  });
  it('preserves small and legacy frames byte-for-byte without an extra control', () => {
    const { runtime, phone } = setup();
    const small = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES - 1);
    sendRelayFrame(runtime, asWs(phone), small);
    phone.serializeAttachment({ ...phone.deserializeAttachment(), capabilities: [] });
    const large = small + 'x';
    sendRelayFrame(runtime, asWs(phone), large);
    expect(phone.sent).toEqual([small, large]);
  });
  it.each(['pairing', 'retired', 'unknown-auth', 'replaced-client', 'replaced-owner', 'stale-channel'])('does not grant %s a transfer hint', kind => {
    const { runtime, phone, owner, channel } = setup();
    let target = phone;
    if (kind === 'pairing') phone.serializeAttachment({ ...phone.deserializeAttachment(), authScope: 'pairing' });
    if (kind === 'retired') phone.serializeAttachment({ ...phone.deserializeAttachment(), backendSessionRetired: true });
    if (kind === 'unknown-auth') phone.serializeAttachment({ ...phone.deserializeAttachment(), authScope: undefined });
    if (kind === 'replaced-client') runtime.clients.set('phone', asWs(new Socket({ ...phone.deserializeAttachment() })));
    if (kind === 'replaced-owner') { target = owner; runtime.gatewaySocket = asWs(new Socket({ ...owner.deserializeAttachment(), clientId: 'new-owner' })); }
    if (kind === 'stale-channel') { target = channel; runtime.gatewaySocket = asWs(new Socket({ ...owner.deserializeAttachment(), clientId: 'new-owner' })); }
    const frame = 'x'.repeat(RELAY_TRANSFER_MIN_BYTES);
    sendRelayFrame(runtime, asWs(target), frame);
    expect(target.sent).toEqual([frame]); // Existing route admission remains the caller's responsibility.
  });
  it('advertises only explicit full-auth capability and preserves capability-free ready shape', () => {
    const { owner, phone, channel } = setup();
    for (const socket of [owner, phone, channel]) {
      sendRelayReady(asWs(socket));
      expect(JSON.parse(socket.sent[0].slice(CONTROL_PREFIX.length)).payload.capabilities)
        .toEqual(['relay.frame-limit.v2', RELAY_TRANSFER_HINT_V1_CAPABILITY]);
    }
    phone.sent = [];
    phone.serializeAttachment({ ...phone.deserializeAttachment(), authScope: 'pairing' });
    sendRelayReady(asWs(phone));
    expect(JSON.parse(phone.sent[0].slice(CONTROL_PREFIX.length)).payload.capabilities).toEqual(['relay.frame-limit.v2']);
  });
  it('never sends a large payload after its hint send failed', () => {
    const { runtime, phone } = setup();
    const send = vi.spyOn(phone, 'send').mockImplementation(() => { throw new Error('test'); });
    expect(() => sendRelayFrame(runtime, asWs(phone), 'x'.repeat(RELAY_TRANSFER_MIN_BYTES))).toThrow('test');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(hint(RELAY_TRANSFER_MIN_BYTES));
  });
  it('preserves the exact 8 MiB limit and refuses strictly larger rewritten frames', () => {
    const { runtime, phone } = setup();
    const frame = 'x'.repeat(RELAY_FRAME_MAX_BYTES);
    sendRelayFrame(runtime, asWs(phone), frame);
    expect(phone.sent).toEqual([hint(RELAY_FRAME_MAX_BYTES), frame]);
    phone.sent = [];
    sendRelayFrame(runtime, asWs(phone), frame + 'x');
    expect(phone.sent).toEqual([]);
    expect(phone.closeCode).toBe(1009);
  });
  it('reserves even malformed peer transfer hints, while preserving unrelated controls', () => {
    for (const event of ['relay.transfer-start', ' relay.transfer-start ']) {
      for (const payload of [null, { bytes: 10 }, { bytes: RELAY_FRAME_MAX_BYTES + 1 }]) {
        expect(isReservedTransferControl(CONTROL_PREFIX + JSON.stringify({ event, payload }))).toBe(true);
      }
    }
    expect(isReservedTransferControl(CONTROL_PREFIX + JSON.stringify({ event: 'client.connected' }))).toBe(false);
    expect(isReservedTransferControl('{"event":"relay.transfer-start"}')).toBe(false);
  });
});
