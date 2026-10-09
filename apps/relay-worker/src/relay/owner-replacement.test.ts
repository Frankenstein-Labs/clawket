import { describe, expect, it, vi } from 'vitest';
import { policyForBackend } from '../backend-policy';
import { replaceGateway } from './control';
import { RelayRuntime } from './runtime';
import { rehydrateSockets } from './storage';
import type { Env, SocketAttachment } from './types';

class Socket {
  readyState: number = WebSocket.OPEN;
  closeCalls: number[] = [];
  failWrite = false;
  failClose = false;
  constructor(public attachment: SocketAttachment) {}
  deserializeAttachment() { return this.attachment; }
  serializeAttachment(value: SocketAttachment) {
    if (this.failWrite) throw new Error('test storage failure');
    this.attachment = structuredClone(value);
  }
  send() {}
  close(code: number) {
    this.closeCalls.push(code);
    if (this.failClose) throw new Error('test close failure');
    // A real close is asynchronous; deliberately remain OPEN.
  }
  ws() { return this as unknown as WebSocket; }
}
function socket(id: string, extra: Partial<SocketAttachment> = {}) {
  return new Socket({ role: 'client', clientId: id, connectedAt: 1, authScope: 'full', ...extra });
}
function runtime(backend: string, sockets: Socket[]) {
  return new RelayRuntime({ getWebSockets: () => sockets.map(s => s.ws()), id: { toString: () => 'test' } } as unknown as DurableObjectState, {} as Env, policyForBackend(backend));
}

describe.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi'])('%s owner generation replacement', backend => {
  it('keeps a first-owner waiting client and does not retire the current socket itself', () => {
    const phone = socket('phone');
    const next = socket('owner', { role: 'gateway' });
    const r = runtime(backend, [phone]); rehydrateSockets(r);
    const activate = vi.fn();
    replaceGateway(r, next.ws(), activate);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(r.clients.get('phone')).toBe(phone);
    replaceGateway(r, next.ws(), activate);
    expect(phone.closeCalls).toEqual([]);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('persists retirement and removes all old origins before accepting the same-instance replacement', () => {
    const old = socket('same-owner', { role: 'gateway' });
    const phone = socket('phone', { activeClient: true, challengeDeliveredAt: 10, pendingRequests: [['r', Date.now() + 10000]] });
    const pairing = socket('ticket', { authScope: 'pairing' });
    const r = runtime(backend, [old, phone]); rehydrateSockets(r);
    r.pairingClients.set('ticket', pairing.ws());
    r.pendingConnectStarts.set('phone', { clientId: 'phone', data: '{}', queuedAt: 1 });
    r.connectReqClientByReqId.set('c', 'phone'); r.awaitingChallenge.set('phone', { clientId: 'phone', queuedAt: 1 });
    const next = socket('same-owner', { role: 'gateway', connectedAt: 2 });
    replaceGateway(r, next.ws(), () => {
      expect(phone.attachment.backendSessionRetired).toBe(true);
      expect(r.clients.size).toBe(0); expect(r.requestClientByReqId.size).toBe(0);
    });
    expect(r.gatewaySocket).toBe(next);
    expect(phone.closeCalls).toEqual([4011]);
    expect(phone.attachment.pendingRequests).toBeUndefined();
    expect(phone.attachment.challengeDeliveredAt).toBeUndefined();
    expect(phone.attachment.activeClient).toBe(false);
    expect(r.pendingConnectStarts.size).toBe(0); expect(r.connectReqClientByReqId.size).toBe(0);
    expect(r.awaitingChallenge.size).toBe(0); expect(r.activeClientId).toBeNull();
    expect(pairing.closeCalls).toEqual([]); expect(r.pairingClients.get('ticket')).toBe(pairing);
  });

  it('uses persisted owner evidence when hibernation discarded a closed owner, never resurrecting a failed-close client', () => {
    const old = socket('owner', { role: 'gateway' }); old.readyState = WebSocket.CLOSED;
    const phone = socket('phone', { activeClient: true, pendingRequests: [['r', Date.now() + 10000]] }); phone.failClose = true;
    const r = runtime(backend, [old, phone]); r.owner = { principalId: 'owner', seenAt: 1 }; rehydrateSockets(r);
    expect(r.gatewaySocket).toBeNull();
    const next = socket('owner', { role: 'gateway', connectedAt: 2 });
    replaceGateway(r, next.ws());
    const fresh = runtime(backend, [phone, next]); rehydrateSockets(fresh);
    expect(fresh.gatewaySocket).toBe(next); expect(fresh.clients.size).toBe(0);
    expect(fresh.requestClientByReqId.size).toBe(0); expect(fresh.activeClientId).toBeNull();
    expect(phone.closeCalls.every(code => code === 4011)).toBe(true);
  });

  it('removes a closed client whose attachment has already been discarded', () => {
    const old = socket('owner', { role: 'gateway' }); const dead = socket('phone');
    const r = runtime(backend, [old, dead]); rehydrateSockets(r);
    dead.readyState = WebSocket.CLOSED;
    vi.spyOn(dead, 'deserializeAttachment').mockReturnValue(null as never);
    const next = socket('owner', { role: 'gateway', connectedAt: 2 });
    replaceGateway(r, next.ws());
    expect(r.gatewaySocket).toBe(next); expect(r.clients.size).toBe(0);
  });

  it('fails closed before accepting a new owner when retirement persistence fails, including partial progress', () => {
    const old = socket('owner', { role: 'gateway' });
    const retired = socket('first'); const failed = socket('second');
    const r = runtime(backend, [old, retired, failed]); rehydrateSockets(r);
    failed.failWrite = true;
    const next = socket('owner', { role: 'gateway', connectedAt: 2 }); const activate = vi.fn();
    expect(() => replaceGateway(r, next.ws(), activate)).toThrow('test storage failure');
    expect(activate).not.toHaveBeenCalled(); expect(r.gatewaySocket).toBe(old);
    expect(r.clients.has('first')).toBe(false); expect(retired.attachment.backendSessionRetired).toBe(true);
    expect(r.clients.get('second')).toBe(failed); expect(failed.attachment.backendSessionRetired).toBeUndefined();
    failed.failWrite = false;
    const fresh = runtime(backend, [old, retired, failed]); rehydrateSockets(fresh);
    expect(fresh.clients.has('first')).toBe(false); expect(fresh.clients.get('second')).toBe(failed);
  });
});
