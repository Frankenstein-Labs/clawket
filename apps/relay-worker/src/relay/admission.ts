import type { SocketAttachment } from './types';
import type { RelayRuntime } from './runtime';

export const MAX_ROOM_CLIENTS = 128;
export const MAX_DEVICE_SOCKETS = 8;
export const MAX_PAIRING_SOCKETS = 16;

/** Old attachments predate binding; their first reconnect retains legacy behavior. */
export function hasConflictingClientCredential(runtime: RelayRuntime, input: {
  clientId?: string;
  credentialHash: string;
  pairing: boolean;
}): boolean {
  if (!input.clientId) return false;
  // A restricted invitation must never displace an authenticated full client.
  if (input.pairing && runtime.clients.get(input.clientId)?.readyState === WebSocket.OPEN) return true;
  const socket = (input.pairing ? runtime.pairingClients : runtime.clients).get(input.clientId);
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  const previous = (socket.deserializeAttachment() as SocketAttachment | null)?.credentialHash;
  return typeof previous === 'string' && previous !== input.credentialHash;
}

/** Count live sockets, not caller-supplied client IDs. Attachments survive hibernation. */
export function canAdmitClient(runtime: RelayRuntime, input: {
  clientId?: string;
  credentialHash: string;
  pairing: boolean;
}): boolean {
  if (hasConflictingClientCredential(runtime, input)) return false;
  const peers = input.pairing ? runtime.pairingClients : runtime.clients;
  let total = 0;
  let sameDevice = 0;
  for (const [id, socket] of peers) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    // Replacing one's current socket never consumes additional capacity.
    if (input.clientId && id === input.clientId) continue;
    total += 1;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.credentialHash === input.credentialHash) sameDevice += 1;
  }
  return total < (input.pairing ? MAX_PAIRING_SOCKETS : MAX_ROOM_CLIENTS)
    && sameDevice < MAX_DEVICE_SOCKETS;
}
