import { analyticsEvents } from './analytics/events';
import { createTransportDiagnosticReporter, reconnectTransportCause } from './transport-diagnostics';

jest.mock('./analytics/events', () => ({ analyticsEvents: { transportDiagnostic: jest.fn() } }));

it.each(['openclaw', 'hermes', 'codex', 'claude-code', 'pi'] as const)('scopes a fixed transport observation to %s', backend => {
  createTransportDiagnosticReporter({ backend, transport: 'relay', environment: 'preview' })({ event: 'close', phase: 'connecting', code: 'unknown', close_code: 1006, elapsed_ms: 200 });
  expect(analyticsEvents.transportDiagnostic).toHaveBeenLastCalledWith({ backend, transport: 'relay', environment: 'preview', event: 'close', phase: 'connecting', code: 'unknown', close_code: 1006, elapsed_ms: 200 });
});

it('keeps the transport cause separate and never returns raw peer reasons', () => {
  expect(reconnectTransportCause('WebSocket open timed out')).toBe('socket_open_timeout');
  expect(reconnectTransportCause('Relay heartbeat timed out')).toBe('heartbeat_timeout');
  expect(reconnectTransportCause('Gateway handshake timed out')).toBe('handshake_timeout');
  expect(reconnectTransportCause('socket closed')).toBe('socket_close');
  expect(reconnectTransportCause('private token https://host/private')).toBe('unknown');
  expect(reconnectTransportCause()).toBe('unknown');
});
