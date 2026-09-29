import { scheduleRequestTimeout } from './request-timeout';

describe('same-socket transfer-aware RPC timeout', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

  it.each([5_000, 15_000, 20_000, 45_000, 190_000])('preserves an ordinary %i ms deadline', timeout => {
    const expire = jest.fn();
    scheduleRequestTimeout({ getTransferGraceMs: () => 0 }, timeout, expire);
    jest.advanceTimersByTime(timeout - 1); expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('waits for a known transfer but never extends beyond the request’s own 90 seconds', () => {
    const expire = jest.fn();
    scheduleRequestTimeout({ getTransferGraceMs: () => 90_000 }, 5_000, expire);
    jest.advanceTimersByTime(89_999); expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(expire).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(90_000); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('allows one normal backend response window after the queued frame drains', () => {
    const expire = jest.fn(); let remaining = 90_000;
    scheduleRequestTimeout({ getTransferGraceMs: () => remaining }, 20_000, expire);
    jest.advanceTimersByTime(25_000); expect(expire).not.toHaveBeenCalled();
    remaining = 0;
    jest.advanceTimersByTime(1_000); expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(19_999); expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('cancels on an actual backend reply after transfer completion, without treating its echo as the reply', () => {
    const expire = jest.fn(); let remaining = 90_000;
    const cancel = scheduleRequestTimeout({ getTransferGraceMs: () => remaining }, 20_000, expire);
    jest.advanceTimersByTime(25_000); remaining = 0;
    jest.advanceTimersByTime(2_000); expect(expire).not.toHaveBeenCalled(); cancel();
    jest.advanceTimersByTime(100_000); expect(expire).not.toHaveBeenCalled();
  });

  it('clamps the post-transfer response window to the original request hard limit', () => {
    const expire = jest.fn(); let remaining = 90_000;
    scheduleRequestTimeout({ getTransferGraceMs: () => remaining }, 20_000, expire);
    jest.advanceTimersByTime(85_000); remaining = 0;
    jest.advanceTimersByTime(4_999); expect(expire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('cancels a deferred timer on response or socket retirement', () => {
    const expire = jest.fn();
    const cancel = scheduleRequestTimeout({ getTransferGraceMs: () => 90_000 }, 5_000, expire);
    jest.advanceTimersByTime(20_000); cancel();
    jest.advanceTimersByTime(200_000); expect(expire).not.toHaveBeenCalled();
  });

  it('does not extend an existing long native settings deadline', () => {
    const expire = jest.fn();
    scheduleRequestTimeout({ getTransferGraceMs: () => 90_000 }, 190_000, expire);
    jest.advanceTimersByTime(190_000); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('expires after deep sleep despite a frozen monotonic clock and an apparently active source lease', () => {
    const expire = jest.fn();
    jest.spyOn(globalThis.performance, 'now').mockReturnValue(0);
    scheduleRequestTimeout({ getTransferGraceMs: () => 90_000 }, 20_000, expire);
    jest.advanceTimersByTime(20_000); expect(expire).not.toHaveBeenCalled();
    jest.setSystemTime(Date.now() + 91_000);
    jest.advanceTimersByTime(1_000); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('does not lengthen the absolute RPC cap when the wall clock moves backwards', () => {
    const expire = jest.fn();
    scheduleRequestTimeout({ getTransferGraceMs: () => 90_000 }, 20_000, expire);
    jest.advanceTimersByTime(20_000); jest.setSystemTime(Date.now() - 120_000);
    jest.advanceTimersByTime(70_000); expect(expire).toHaveBeenCalledTimes(1);
  });

  it('does not let the post-transfer response window outlive wall time during deep sleep', () => {
    const expire = jest.fn(); let grace = 90_000;
    jest.spyOn(globalThis.performance, 'now').mockReturnValue(0);
    scheduleRequestTimeout({ getTransferGraceMs: () => grace }, 20_000, expire);
    jest.advanceTimersByTime(25_000); grace = 0;
    jest.advanceTimersByTime(1_000); expect(expire).not.toHaveBeenCalled();
    jest.setSystemTime(Date.now() + 91_000);
    jest.advanceTimersByTime(20_000); expect(expire).toHaveBeenCalledTimes(1);
  });
});
