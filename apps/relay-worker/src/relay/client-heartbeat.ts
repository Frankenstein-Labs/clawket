import { RELAY_CLIENT_PING_V1_CAPABILITY } from '@clawket/shared';
import { parseControlEnvelope, serializeControlEnvelope } from './control';
import { takeHeartbeatEchoCredit } from './heartbeat-budget';
import type { RelayRuntime } from './runtime';
import { CONTROL_PREFIX, type SocketAttachment } from './types';

/** Relay reachability only; this neither forwards traffic nor proves backend health. */
export function consumeClientHeartbeatControl(
  runtime: RelayRuntime,
  socket: WebSocket,
  message: string | ArrayBuffer,
  text: string,
  now = Date.now(),
): boolean {
  if (!text.startsWith(CONTROL_PREFIX)) return false;
  const envelope = parseControlEnvelope(text);
  if (!envelope) return true;
  const event = typeof envelope.event === 'string' ? envelope.event.trim() : '';
  if (event !== 'relay.client-ping' && event !== 'relay.client-pong') return false;
  // All peer-supplied replies are reserved, including owners and pairing peers.
  if (event !== 'relay.client-ping' || envelope.event !== event || envelope.type !== 'control'
    || typeof message !== 'string' || text.length > 512 || new TextEncoder().encode(text).byteLength > 512) return true;
  const payload = envelope.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return true;
  const nonce = (payload as Record<string, unknown>).nonce;
  if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) return true;
  const attachment = socket.deserializeAttachment() as SocketAttachment | null;
  if (!attachment || attachment.role !== 'client' || attachment.authScope !== 'full'
    || attachment.backendSessionRetired || attachment.targetConnectionId
    || socket.readyState !== WebSocket.OPEN
    || runtime.clients.get(attachment.clientId) !== socket
    || !attachment.capabilities?.includes(RELAY_CLIENT_PING_V1_CAPABILITY)) return true;
  const credit = takeHeartbeatEchoCredit(attachment.heartbeatEchoBudget, attachment.lastClientPingAt, now);
  if (!credit?.allowed) return true;
  try {
    // Persist consumed credits before echoing. Preserve routing/auth/ACK
    // markers, and keep this independent of Relay's legacy client-pong expiry.
    socket.serializeAttachment({ ...attachment, lastClientPingAt: credit.budget.updatedAt,
      heartbeatEchoBudget: credit.budget });
    socket.send(serializeControlEnvelope({ type: 'control', event: 'relay.client-pong', payload: { nonce } }));
  } catch {
    // Fail closed. The client owns a bounded deadline; no fallback route or
    // per-ping cloud log can turn a failed write into success or unbounded cost.
  }
  return true;
}
