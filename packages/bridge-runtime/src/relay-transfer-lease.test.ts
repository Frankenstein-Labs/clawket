import { describe, expect, it } from 'vitest';
import { advertiseRelayTransfer, RELAY_TRANSFER_LEASE_MS, RELAY_TRANSFER_MAX_BYTES, RELAY_TRANSFER_MIN_BYTES, RelayTransferLease } from './relay-transfer-lease.js';

describe('same-socket bounded transfer allowance', () => {
  it.each([undefined, null, '131072', NaN, Infinity, -1, 1.2, RELAY_TRANSFER_MIN_BYTES - 1, RELAY_TRANSFER_MAX_BYTES + 1])('rejects invalid size %s without changing state', bytes => {
    const lease = new RelayTransferLease(() => 0);
    expect(lease.begin(bytes)).toBe(false); expect(lease.generation).toBe(0);
    expect(lease.hasWindow).toBe(false); expect(lease.remainingMs).toBe(0);
  });

  it('keeps an absolute 90s bound across repeated frames and remains locked after expiry', () => {
    let now = 0;
    const lease = new RelayTransferLease(() => now, () => now);
    expect(lease.begin(RELAY_TRANSFER_MIN_BYTES)).toBe(true);
    expect(lease.remainingMs).toBe(90_000);
    now = 60_000; lease.begin(RELAY_TRANSFER_MAX_BYTES);
    expect(lease.remainingMs).toBe(30_000); expect(lease.generation).toBe(2);
    now = RELAY_TRANSFER_LEASE_MS; lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.remainingMs).toBe(0); expect(lease.hasWindow).toBe(true);
    expect(lease.confirmProbe(2)).toBe(false); expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(3)).toBe(false);
    expect(lease.confirmProbe(lease.generation)).toBe(true); expect(lease.hasWindow).toBe(false);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); expect(lease.remainingMs).toBe(90_000);
  });

  it('only clears early with a probe sent after the most recent transfer generation', () => {
    const lease = new RelayTransferLease(() => 200, () => 200);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); const stale = lease.generation;
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.confirmProbe(stale)).toBe(false); expect(lease.remainingMs).toBe(90_000);
    expect(lease.confirmProbe(lease.generation)).toBe(true); expect(lease.remainingMs).toBe(0);
    // The caller keeps instances scoped to one socket; successors inherit nothing.
    expect(new RelayTransferLease(() => 200).hasWindow).toBe(false);
  });

  it('ends only a matching completed inbound allowance without creating health evidence', () => {
    const lease = new RelayTransferLease(() => 0, () => 0);
    lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming'); const generation = lease.generation;
    expect(lease.confirmProbe(generation)).toBe(false);
    expect(lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES - 1)).toBe(false);
    expect(lease.graceMs).toBe(90_000);
    expect(lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES)).toBe(true);
    expect(lease.generation).toBe(generation); expect(lease.graceMs).toBe(0);
    expect(lease.hasWindow).toBe(true); expect(lease.remainingMs).toBe(90_000);
    expect(lease.confirmProbe(generation)).toBe(true); expect(lease.hasWindow).toBe(false);
  });

  it('does not let completed inbound data clear an unconfirmed concurrent outgoing frame', () => {
    let now = 0;
    const lease = new RelayTransferLease(() => now, () => now);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    now = 25_000; lease.begin(RELAY_TRANSFER_MIN_BYTES, 'incoming');
    const generation = lease.generation;
    lease.completeIncoming(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.graceMs).toBe(65_000); expect(lease.generation).toBe(generation);
    expect(lease.confirmProbe(generation)).toBe(true); expect(lease.graceMs).toBe(0);
  });

  it('expires across suspension even if the monotonic clock pauses, and never revives on wall rollback', () => {
    let mono = 100, wall = 1000;
    const lease = new RelayTransferLease(() => mono, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    const preSleepProbe = lease.generation;
    wall += 90_001;
    expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(preSleepProbe)).toBe(false);
    wall = 1000; lease.begin(RELAY_TRANSFER_MIN_BYTES);
    expect(lease.remainingMs).toBe(0);
    expect(lease.confirmProbe(lease.generation)).toBe(true);
    lease.begin(RELAY_TRANSFER_MIN_BYTES); expect(lease.remainingMs).toBe(90_000);
    mono += 90_001;
    expect(lease.remainingMs).toBe(0);
  });

  it('uses monotonic expiry when wall time moves backwards', () => {
    let mono = 0, wall = 10_000;
    const lease = new RelayTransferLease(() => mono, () => wall);
    lease.begin(RELAY_TRANSFER_MIN_BYTES);
    wall -= 500_000; mono = 89_000;
    expect(lease.remainingMs).toBe(1000);
    mono = 90_000; expect(lease.remainingMs).toBe(0);
  });

  it('advertises the additive capability once without erasing owner/channel capabilities', () => {
    const url = new URL('wss://relay.test/ws?capabilities=bridge.client-sockets.v1,relay.owner-pong.v1');
    advertiseRelayTransfer(url); advertiseRelayTransfer(url);
    expect(url.searchParams.get('capabilities')).toBe('bridge.client-sockets.v1,relay.owner-pong.v1,relay.transfer-hint.v1');
  });
});
