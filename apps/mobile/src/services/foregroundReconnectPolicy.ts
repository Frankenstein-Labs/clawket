import type { ConnectionState as AdapterConnectionState } from '@clawket/agent-protocol';
import type { ConnectionState as GatewayConnectionState } from '../types';

type ForegroundConnectionState = AdapterConnectionState | GatewayConnectionState;

export const APP_FOREGROUND_PROBE_AWAY_MS = 1;
export const FOREGROUND_PROBE_TIMEOUT_MS = 2_000;

export function shouldProbeGatewayOnForegroundResume(input: {
  platformOs: string;
  awayMs: number;
  connectionState: ForegroundConnectionState;
}): boolean {
  if (input.connectionState === 'pairing_pending') {
    return false;
  }

  // Either platform can change networks while briefly backgrounded. The
  // coordinator coalesces this bounded health check with chat/send recovery.
  return input.connectionState !== 'ready' || input.awayMs >= APP_FOREGROUND_PROBE_AWAY_MS;
}
