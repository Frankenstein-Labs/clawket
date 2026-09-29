import type { BackendKind, TransportKind } from '@clawket/agent-protocol';
import type { TransportDiagnostic } from '../connection/transports/types';
import { analyticsEvents } from './analytics/events';

type TransportDiagnosticContext = Readonly<{
  backend: BackendKind;
  transport: TransportKind;
  environment?: 'production' | 'preview' | 'custom' | 'unknown';
}>;

export type TransportDiagnosticEvent = TransportDiagnosticContext & TransportDiagnostic;

export function createTransportDiagnosticReporter(context: TransportDiagnosticContext): (diagnostic: TransportDiagnostic) => void {
  return diagnostic => analyticsEvents.transportDiagnostic({ ...context, ...diagnostic });
}

export type ReconnectDiagnostic = Readonly<{
  origin: 'foreground' | 'health_probe' | 'transport' | 'adapter';
  cause: 'unknown' | 'socket_close' | 'heartbeat_timeout' | 'socket_open_timeout' | 'handshake_timeout' | 'health_failed' | 'not_ready' | 'seq_gap';
}>;

/** A peer-provided reason can only choose a fixed category, never enter telemetry. */
export function reconnectTransportCause(reason?: string): ReconnectDiagnostic['cause'] {
  if (reason === 'WebSocket open timed out') return 'socket_open_timeout';
  if (reason === 'Relay heartbeat timed out' || reason === 'Gateway heartbeat timed out') return 'heartbeat_timeout';
  if (reason === 'Relay handshake timed out' || reason === 'Backend handshake failed' || reason === 'Gateway handshake timed out') return 'handshake_timeout';
  if (reason === 'socket closed' || reason === 'Connection closed') return 'socket_close';
  return 'unknown';
}
