import type * as Network from 'expo-network';
import { observeNetworkRecovery } from './networkRecoveryObserver';

function source() {
  let listener!: (hint: Network.NetworkState) => void;
  let resolve!: (hint: Network.NetworkState) => void;
  const remove = jest.fn();
  return {
    source: {
      addNetworkStateListener: jest.fn((next: typeof listener) => { listener = next; return { remove }; }),
      getNetworkStateAsync: jest.fn(() => new Promise<Network.NetworkState>(done => { resolve = done; })),
    },
    emit: (hint: Network.NetworkState) => listener(hint),
    resolve: (hint: Network.NetworkState) => resolve(hint), remove,
  };
}

it('subscribes once and seeds from the initial native state', async () => {
  const native = source(); const onHint = jest.fn(); const stop = observeNetworkRecovery(onHint, native.source);
  native.resolve({ isConnected: true }); await Promise.resolve();
  expect(onHint).toHaveBeenCalledWith({ isConnected: true });
  expect(native.source.addNetworkStateListener).toHaveBeenCalledTimes(1);
  stop(); expect(native.remove).toHaveBeenCalledTimes(1);
});

it('a late initial read cannot erase the newer offline event', async () => {
  const native = source(); const onHint = jest.fn(); const stop = observeNetworkRecovery(onHint, native.source);
  native.emit({ isConnected: false }); native.resolve({ isConnected: true }); await Promise.resolve();
  expect(onHint.mock.calls).toEqual([[{ isConnected: false }]]); stop();
});

it('ignores events and initial responses after unmount', async () => {
  const native = source(); const onHint = jest.fn(); const stop = observeNetworkRecovery(onHint, native.source);
  stop(); native.emit({ isConnected: true }); native.resolve({ isConnected: true }); await Promise.resolve();
  expect(onHint).not.toHaveBeenCalled();
});

it('an unsupported native listener keeps ordinary recovery usable', () => {
  const native = source(); const onHint = jest.fn();
  native.source.addNetworkStateListener.mockImplementation(() => { throw new Error('unavailable'); });
  const stop = observeNetworkRecovery(onHint, native.source);
  expect(onHint).not.toHaveBeenCalled(); expect(() => stop()).not.toThrow();
});
