import { describe, expect, it } from 'vitest';
import { takeHeartbeatEchoCredit, type HeartbeatEchoBudget } from './heartbeat-budget';

describe('persistent heartbeat arrival credits', () => {
  it('permits four arrivals then refills at one echo per second', () => {
    let budget: HeartbeatEchoBudget | undefined;
    for (let index = 0; index < 4; index++) {
      const result = takeHeartbeatEchoCredit(budget, undefined, 1_000)!;
      expect(result.allowed).toBe(true);
      budget = result.budget;
    }
    expect(takeHeartbeatEchoCredit(budget, undefined, 1_999)?.allowed).toBe(false);
    expect(takeHeartbeatEchoCredit(budget, undefined, 2_000)).toEqual({ allowed: true,
      budget: { updatedAt: 2_000, creditMs: 0 } });
  });

  it('accepts paced probes whose network delays compress arrival times', () => {
    // Sends at 1000/2000ms with transit delays of 800/100ms arrive 300ms apart.
    const first = takeHeartbeatEchoCredit(undefined, undefined, 1_800)!;
    const second = takeHeartbeatEchoCredit(first.budget, 1_800, 2_100)!;
    expect(first.allowed).toBe(true);
    expect(second).toEqual({ allowed: true, budget: { updatedAt: 2_100, creditMs: 2_300 } });
  });

  it('does not mint credits on rehydration or repeated rejected calls', () => {
    const persisted = JSON.parse(JSON.stringify({ updatedAt: 1_000, creditMs: 0 }));
    for (let now = 1_001; now < 2_000; now++) {
      expect(takeHeartbeatEchoCredit(persisted, 1_000, now)?.allowed).toBe(false);
    }
    expect(takeHeartbeatEchoCredit(persisted, 1_000, 2_000)?.allowed).toBe(true);
  });

  it('migrates old timestamps conservatively and never restores a fresh burst', () => {
    expect(takeHeartbeatEchoCredit(undefined, 1_000, 1_999)?.allowed).toBe(false);
    const upgraded = takeHeartbeatEchoCredit(undefined, 1_000, 2_000)!;
    expect(upgraded).toEqual({ allowed: true, budget: { updatedAt: 2_000, creditMs: 0 } });
    expect(takeHeartbeatEchoCredit(upgraded.budget, 2_000, 2_000)?.allowed).toBe(false);
  });

  it('never gains elapsed credit or moves the anchor backwards on clock rollback', () => {
    const before = { updatedAt: 10_000, creditMs: 1_000 };
    const spent = takeHeartbeatEchoCredit(before, undefined, 1_000)!;
    expect(spent).toEqual({ allowed: true, budget: { updatedAt: 10_000, creditMs: 0 } });
    expect(takeHeartbeatEchoCredit(spent.budget, undefined, 10_999)?.allowed).toBe(false);
    expect(takeHeartbeatEchoCredit(spent.budget, undefined, 11_000)?.allowed).toBe(true);
  });

  it('bounds persisted and idle-refilled credits to the fixed burst', () => {
    expect(takeHeartbeatEchoCredit({ updatedAt: 1_000, creditMs: 999_999 }, undefined, 1_000)?.budget.creditMs).toBe(3_000);
    expect(takeHeartbeatEchoCredit({ updatedAt: 1_000, creditMs: -999 }, undefined, 1_000)?.allowed).toBe(false);
    expect(takeHeartbeatEchoCredit({ updatedAt: 1_000, creditMs: 0 }, undefined, Number.MAX_SAFE_INTEGER)?.budget.creditMs).toBe(3_000);
  });

  it.each([null, [], {}, { updatedAt: NaN, creditMs: 0 }, { updatedAt: 1_000, creditMs: Infinity },
    { updatedAt: -1, creditMs: 0 }, { updatedAt: 1_000, creditMs: 0.5 }, { updatedAt: '1000', creditMs: 0 }])(
    'fails closed on malformed stored budget %j', stored => {
      expect(takeHeartbeatEchoCredit(stored, undefined, 2_000)).toBeNull();
    });
  it.each([NaN, Infinity, -1, 1.5, '1000'])('fails closed on malformed legacy timestamp %j', last => {
    expect(takeHeartbeatEchoCredit(undefined, last, 2_000)).toBeNull();
  });
  it.each([NaN, Infinity, -1, 1.5])('fails closed on invalid current time %j', now => {
    expect(takeHeartbeatEchoCredit(undefined, undefined, now)).toBeNull();
  });
});
