import { describe, expect, it, vi } from 'vitest';
import { policyForBackend } from '../backend-policy';
import { RelayRuntime } from './runtime';
import { rehydrateSockets } from './storage';
import { acknowledgeClientPong, handleGatewayMessage, prepareClientMessage, rejectClientRequestWithoutBridge } from './routing';
import { MAX_PENDING_REQUESTS, PENDING_REQUEST_TTL_MS, rememberPendingRequest } from './pending-requests';
import type { Env, SocketAttachment } from './types';

class Socket {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  failAttachment = false;
  constructor(private attachment: SocketAttachment) {}
  deserializeAttachment() { return structuredClone(this.attachment); }
  serializeAttachment(value: SocketAttachment) {
    if (this.failAttachment) throw new Error('attachment full');
    this.attachment = structuredClone(value);
  }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = WebSocket.CLOSED; }
}
const client = (id: string, extra: Partial<SocketAttachment> = {}) => new Socket({ role: 'client', clientId: id, connectedAt: 1, ...extra });
const owner = () => client('bridge', { role: 'gateway' });
function room(sockets: Socket[], backend = 'claude-code') {
  const runtime = new RelayRuntime({ getWebSockets: () => sockets, id: { toString: () => 'test' } } as unknown as DurableObjectState, {} as Env, policyForBackend(backend));
  rehydrateSockets(runtime);
  return runtime;
}
const request = (id: string, method = 'sessions.list') => JSON.stringify({ type: 'req', id, method });
const response = (id: string) => JSON.stringify({ type: 'res', id, ok: true, payload: {} });
const deliver = (runtime: RelayRuntime, gateway: Socket, id: string) => handleGatewayMessage(runtime, gateway as unknown as WebSocket, gateway.deserializeAttachment(), response(id), async () => {});

describe('pending origin safety', () => {
  it('preserves markers through active-route and heartbeat changes, then consumes once across hibernation', async () => {
    const phone = client('phone', { capabilities: ['relay.client-pong.v1'] });
    const tablet = client('tablet'); const gateway = owner(); const sockets = [phone, tablet, gateway];
    const before = room(sockets);
    prepareClientMessage(before, phone.deserializeAttachment(), request('r1'));
    prepareClientMessage(before, tablet.deserializeAttachment(), request('r2'));
    acknowledgeClientPong(before, phone as unknown as WebSocket, phone.deserializeAttachment(), JSON.stringify({ type: 'pong', ts: Date.now() }));
    await deliver(room(sockets), gateway, 'r1');
    expect(phone.sent).toEqual([response('r1')]);
    expect(phone.deserializeAttachment().pendingRequests).toEqual([]);
    await deliver(room(sockets), gateway, 'r1');
    expect(phone.sent).toHaveLength(1);
    expect(tablet.sent).toEqual([]);
  });

  it('also restores handshake request origins', async () => {
    const phone = client('phone'); const tablet = client('tablet'); const gateway = owner(); const sockets = [phone, tablet, gateway];
    const before = room(sockets);
    prepareClientMessage(before, phone.deserializeAttachment(), request('connect-phone', 'connect'));
    prepareClientMessage(before, tablet.deserializeAttachment(), request('connect-tablet', 'connect'));
    await deliver(room(sockets), gateway, 'connect-phone');
    expect(phone.sent).toEqual([response('connect-phone')]);
    expect(tablet.sent).toEqual([]);
  });

  it('never sends an old socket response to its replacement or the active peer', async () => {
    const old = client('phone'); const tablet = client('tablet'); const gateway = owner();
    const before = room([old, tablet, gateway]);
    prepareClientMessage(before, old.deserializeAttachment(), request('old-request'));
    const replacement = client('phone', { connectedAt: 2 });
    await deliver(room([old, tablet, gateway, replacement]), gateway, 'old-request');
    expect(old.readyState).toBe(WebSocket.CLOSED);
    expect(replacement.sent).toEqual([]);
    expect(tablet.sent).toEqual([]);
  });

  it('rejects duplicate request IDs before forwarding, preserving the first origin', async () => {
    const phone = client('phone'); const tablet = client('tablet'); const gateway = owner(); const runtime = room([phone, tablet, gateway]);
    expect(prepareClientMessage(runtime, phone.deserializeAttachment(), request('shared'))).toBe(false);
    expect(prepareClientMessage(runtime, tablet.deserializeAttachment(), request('shared'))).toBeNull();
    expect(JSON.parse(tablet.sent[0])).toMatchObject({ type: 'res', id: 'shared', ok: false });
    await deliver(runtime, gateway, 'shared');
    expect(phone.sent).toEqual([response('shared')]);
    expect(tablet.sent).toHaveLength(1);
  });

  it('drops unknown, expired and ambiguous origins instead of guessing an active client', async () => {
    const now = Date.now();
    const phone = client('phone', { pendingRequests: [['expired', now - 1], ['ambiguous', now + 1000]] });
    const tablet = client('tablet', { activeClient: true, pendingRequests: [['ambiguous', now + 1000]] });
    const gateway = owner(); const runtime = room([phone, tablet, gateway]);
    for (const id of ['unknown', 'expired', 'ambiguous']) await deliver(runtime, gateway, id);
    expect(phone.sent).toEqual([]); expect(tablet.sent).toEqual([]);
  });

  it('ignores restricted and corrupted metadata', async () => {
    const now = Date.now();
    // Keep the +1 ms invalid-TTL boundary fixed across asynchronous delivery.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const pairing = client('restricted', { authScope: 'pairing', pendingRequests: [['private', now + 1000]] });
      const invalid = client('invalid', { pendingRequests: [null, ['infinite', Infinity], ['future', now + PENDING_REQUEST_TTL_MS + 1], [5, now + 1000]] as never });
      const full = client('full', { activeClient: true }); const gateway = owner();
      const runtime = room([pairing, invalid, full, gateway]);
      expect(runtime.requestClientByReqId.size).toBe(0);
      for (const id of ['private', 'infinite', 'future']) await deliver(runtime, gateway, id);
      expect(pairing.sent).toEqual([]); expect(invalid.sent).toEqual([]); expect(full.sent).toEqual([]);
    } finally { clock.mockRestore(); }
  });

  it('bounds outstanding requests without evicting them and frees capacity after expiry', () => {
    vi.useFakeTimers();
    try {
      const phone = client('phone'); const runtime = room([phone]);
      for (let i = 0; i < MAX_PENDING_REQUESTS; i++) expect(rememberPendingRequest(runtime, 'phone', `r${i}`)).toBe(true);
      expect(rememberPendingRequest(runtime, 'phone', 'overflow')).toBe(false);
      expect(phone.deserializeAttachment().pendingRequests).toHaveLength(MAX_PENDING_REQUESTS);
      vi.advanceTimersByTime(PENDING_REQUEST_TTL_MS + 1);
      expect(rememberPendingRequest(runtime, 'phone', 'fresh')).toBe(true);
      expect(phone.deserializeAttachment().pendingRequests).toHaveLength(1);
      expect(runtime.requestClientByReqId.size).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('fails closed for oversized or unpersistable metadata', () => {
    const phone = client('phone', { clientLabel: 'x'.repeat(8192) }); const runtime = room([phone]);
    expect(rememberPendingRequest(runtime, 'phone', 'oversized')).toBe(false);
    phone.serializeAttachment({ role: 'client', clientId: 'phone', connectedAt: 1 });
    expect(rememberPendingRequest(runtime, 'phone', 'x'.repeat(257))).toBe(false);
    phone.failAttachment = true;
    expect(rememberPendingRequest(runtime, 'phone', 'failed')).toBe(false);
    expect(runtime.requestClientByReqId.size).toBe(0);
    expect(phone.sent).toHaveLength(3);
  });

  it('releases a rejected request when the bridge is unavailable', () => {
    const phone = client('phone'); const runtime = room([phone]); const text = request('missing');
    prepareClientMessage(runtime, phone.deserializeAttachment(), text);
    rejectClientRequestWithoutBridge(runtime, phone as unknown as WebSocket, phone.deserializeAttachment(), text);
    expect(phone.deserializeAttachment().pendingRequests).toEqual([]);
    expect(runtime.requestClientByReqId.size).toBe(0);
    expect(JSON.parse(phone.sent[0]).error.code).toBe('BRIDGE_UNAVAILABLE');
  });

  it('leaves OpenClaw legacy response routing unchanged', async () => {
    const phone = client('phone'); const gateway = owner(); const runtime = room([phone, gateway], 'openclaw');
    await deliver(runtime, gateway, 'legacy');
    expect(phone.sent).toEqual([response('legacy')]);
    expect(phone.deserializeAttachment().pendingRequests).toBeUndefined();
  });
});
