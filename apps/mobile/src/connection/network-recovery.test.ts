import { NetworkRecoveryHints } from './network-recovery';

const wifi = { type: 'WIFI', isConnected: true, isInternetReachable: true };
const cellular = { ...wifi, type: 'CELLULAR' };
const offline = { type: 'NONE', isConnected: false, isInternetReachable: false };
const setup = () => {
  const invalidate = jest.fn(); const recover = jest.fn();
  return { invalidate, recover, hints: new NetworkRecoveryHints(invalidate, recover) };
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('seeds initial availability and ignores duplicate or unknown notifications', () => {
  const { hints, recover, invalidate } = setup();
  hints.update(wifi); hints.update(wifi); hints.update({ type: 'UNKNOWN' });
  jest.advanceTimersByTime(10_000);
  expect(recover).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
});

it('invalidates offline health immediately but waits for a stable available hint to recover', () => {
  const { hints, recover, invalidate } = setup();
  hints.update(wifi); hints.update(offline); hints.update(offline);
  jest.advanceTimersByTime(60_000);
  expect(invalidate).toHaveBeenCalledTimes(1); expect(recover).not.toHaveBeenCalled();
  hints.update(wifi); jest.advanceTimersByTime(299); expect(recover).not.toHaveBeenCalled();
  hints.update(wifi); jest.advanceTimersByTime(1); expect(recover).toHaveBeenCalledTimes(1);
});

it('allows one retry on a known Wi-Fi to cellular path change', () => {
  const { hints, recover, invalidate } = setup();
  hints.update(wifi); hints.update(cellular); jest.advanceTimersByTime(300);
  expect(recover).toHaveBeenCalledTimes(1); expect(invalidate).toHaveBeenCalledTimes(1);
});

it('coalesces flaps and bounds extra attempts to one per five seconds', () => {
  const { hints, recover } = setup();
  hints.update(offline); hints.update(wifi); jest.advanceTimersByTime(300);
  expect(recover).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 20; i += 1) {
    hints.update(offline); jest.advanceTimersByTime(50);
    hints.update(wifi); jest.advanceTimersByTime(50);
  }
  expect(recover).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(2_999); expect(recover).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1); expect(recover).toHaveBeenCalledTimes(2);
});

it('cancels a pending retry if connectivity disappears during the stable window', () => {
  const { hints, recover } = setup();
  hints.update(offline); hints.update(wifi); jest.advanceTimersByTime(299);
  hints.update(offline); jest.advanceTimersByTime(10_000);
  expect(recover).not.toHaveBeenCalled();
});

it('does not treat connected but explicitly unreachable as an available retry hint', () => {
  const { hints, recover } = setup();
  hints.update(offline); hints.update({ ...wifi, isInternetReachable: false });
  jest.advanceTimersByTime(1_000); expect(recover).not.toHaveBeenCalled();
  hints.update(wifi); jest.advanceTimersByTime(300); expect(recover).toHaveBeenCalledTimes(1);
});

it('leaves background recovery to foreground and cancels old adapter timers', () => {
  const { hints, recover } = setup();
  hints.update(offline); hints.update(wifi); hints.setActive(false);
  jest.advanceTimersByTime(1_000); hints.setActive(true); jest.advanceTimersByTime(1_000);
  expect(recover).not.toHaveBeenCalled();
  hints.update(cellular); hints.cancelPending(); jest.advanceTimersByTime(1_000);
  expect(recover).not.toHaveBeenCalled();
});

it('reset cancels delayed hints and seeds the next lifecycle without replaying them', () => {
  const { hints, recover } = setup();
  hints.update(offline); hints.update(wifi); hints.reset();
  jest.advanceTimersByTime(1_000); hints.update(cellular); jest.advanceTimersByTime(1_000);
  expect(recover).not.toHaveBeenCalled();
});
