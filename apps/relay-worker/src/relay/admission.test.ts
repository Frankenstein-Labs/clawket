import { describe, expect, it } from 'vitest';
import { policyForBackend } from '../backend-policy';
import { RelayRuntime } from './runtime';
import { rehydrateSockets } from './storage';
import { canAdmitClient, hasConflictingClientCredential, MAX_DEVICE_SOCKETS, MAX_PAIRING_SOCKETS, MAX_ROOM_CLIENTS } from './admission';
import type { BackendKind, Env, SocketAttachment } from './types';

function socket(id: string, hash?: string, pairing = false, open = true): WebSocket {
  let attachment: SocketAttachment = { role: 'client', clientId: id, connectedAt: 1,
    ...(hash ? { credentialHash: hash } : {}), authScope: pairing ? 'pairing' : 'full' };
  return { readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
    deserializeAttachment: () => attachment,
    serializeAttachment: (value: SocketAttachment) => { attachment = value; }, close() {},
  } as unknown as WebSocket;
}

describe('authenticated room admission', () => {
  it.each<BackendKind>(['openclaw', 'hermes', 'pi', 'codex', 'claude-code', 'local-model'])('bounds %s devices before and after hibernation', (backend) => {
    const peers = Array.from({ length: MAX_DEVICE_SOCKETS }, (_, index) => socket(`phone-${index}`, 'one-way-hash'));
    const state = { getWebSockets: () => peers, id: { toString: () => 'test-room' } } as unknown as DurableObjectState;
    const makeRuntime = () => {
      const runtime = new RelayRuntime(state, {} as Env, policyForBackend(backend));
      rehydrateSockets(runtime);
      return runtime;
    };
    for (const runtime of [makeRuntime(), makeRuntime()]) {
      expect(canAdmitClient(runtime, { credentialHash: 'one-way-hash', pairing: false })).toBe(false);
      expect(canAdmitClient(runtime, { credentialHash: 'another-device', pairing: false })).toBe(true);
      expect(canAdmitClient(runtime, { credentialHash: 'one-way-hash', clientId: 'phone-1', pairing: false })).toBe(true);
      expect(hasConflictingClientCredential(runtime, { credentialHash: 'another-device', clientId: 'phone-1', pairing: false })).toBe(true);
      expect(canAdmitClient(runtime, { credentialHash: 'another-device', clientId: 'phone-1', pairing: false })).toBe(false);
      expect(canAdmitClient(runtime, { credentialHash: 'one-way-hash', pairing: true })).toBe(true);
    }
  });

  it('bounds legacy peers without fingerprint and restricted pairing independently', () => {
    const runtime = new RelayRuntime({} as DurableObjectState, {} as Env, policyForBackend('codex'));
    for (let i = 0; i < MAX_ROOM_CLIENTS; i += 1) runtime.clients.set(String(i), socket(String(i)));
    expect(canAdmitClient(runtime, { credentialHash: 'new', pairing: false })).toBe(false);
    expect(canAdmitClient(runtime, { credentialHash: 'new', clientId: '1', pairing: false })).toBe(true);
    runtime.clients.set('0', socket('0', undefined, false, false));
    expect(canAdmitClient(runtime, { credentialHash: 'new', pairing: false })).toBe(true);
    for (let i = 0; i < MAX_PAIRING_SOCKETS; i += 1) runtime.pairingClients.set(`pair-${i}`, socket(`pair-${i}`, `ticket-${i}`, true));
    expect(canAdmitClient(runtime, { credentialHash: 'new', pairing: true })).toBe(false);
    expect(canAdmitClient(runtime, { credentialHash: 'new', clientId: 'pair-1', pairing: true })).toBe(false);
    expect(canAdmitClient(runtime, { credentialHash: 'ticket-1', clientId: 'pair-1', pairing: true })).toBe(true);
  });

  it('does not reserve a disconnected identity and tolerates one legacy reconnect', () => {
    const runtime = new RelayRuntime({} as DurableObjectState, {} as Env, policyForBackend('hermes'));
    runtime.clients.set('old', socket('old', 'old-key', false, false));
    runtime.clients.set('legacy', socket('legacy'));
    expect(hasConflictingClientCredential(runtime, { clientId: 'old', credentialHash: 'new-key', pairing: false })).toBe(false);
    expect(hasConflictingClientCredential(runtime, { clientId: 'legacy', credentialHash: 'new-key', pairing: false })).toBe(false);
    expect(hasConflictingClientCredential(runtime, { clientId: 'legacy', credentialHash: 'new-key', pairing: true })).toBe(true);
    runtime.pairingClients.set('ticket', socket('ticket', 'ticket-key', true));
    expect(hasConflictingClientCredential(runtime, { clientId: 'ticket', credentialHash: 'claimed-key', pairing: false })).toBe(false);
  });
});
