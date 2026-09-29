import { RELAY_OWNER_PONG_V1_CAPABILITY } from '@clawket/shared';
import { channelClient, clientChannel, hasClientChannels } from './client-channels';
import { parseControlEnvelope, serializeControlEnvelope } from './control';
import { takeHeartbeatEchoCredit } from './heartbeat-budget';
import type { RelayRuntime } from './runtime';
import { logRuntimeTelemetry } from './telemetry';
import { CONTROL_PREFIX, type SocketAttachment } from './types';

const MAX_OWNER_ECHO_FRAME_CHARS = 512;

/** Consume reserved controls before any owner/client forwarding path. */
export function consumeOwnerHeartbeatControl(
  runtime: RelayRuntime,
  socket: WebSocket,
  message: string | ArrayBuffer,
  text: string,
  now = Date.now(),
): boolean {
  if (!text.startsWith(CONTROL_PREFIX)) return false;
  const envelope = parseControlEnvelope(text);
  // Invalid control JSON never becomes application traffic (including on channels).
  if (!envelope) return true;
  const event = typeof envelope.event === 'string' ? envelope.event.trim() : '';
  if (event !== 'relay.owner-ping' && event !== 'relay.owner-pong' && event !== 'relay.ready') return false;
  // Readiness and pong are generated only by this Relay, never by its peers.
  if (event !== 'relay.owner-ping' || envelope.event !== event || envelope.type !== 'control'
    || typeof message !== 'string' || text.length > MAX_OWNER_ECHO_FRAME_CHARS) return true;
  const payload = envelope.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return true;
  const nonce = (payload as Record<string, unknown>).nonce;
  if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) return true;

  const attachment = socket.deserializeAttachment() as SocketAttachment | null;
  if (!attachment || attachment.role !== 'gateway' || attachment.authScope === 'pairing'
    || socket.readyState !== WebSocket.OPEN
    || !attachment.capabilities?.includes(RELAY_OWNER_PONG_V1_CAPABILITY)) return true;
  if (attachment.targetConnectionId) {
    if (!hasClientChannels(runtime) || clientChannel(runtime, attachment.targetConnectionId) !== socket
      || !channelClient(runtime, attachment.targetConnectionId)) return true;
  } else if (runtime.gatewaySocket !== socket) return true;

  const credit = takeHeartbeatEchoCredit(attachment.heartbeatEchoBudget, attachment.lastOwnerPingAt, now);
  if (!credit) return true;
  if (!credit.allowed) {
    // At most one diagnostic per fixed second, including across hibernation.
    // A repeated authenticated ping must not turn this guard into a log flood.
    const window = Math.floor(credit.budget.updatedAt / 1_000) * 1_000;
    if (attachment.lastOwnerPingRateLimitedAt !== window) {
      try {
        socket.serializeAttachment({ ...attachment, lastOwnerPingRateLimitedAt: window });
        logHeartbeat(runtime, attachment, 'rate_limited');
      } catch { /* Without a durable bound, omit the repeated diagnostic. */ }
    }
    return true;
  }
  try {
    // Persist consumption before replying; preserve routing/credential markers.
    socket.serializeAttachment({ ...attachment, lastOwnerPingAt: credit.budget.updatedAt,
      heartbeatEchoBudget: credit.budget });
  } catch {
    logHeartbeat(runtime, attachment, 'attachment_failed');
    return true;
  }
  try {
    socket.send(serializeControlEnvelope({ type: 'control', event: 'relay.owner-pong', payload: { nonce } }));
    logHeartbeat(runtime, attachment, 'echo_sent');
  } catch {
    logHeartbeat(runtime, attachment, 'send_failed');
  }
  return true;
}

function logHeartbeat(runtime: RelayRuntime, attachment: SocketAttachment,
  heartbeatOutcome: 'echo_sent' | 'attachment_failed' | 'send_failed' | 'rate_limited'): void {
  // This records the local Relay action, never delivery or backend health.
  try {
    logRuntimeTelemetry(runtime, 'owner_heartbeat', {
      diagnosticId: attachment.diagnosticId,
      socketKind: attachment.targetConnectionId ? 'channel' : 'owner',
      heartbeatOutcome,
    });
  } catch { /* Observation cannot change the reply or turn success into failure. */ }
}
