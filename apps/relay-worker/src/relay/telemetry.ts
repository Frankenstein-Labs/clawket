import type { RelayRuntime } from './runtime';

// Fail closed: adding a caller field never starts collecting user data implicitly.
const NUMERIC_FIELDS = new Set([
  'awaitingChallengeCount', 'bridgeIdleMs', 'clientCount', 'closeCode', 'count',
  'deadClientsRemoved', 'duplicateSocketsClosed', 'flushed', 'frameBytes', 'frameLimitBytes',
  'nonOpenSocketsClosed', 'openClientCount', 'orphanSocketsClosed', 'pairingClientsExpired',
  'pendingConnectStarts', 'pendingCount', 'queuedMs', 'remaining', 'sinceSocketOpenMs',
  'socketAgeMs', 'timeoutMs', 'tokenCount', 'totalSocketCount', 'ttlMs',
]);
const BOOLEAN_FIELDS = new Set([
  'bridgeReplaced', 'disconnected', 'flushedChallenge', 'gatewayReplaced', 'hasActiveClient',
  'hasBridge', 'hasGateway', 'hasChallengeClient', 'hasPendingChallenge', 'hasRequestId',
  'hasSourceClient', 'hasTargetClient', 'matchedRequest', 'ownerConnected', 'superseded',
]);
const INITIALIZATION_DURATION_FIELDS = new Set([
  'initializationMs', 'roomMetaMs', 'clientTokensMs', 'ownerLoadMs', 'socketsRehydrateMs', 'heartbeatSetupMs',
]);
const STRING_FIELDS: Record<string, readonly string[]> = {
  backend: ['openclaw', 'hermes', 'local-model', 'pi', 'codex', 'claude-code'],
  role: ['gateway', 'client', 'unknown'],
  socketKind: ['owner', 'channel', 'client'],
  heartbeatOutcome: ['echo_sent', 'attachment_failed', 'send_failed', 'rate_limited'],
  initializationOutcome: ['ready', 'error'],
  initializationStep: ['room_meta', 'client_tokens', 'owner', 'sockets', 'heartbeat'],
  authSource: ['bearer', 'query', 'none'],
  authPath: ['mirrored', 'kv', 'registry', 'ticket', 'rejected'],
  frameType: ['text', 'binary'],
  controlEvent: ['relay.ready', 'client_count', 'client_connected', 'client_disconnected',
    'connect_start', 'gateway_ping', 'gateway_pong', 'client_ping', 'client_pong',
    'client_token_hashes', 'pairing.request', 'pairing.response', 'bridge.capabilities',
    'client.sockets', 'client.reconnect-required', 'pairing.secure.start', 'pairing.secure.response'],
  method: ['connect', 'health', 'agents.list', 'sessions.list', 'models.list', 'chat.history',
    'chat.send', 'chat.abort', 'config.get', 'config.schema'],
  reason: ['missing_token', 'invalid_token', 'non_connect_before_active', 'connect_start',
    'client_message', 'non_open_ready_state', 'client_pong_timeout', 'stale_handshake_timeout',
    'close', 'error'],
};

function sanitizeTelemetryFields(fields: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (INITIALIZATION_DURATION_FIELDS.has(key) && typeof value === 'number'
      && Number.isSafeInteger(value) && value >= 0 && value <= 60_000) {
      sanitized[key] = value;
    } else if (NUMERIC_FIELDS.has(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      sanitized[key] = value;
    } else if (BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (Object.hasOwn(STRING_FIELDS, key) && typeof value === 'string') {
      sanitized[key] = STRING_FIELDS[key].includes(value) ? value : 'other';
    } else if (['diagnosticId', 'previousDiagnosticId'].includes(key) && typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      // Server-generated per-socket UUIDs only; no user/device/request identifiers.
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function logRelayTelemetry(
  scope: 'relay_worker' | 'registry_worker' | 'hermes_relay_worker' | 'hermes_registry_worker',
  event: string,
  fields: Record<string, unknown>,
): void {
  const sanitizedFields = sanitizeTelemetryFields(fields);
  console.log(JSON.stringify({
    scope,
    event,
    ts: new Date().toISOString(),
    ...sanitizedFields,
  }));
}

export function logRuntimeTelemetry(
  runtime: RelayRuntime,
  event: string,
  fields: Record<string, unknown>,
): void {
  logRelayTelemetry(runtime.policy.telemetryScope, event, {
    ...fields, backend: runtime.policy.backend,
    ownerConnected: runtime.gatewaySocket?.readyState === 1,
  });
}
