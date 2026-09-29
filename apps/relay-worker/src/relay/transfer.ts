import { RELAY_TRANSFER_HINT_V1_CAPABILITY } from '@clawket/shared';
import { clientChannel } from './client-channels';
import { relayFrameByteLength } from './frames';
import type { RelayRuntime } from './runtime';
import { CONTROL_PREFIX, RELAY_FRAME_MAX_BYTES, SOCKET_CLOSE_CODES, type SocketAttachment } from './types';
import { parsePositiveInt } from './utils';

export const RELAY_TRANSFER_MIN_BYTES = 128 * 1024;
export const RELAY_TRANSFER_START_EVENT = 'relay.transfer-start';
export const RELAY_TRANSFER_GRACE_MS = 90_000;

/** A peer may start its bounded transfer just before the next legacy ACK tick. */
export function transferAwarePongTimeout(runtime: RelayRuntime, attachment: SocketAttachment | null, legacyTimeoutMs: number): number {
  if (attachment?.authScope !== 'full' || attachment.backendSessionRetired
    || !attachment.capabilities?.includes(RELAY_TRANSFER_HINT_V1_CAPABILITY)) return legacyTimeoutMs;
  const interval = parsePositiveInt(runtime.env.HEARTBEAT_INTERVAL_MS, runtime.policy.heartbeatIntervalMs);
  // This only raises the server's fallback cleanup floor. Peers still use their
  // own fast, proof-based liveness checks; longer custom policies are preserved.
  return Math.max(legacyTimeoutMs, 3 * interval + RELAY_TRANSFER_GRACE_MS);
}

/** Only the server cleanup floor changes; peers still bound each handshake to 90s. */
export function transferAwareHandshakeTimeout(attachment: SocketAttachment | null, legacyTimeoutMs: number): number {
  return attachment?.role === 'client' && attachment.authScope === 'full' && !attachment.backendSessionRetired
    && attachment.capabilities?.includes(RELAY_TRANSFER_HINT_V1_CAPABILITY)
    ? Math.max(legacyTimeoutMs, RELAY_TRANSFER_GRACE_MS) : legacyTimeoutMs;
}

/** These hints are generated only by this Relay, never forwarded from any peer. */
export function isReservedTransferControl(text: string): boolean {
  if (!text.startsWith(CONTROL_PREFIX)) return false;
  try {
    const envelope = JSON.parse(text.slice(CONTROL_PREFIX.length)) as { event?: unknown } | null;
    return typeof envelope?.event === 'string' && envelope.event.trim() === RELAY_TRANSFER_START_EVENT;
  } catch { return false; }
}

function canReceiveTransferHint(runtime: RelayRuntime, socket: WebSocket): boolean {
  const attachment = socket.deserializeAttachment() as SocketAttachment | null;
  if (!attachment || attachment.authScope !== 'full' || attachment.backendSessionRetired
    || !attachment.capabilities?.includes(RELAY_TRANSFER_HINT_V1_CAPABILITY)) return false;
  if (attachment.role === 'client') {
    return !attachment.targetConnectionId && runtime.clients.get(attachment.clientId) === socket;
  }
  return attachment.targetConnectionId
    ? clientChannel(runtime, attachment.targetConnectionId) === socket
    : runtime.gatewaySocket === socket;
}

/**
 * Preserve the original frame. A small size-only hint immediately precedes a
 * large frame on the same current authenticated socket, with no intervening
 * await or persistent payload. Receivers own the non-renewable transfer budget;
 * neither send() returning nor this hint is health evidence.
 */
export function sendRelayFrame(runtime: RelayRuntime, socket: WebSocket, frame: string): void {
  const bytes = relayFrameByteLength(frame);
  if (bytes > RELAY_FRAME_MAX_BYTES) {
    socket.close(SOCKET_CLOSE_CODES.FRAME_TOO_LARGE, 'frame_too_large');
    return;
  }
  if (bytes >= RELAY_TRANSFER_MIN_BYTES && socket.readyState === WebSocket.OPEN
    && canReceiveTransferHint(runtime, socket)) {
    socket.send(CONTROL_PREFIX + JSON.stringify({
      type: 'control', event: RELAY_TRANSFER_START_EVENT, payload: { bytes },
    }));
  }
  socket.send(frame);
}
