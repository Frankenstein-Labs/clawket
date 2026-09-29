import { RelayTransferLease, RELAY_TRANSFER_MIN_BYTES, RELAY_TRANSFER_MAX_BYTES } from './transfer-lease';

describe('Relay large-frame lease', () => {
  let now = 0;
  beforeEach(() => { now = 0; });

  it('accepts only bounded integer frame sizes and preserves the original deadline', () => {
    const lease = new RelayTransferLease(() => now);
    for (const bytes of [undefined, '131072', NaN, Infinity, 131072.5, RELAY_TRANSFER_MIN_BYTES - 1, RELAY_TRANSFER_MAX_BYTES + 1]) {
      expect(lease.begin(bytes)).toBe(false);
    }
    expect(lease.hasWindow).toBe(false);
    expect(lease.remainingMs).toBe(0);
    expect(lease.begin(RELAY_TRANSFER_MIN_BYTES)).toBe(true);
    const first = lease.generation;
    now = 70_000;
    expect(lease.begin(RELAY_TRANSFER_MAX_BYTES)).toBe(true);
    expect(lease.remainingMs).toBe(20_000);
    expect(lease.confirmProbe(first)).toBe(false);
    expect(lease.remainingMs).toBe(20_000);
  });

  it('does not renew an expired lease without a fresh matching-generation round trip', () => {
    const lease = new RelayTransferLease(() => now);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    const oldGeneration = lease.generation;
    now = 95_000;
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.hasWindow).toBe(true);
    expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(oldGeneration)).toBe(false);
    expect(lease.confirmProbe(lease.generation)).toBe(true);
    expect(lease.hasWindow).toBe(false);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.remainingMs).toBe(90_000);
  });

  it('counts system sleep even when the native monotonic clock is paused', () => {
    let wall = 1_000_000;
    const lease = new RelayTransferLease(() => now, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    wall += 91_000;
    expect(lease.remainingMs).toBe(0);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(lease.generation)).toBe(true);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.remainingMs).toBe(90_000);
  });

  it('cannot renew its budget when the wall clock moves backwards', () => {
    let wall = 1_000_000;
    const lease = new RelayTransferLease(() => now, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); wall -= 120_000; now = 90_000;
    expect(lease.remainingMs).toBe(0);
  });

  it('keeps an observed expiry latched through wall rollback until a fresh probe confirms it', () => {
    let wall = 1_000_000;
    const lease = new RelayTransferLease(() => now, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); const beforeExpiry = lease.generation;
    wall += 91_000; expect(lease.remainingMs).toBe(0);
    wall -= 91_000; expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(beforeExpiry)).toBe(false);
    expect(lease.confirmProbe(lease.generation)).toBe(true);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); expect(lease.remainingMs).toBe(90_000);
  });

  it('retires a complete hinted download without declaring health or renewing the absolute window', () => {
    const lease = new RelayTransferLease(() => now);
    lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming');
    const generation = lease.generation;
    expect(lease.confirmProbe(generation)).toBe(false);
    expect(lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES - 1)).toBe(false);
    now = 2_000;
    expect(lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES)).toBe(true);
    expect(lease.graceMs).toBe(0);
    expect(lease.hasWindow).toBe(true);
    expect(lease.remainingMs).toBe(88_000);
    now = 30_000; lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming');
    expect(lease.graceMs).toBe(60_000);
    expect(lease.confirmProbe(generation)).toBe(false);
  });

  it('a completed download cannot remove protection for a concurrent upload', () => {
    const lease = new RelayTransferLease(() => now);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    now = 25_000;
    lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming');
    expect(lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES)).toBe(true);
    expect(lease.graceMs).toBe(65_000);
    expect(lease.confirmProbe(lease.generation)).toBe(true);
    expect(lease.graceMs).toBe(0);
  });

  it('observes and latches expiry through a grace read even after delivery removed download protection', () => {
    let wall = 1_000_000;
    const lease = new RelayTransferLease(() => now, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming'); lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES);
    const generation = lease.generation;
    wall += 91_000; expect(lease.graceMs).toBe(0);
    wall -= 91_000; expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(generation)).toBe(false);
  });
});
