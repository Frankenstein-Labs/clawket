import type { ConnectionState } from '../types';
import { APP_FOREGROUND_PROBE_AWAY_MS, FOREGROUND_PROBE_TIMEOUT_MS, shouldProbeGatewayOnForegroundResume } from '../services/foregroundReconnectPolicy';

export const FOREGROUND_REFRESH_DELAY_MS_SHORT = 500;
export const FOREGROUND_REFRESH_DELAY_MS_LONG = 800;
export const FOREGROUND_RECONNECT_AWAY_MS = APP_FOREGROUND_PROBE_AWAY_MS;
export const FOREGROUND_REFRESH_AFTER_RECONNECT_TIMEOUT_MS = FOREGROUND_PROBE_TIMEOUT_MS;

export function shouldReconnectBeforeForegroundRefresh(input: {
  platformOs: string;
  awayMs: number;
  hasRunningChat: boolean;
  connectionState: ConnectionState;
}): boolean {
  return shouldProbeGatewayOnForegroundResume(input);
}

export function getForegroundRefreshDelayMs(awayMs: number): number {
  return awayMs >= 4_000 ? FOREGROUND_REFRESH_DELAY_MS_LONG : FOREGROUND_REFRESH_DELAY_MS_SHORT;
}
