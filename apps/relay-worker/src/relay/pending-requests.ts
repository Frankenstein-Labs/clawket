import type { RelayRuntime } from './runtime';
import type { SocketAttachment } from './types';
import { relayFrameByteLength } from './frames';

export const PENDING_REQUEST_TTL_MS = 5 * 60_000;
export const MAX_PENDING_REQUESTS = 32;
// Leave ample space below the platform's 16 KiB structured-clone limit.
export const MAX_REQUEST_ATTACHMENT_BYTES = 8_192;
type PendingRequest = [id: string, expiresAt: number];

function pendingRequests(attachment: SocketAttachment, now: number): PendingRequest[] {
  if (attachment.role !== 'client' || attachment.authScope === 'pairing'
    || !Array.isArray(attachment.pendingRequests)
    || attachment.pendingRequests.length > MAX_PENDING_REQUESTS) return [];
  return attachment.pendingRequests.filter((entry): entry is PendingRequest => (
    Array.isArray(entry) && entry.length === 2
    && typeof entry[0] === 'string' && entry[0].length > 0 && entry[0].length <= 256
    && typeof entry[1] === 'number' && Number.isFinite(entry[1])
    && entry[1] > now && entry[1] <= now + PENDING_REQUEST_TTL_MS
  ));
}

/** Only the currently authenticated socket may own a response route. */
export function restorePendingRequests(runtime: RelayRuntime, now = Date.now()): void {
  runtime.requestClientByReqId.clear();
  if (!runtime.policy.routeRequestsByOrigin) return;
  const ambiguous = new Set<string>();
  for (const [clientId, socket] of runtime.clients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || attachment.clientId !== clientId) continue;
    for (const [id] of pendingRequests(attachment, now)) {
      if (runtime.requestClientByReqId.has(id)) ambiguous.add(id);
      else runtime.requestClientByReqId.set(id, clientId);
    }
  }
  for (const id of ambiguous) runtime.requestClientByReqId.delete(id);
}

/** Persist before forwarding; never evict a live request to make room. */
export function rememberPendingRequest(runtime: RelayRuntime, clientId: string, id: string): boolean {
  const socket = runtime.clients.get(clientId);
  const attachment = socket?.deserializeAttachment() as SocketAttachment | null;
  if (!socket || socket.readyState !== WebSocket.OPEN || !attachment
    || attachment.role !== 'client' || attachment.authScope === 'pairing') return false;
  const now = Date.now();
  restorePendingRequests(runtime, now);
  const pending = pendingRequests(attachment, now);
  const duplicate = [...runtime.clients.values()].some(client => {
    const current = client.deserializeAttachment() as SocketAttachment | null;
    return current && pendingRequests(current, now).some(([requestId]) => requestId === id);
  });
  let accepted = false;
  if (id.length <= 256 && !duplicate && pending.length < MAX_PENDING_REQUESTS) {
    const next = { ...attachment, pendingRequests: [...pending, [id, now + PENDING_REQUEST_TTL_MS] as PendingRequest] };
    if (relayFrameByteLength(JSON.stringify(next)) <= MAX_REQUEST_ATTACHMENT_BYTES) {
      try {
        socket.serializeAttachment(next);
        runtime.requestClientByReqId.set(id, clientId);
        accepted = true;
      } catch {
        // An attachment failure must not forward an unrouteable request.
      }
    }
  }
  if (!accepted) {
    socket.send(JSON.stringify({
      type: 'res', id, ok: false,
      error: { code: 'RELAY_REQUEST_CAPACITY', message: 'Too many pending requests. Please retry.' },
    }));
  }
  return accepted;
}

/** Unknown, expired, ambiguous and replaced origins must never fall back to another client. */
export function takePendingRequest(runtime: RelayRuntime, id: string): { clientId: string; socket: WebSocket } | null {
  const now = Date.now();
  restorePendingRequests(runtime, now);
  const clientId = runtime.requestClientByReqId.get(id);
  const socket = clientId ? runtime.clients.get(clientId) : undefined;
  runtime.requestClientByReqId.delete(id);
  if (!clientId || !socket) return null;
  const attachment = socket.deserializeAttachment() as SocketAttachment;
  const remaining = pendingRequests(attachment, now).filter(([requestId]) => requestId !== id);
  socket.serializeAttachment({ ...attachment, pendingRequests: remaining });
  return { clientId, socket };
}
