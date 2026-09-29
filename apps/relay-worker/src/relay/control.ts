import { dropClientState } from './heartbeat';
import { hasClientChannels, syncClientChannels } from './client-channels';
import { RELAY_CLIENT_PING_V1_CAPABILITY, RELAY_FRAME_LIMIT_V2, RELAY_OWNER_PONG_V1_CAPABILITY, RELAY_TRANSFER_HINT_V1_CAPABILITY } from '@clawket/shared';
import {
  CONTROL_PREFIX,
  SOCKET_CLOSE_CODES,
  type RelayControlEnvelope,
  type SocketAttachment,
} from './types';
import { logRuntimeTelemetry } from './telemetry';
import type { RelayRuntime } from './runtime';

/** Persist retirement before removing routes; a failed close must not revive them after hibernation. */
export function retireOwnerClients(runtime: RelayRuntime): void {
  const retired: Array<[string, WebSocket]> = [];
  try {
    for (const [clientId, socket] of runtime.clients) {
      // Closed peers may no longer retain an attachment; reconstruction already
      // rejects non-open sockets, so no persisted tombstone is needed for them.
      if (socket.readyState !== WebSocket.OPEN) {
        retired.push([clientId, socket]);
        continue;
      }
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || attachment.role !== 'client' || attachment.clientId !== clientId
        || attachment.authScope === 'pairing') throw new Error('client_retirement_failed');
      const next: SocketAttachment = { ...attachment, backendSessionRetired: true, activeClient: false };
      delete next.pendingRequests;
      delete next.challengeDeliveredAt;
      socket.serializeAttachment(next);
      retired.push([clientId, socket]);
    }
  } finally {
    // No await: only this captured generation can be removed. On a partial
    // attachment failure, unmarked clients retain the old owner and admission fails.
    for (const [clientId, socket] of retired) {
      if (runtime.clients.get(clientId) !== socket) continue;
      if (runtime.activeClientId === clientId) runtime.activeClientId = null;
      if (runtime.challengeClientId === clientId) runtime.challengeClientId = null;
      dropClientState(runtime, clientId, 'backend_session_restarted');
      try { socket.close(SOCKET_CLOSE_CODES.GATEWAY_UNAVAILABLE, runtime.policy.ownerUnavailableReason); } catch { /* The persisted marker fences a still-open socket. */ }
    }
  }
  runtime.pendingChallenge = null;
}

export function replaceGateway(runtime: RelayRuntime, nextGateway: WebSocket, activateNext: () => void = () => {}): void {
  if (runtime.gatewaySocket === nextGateway) return;
  // The persisted lease proves an earlier owner even if its close callback ran
  // after hibernation and reconstruction omitted the already-closed socket.
  if (runtime.gatewaySocket || runtime.owner) retireOwnerClients(runtime);
  // Acceptance/attachment and installation are synchronous, after old-client
  // retirement succeeds. A rejected replacement never receives relay.ready.
  activateNext();
  const previous = runtime.gatewaySocket;
  runtime.gatewaySocket = nextGateway;
  if (previous && previous !== nextGateway) {
    runtime.pendingChallenge = null;
    for (const channel of runtime.state.getWebSockets()) {
      if ((channel.deserializeAttachment() as SocketAttachment | null)?.targetConnectionId) {
        try { channel.close(1012, 'owner_replaced'); } catch { /* Best effort; current-owner guards fence old channels. */ }
      }
    }
    try { previous.close(SOCKET_CLOSE_CODES.REPLACED_BY_NEW_GATEWAY, runtime.policy.ownerReplacedReason); } catch { /* Current-owner identity already changed. */ }
  }
  if (runtime.policy.watchdog !== 'none') {
    runtime.pendingGatewayPingAt = 0;
    runtime.gatewayPingCapability = 'unknown';
  }
}

export const replaceBridge = replaceGateway;

export function parseControlEnvelope(text: string): RelayControlEnvelope | null {
  if (!text.startsWith(CONTROL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(CONTROL_PREFIX.length));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as RelayControlEnvelope;
  } catch {
    return null;
  }
}

/** Presence is authored by authenticated room state, never supplied by a peer. */
export function isReservedPresenceControl(text: string): boolean {
  const event = parseControlEnvelope(text)?.event;
  return event === 'client_count' || event === 'client_connected'
    || event === 'client_disconnected' || event === 'client.sockets';
}

export function serializeControlEnvelope(envelope: RelayControlEnvelope): string {
  return `${CONTROL_PREFIX}${JSON.stringify(envelope)}`;
}

export function sendRelayReady(socket: WebSocket): void {
  const attachment = socket.deserializeAttachment() as SocketAttachment | null;
  const ownerPong = attachment?.role === 'gateway' && attachment.authScope !== 'pairing'
    && attachment.capabilities?.includes(RELAY_OWNER_PONG_V1_CAPABILITY);
  const clientPing = attachment?.role === 'client' && attachment.authScope === 'full'
    && !attachment.backendSessionRetired && attachment.capabilities?.includes(RELAY_CLIENT_PING_V1_CAPABILITY);
  const transferHint = attachment?.authScope === 'full' && !attachment.backendSessionRetired
    && attachment.capabilities?.includes(RELAY_TRANSFER_HINT_V1_CAPABILITY);
  socket.send(serializeControlEnvelope({
    type: 'control',
    event: 'relay.ready',
    payload: { capabilities: [RELAY_FRAME_LIMIT_V2, ...(ownerPong ? [RELAY_OWNER_PONG_V1_CAPABILITY] : []),
      ...(clientPing ? [RELAY_CLIENT_PING_V1_CAPABILITY] : []),
      ...(transferHint ? [RELAY_TRANSFER_HINT_V1_CAPABILITY] : [])] },
  }));
}

function normalizeControlEvent(envelope: RelayControlEnvelope): string | null {
  return typeof envelope.event === 'string' && envelope.event.trim()
    ? envelope.event.trim()
    : null;
}

export function sendControlToGateway(
  runtime: RelayRuntime,
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!runtime.gatewaySocket || runtime.gatewaySocket.readyState !== WebSocket.OPEN) return;
  if (hasClientChannels(runtime) && ['client_count', 'client_connected', 'client_disconnected'].includes(event)) {
    syncClientChannels(runtime);
    return;
  }
  runtime.gatewaySocket.send(serializeControlEnvelope({
    type: 'control',
    event,
    ...(payload ?? {}),
  }));
  logRuntimeTelemetry(runtime, 'control_sent', {
    controlEvent: event,
    count: payload?.count,
    clientCount: runtime.clients.size,
  });
}

export const sendControlToBridge = sendControlToGateway;

export function logControlRoutingTelemetry(
  runtime: RelayRuntime,
  event: string,
  attachment: SocketAttachment,
  envelope: RelayControlEnvelope,
  extra: Record<string, unknown> = {},
): void {
  logRuntimeTelemetry(runtime, event, {
    role: attachment.role,
    controlEvent: normalizeControlEvent(envelope),
    hasSourceClient: typeof envelope.sourceClientId === 'string' && envelope.sourceClientId.trim().length > 0,
    hasTargetClient: typeof envelope.targetClientId === 'string' && envelope.targetClientId.trim().length > 0,
    clientCount: runtime.clients.size,
    ...extra,
  });
}
