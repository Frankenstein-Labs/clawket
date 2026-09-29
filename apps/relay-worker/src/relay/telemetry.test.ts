import { describe, expect, it, vi } from 'vitest';
import { logRelayTelemetry } from './telemetry';

describe('relay telemetry', () => {
  it('keeps authSource while redacting sensitive identifiers and secrets', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logRelayTelemetry('relay_worker', 'ws_connected', {
      authSource: 'bearer',
      gatewayId: 'gw_sensitive',
      clientId: 'ios_sensitive',
      traceId: 'trace_sensitive',
      token: 'token_sensitive',
      secret: 'secret_sensitive',
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(consoleSpy.mock.calls[0][0])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      scope: 'relay_worker',
      event: 'ws_connected',
      authSource: 'bearer',
    });
    expect(payload.gatewayId).toBeUndefined();
    expect(payload.clientId).toBeUndefined();
    expect(payload.traceId).toBeUndefined();
    expect(payload.token).toBeUndefined();
    expect(payload.secret).toBeUndefined();
  });
});

it.each(['relay_worker', 'hermes_relay_worker'] as const)('keeps only a generated diagnostic UUID for %s', (scope) => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const diagnosticId = '01234567-89ab-4def-8abc-0123456789ab';
    logRelayTelemetry(scope, 'client_socket_replaced', { diagnosticId, previousDiagnosticId: diagnosticId, token: 'private-token' });
    expect(JSON.parse(String(spy.mock.calls.at(-1)?.[0]))).toMatchObject({ diagnosticId, previousDiagnosticId: diagnosticId });
    logRelayTelemetry(scope, 'client_socket_replaced', { diagnosticId: 'token=private-token', previousDiagnosticId: 'raw-device-id' });
    const result = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
    expect(result.diagnosticId).toBeUndefined();
    expect(result.previousDiagnosticId).toBeUndefined();
  } finally { spy.mockRestore(); }
});

it('fails closed for new fields, payloads and peer-controlled text while retaining numeric evidence', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const privateText = 'private transcript /Users/name https://host/?token=secret';
    logRelayTelemetry('relay_worker', 'client_request_rejected_no_bridge', {
      method: privateText, reason: privateText, controlEvent: privateText,
      payload: { text: privateText }, message: privateText, newField: privateText,
      traceHint: privateText, clientLabel: privateText, role: 'client', frameBytes: 123, closeCode: 1006,
      pendingCount: NaN, socketAgeMs: -1, count: privateText, hasGateway: true,
    });
    const result = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
    expect(result).toEqual({ scope: 'relay_worker', event: 'client_request_rejected_no_bridge', ts: expect.any(String),
      method: 'other', reason: 'other', controlEvent: 'other', role: 'client', frameBytes: 123, closeCode: 1006, hasGateway: true });
    expect(JSON.stringify(result)).not.toContain('private');
  } finally { spy.mockRestore(); }
});

it('allowlists heartbeat outcomes without collecting nonce, payload or native errors', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    for (const heartbeatOutcome of ['echo_sent', 'attachment_failed', 'send_failed', 'rate_limited', 'private error']) {
      logRelayTelemetry('relay_worker', 'owner_heartbeat', {
        heartbeatOutcome, nonce: 'private nonce', payload: { nonce: 'private nonce' }, error: 'private exception',
      });
      const result = JSON.parse(String(spy.mock.calls.at(-1)?.[0]));
      expect(result).toEqual({ scope: 'relay_worker', event: 'owner_heartbeat', ts: expect.any(String),
        heartbeatOutcome: heartbeatOutcome === 'private error' ? 'other' : heartbeatOutcome });
      expect(JSON.stringify(result)).not.toContain('private');
    }
  } finally { spy.mockRestore(); }
});

it('bounds initialization durations and rejects arbitrary phase or error text', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    logRelayTelemetry('relay_worker', 'room_initialization', {
      initializationOutcome: 'private failure', initializationStep: 'private path',
      initializationMs: 60_000, roomMetaMs: 60_001, clientTokensMs: -1,
      ownerLoadMs: NaN, socketsRehydrateMs: 0, heartbeatSetupMs: 1_250,
      error: 'private credential', message: 'private transcript',
    });
    expect(JSON.parse(String(spy.mock.calls.at(-1)?.[0]))).toEqual({
      scope: 'relay_worker', event: 'room_initialization', ts: expect.any(String),
      initializationOutcome: 'other', initializationStep: 'other', initializationMs: 60_000,
      socketsRehydrateMs: 0, heartbeatSetupMs: 1_250,
    });
  } finally { spy.mockRestore(); }
});
