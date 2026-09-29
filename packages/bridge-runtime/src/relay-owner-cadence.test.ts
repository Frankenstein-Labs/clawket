import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayOwnerCadence, relayOwnerClientCount } from './relay-owner-cadence.js';

afterEach(() => vi.useRealTimers());
const count = (value: unknown) => ({ event: 'client_count', count: value });
function fixture(idleIntervalMs = 15_000, repeat = true) {
  vi.useFakeTimers();
  let negotiated = false;
  const onTick = vi.fn();
  const cadence = new RelayOwnerCadence({ idleIntervalMs, repeat, onTick, negotiated: () => negotiated, now: Date.now, socketList: true });
  cadence.schedule();
  return { cadence, onTick, negotiate: () => { negotiated = true; cadence.observe({ event: 'relay.ready' }); } };
}

describe('Relay owner active-client cadence', () => {
  it.each([10_000, 15_000])('keeps unknown and legacy presence at the original %i interval', async idle => {
    const f = fixture(idle);
    try {
      f.cadence.observe(count(1));
      await vi.advanceTimersByTimeAsync(idle - 1); expect(f.onTick).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); expect(f.onTick).toHaveBeenCalledTimes(1);
      f.negotiate(); f.cadence.observe(count(0));
      // The already scheduled fast probe is not postponed by a count of zero.
      await vi.advanceTimersByTimeAsync(5000); expect(f.onTick).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(idle - 1); expect(f.onTick).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1); expect(f.onTick).toHaveBeenCalledTimes(3);
    } finally { f.cadence.dispose(); }
  });

  it('shortens from the existing anchor and flapping never postpones it', async () => {
    const f = fixture(); f.negotiate();
    try {
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        f.cadence.observe(count(1)); f.cadence.observe(count(0));
      }
      expect(f.onTick).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000); expect(f.onTick).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(14_999); expect(f.onTick).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); expect(f.onTick).toHaveBeenCalledTimes(2);
    } finally { f.cadence.dispose(); }
  });

  it('does not create a timer while a confirmation-driven probe is pending', async () => {
    const f = fixture(15_000, false); f.negotiate(); f.cadence.observe(count(1));
    try {
      await vi.advanceTimersByTimeAsync(5000); expect(f.onTick).toHaveBeenCalledTimes(1);
      f.cadence.observe(count(0)); f.cadence.observe(count(1));
      await vi.advanceTimersByTimeAsync(30_000); expect(f.onTick).toHaveBeenCalledTimes(1);
      f.cadence.schedule();
      await vi.advanceTimersByTimeAsync(5000); expect(f.onTick).toHaveBeenCalledTimes(2);
    } finally { f.cadence.dispose(); }
  });

  it('preserves explicitly shorter configured intervals and clears on disposal', async () => {
    const f = fixture(1000); f.negotiate(); f.cadence.observe(count(1));
    await vi.advanceTimersByTimeAsync(3000); expect(f.onTick).toHaveBeenCalledTimes(3);
    f.cadence.dispose(); f.cadence.observe(count(1)); f.cadence.schedule();
    await vi.advanceTimersByTimeAsync(10_000); expect(f.onTick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses valid full-client socket lists and ignores later aggregate counts', async () => {
    const f = fixture(); f.negotiate();
    try {
      f.cadence.observe({ event: 'client.sockets', payload: { clients: ['00000000-0000-4000-8000-000000000001'] } });
      f.cadence.observe(count(0));
      await vi.advanceTimersByTimeAsync(10_000); expect(f.onTick).toHaveBeenCalledTimes(2);
      f.cadence.observe({ event: 'client.sockets', payload: { clients: [] } });
      await vi.advanceTimersByTimeAsync(5000); expect(f.onTick).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(15_000); expect(f.onTick).toHaveBeenCalledTimes(4);
    } finally { f.cadence.dispose(); }
  });

  it.each([-1, 129, 1.5, '1', null, undefined, Infinity])('rejects invalid count %s', value => {
    expect(relayOwnerClientCount(count(value))).toBeNull();
  });
  it.each(['sourceClientId', 'targetClientId'])('rejects forwarded controls marked %s', key => {
    expect(relayOwnerClientCount({ ...count(1), [key]: 'peer' })).toBeNull();
    expect(relayOwnerClientCount({ event: 'client.sockets', payload: { clients: [] }, [key]: 'peer' }, true)).toBeNull();
  });
  it('rejects non-string events without invoking peer-controlled coercion', () => {
    expect(relayOwnerClientCount({ event: { toString: null }, count: 1 })).toBeNull();
    expect(relayOwnerClientCount({ event: ['client_count'], count: 1 })).toBeNull();
  });
  it('rejects invalid/duplicate or unenabled socket lists and preserves count bounds', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    for (const clients of [['bad'], [id, id], new Array(129).fill(id)]) {
      expect(relayOwnerClientCount({ event: 'client.sockets', payload: { clients } }, true)).toBeNull();
    }
    expect(relayOwnerClientCount({ event: 'client.sockets', payload: { clients: [id] } })).toBeNull();
    expect(relayOwnerClientCount({ ...count(1), sourceClientId: undefined, targetClientId: undefined })).toBe(1);
    expect(relayOwnerClientCount({ ...count(1), sourceClientId: null })).toBeNull();
    expect(relayOwnerClientCount(count(0))).toBe(0); expect(relayOwnerClientCount(count(128))).toBe(128);
  });
});
