import {
  APP_FOREGROUND_PROBE_AWAY_MS,
  shouldProbeGatewayOnForegroundResume,
} from './foregroundReconnectPolicy';

describe('shouldProbeGatewayOnForegroundResume', () => {
  it('probes on iOS after any real background gap', () => {
    expect(shouldProbeGatewayOnForegroundResume({
      platformOs: 'ios',
      awayMs: 1_000,
      connectionState: 'ready',
    })).toBe(true);
  });

  it('does not probe a ready transport without a background gap', () => {
    expect(shouldProbeGatewayOnForegroundResume({
      platformOs: 'android',
      awayMs: APP_FOREGROUND_PROBE_AWAY_MS - 1,
      connectionState: 'ready',
    })).toBe(false);
  });

  it('probes Android after a brief background network change too', () => {
    expect(shouldProbeGatewayOnForegroundResume({
      platformOs: 'android',
      awayMs: 100,
      connectionState: 'ready',
    })).toBe(true);
  });

  it('still probes immediately when the transport is already not ready', () => {
    expect(shouldProbeGatewayOnForegroundResume({
      platformOs: 'android',
      awayMs: 500,
      connectionState: 'closed',
    })).toBe(true);
  });

  it('does not override pairing-pending recovery state', () => {
    expect(shouldProbeGatewayOnForegroundResume({
      platformOs: 'ios',
      awayMs: 5_000,
      connectionState: 'pairing_pending',
    })).toBe(false);
  });
});
