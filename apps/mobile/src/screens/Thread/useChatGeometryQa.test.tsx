import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import type { ChatGeometryQaApi } from './chatGeometryQa';
Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: true });
const { useChatGeometryQa } = require('./useChatGeometryQa') as typeof import('./useChatGeometryQa');

const api = (globalThis as typeof globalThis & { __CLAWKET_CHAT_GEOMETRY_QA__: ChatGeometryQaApi }).__CLAWKET_CHAT_GEOMETRY_QA__;
const reading = () => ({ offset: 5400, height: 6000, viewport: 600, readerScrolling: true, bottomFollowing: false, historyPaging: false });
let background: ((state: AppStateStatus) => void) | null = null;
let subscription: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    background = callback;
    return { remove: jest.fn() };
  });
});
afterEach(() => { api.stop(); subscription.mockRestore(); jest.useRealTimers(); });

function fixture() {
  let revision = 0;
  const replies: ((value: unknown) => void)[] = [];
  const raw = {
    enable: jest.fn(), sample: jest.fn((receive: (value: unknown) => void) => { replies.push(receive); }), bindingRevision: () => revision,
  };
  const sdk = {
    computeVisibleIndices: jest.fn(() => ({ startIndex: 25, endIndex: 28 })),
    getAbsoluteLastScrollOffset: jest.fn(() => 10000), getFirstItemOffset: jest.fn(() => 56),
    getChildContainerDimensions: jest.fn(() => ({ height: 16000, width: 400 })),
    getWindowSize: jest.fn(() => ({ height: 600, width: 400 })),
    getLayout: jest.fn((index: number) => ({ y: index * 200, height: 200, width: 400, x: 0 })),
    scrollToOffset: jest.fn(), recomputeViewableItems: jest.fn(), recordInteraction: jest.fn(),
  };
  const list = { current: sdk as unknown as FlashListRef<unknown> };
  const rows = Array.from({ length: 80 }, () => ({ text: 'PRIVATE', id: 'PRIVATE' }));
  const hook = renderHook<void, { active: boolean; scope: string }>(({ active, scope }) => useChatGeometryQa({ active, scope, list, rows, raw, reading }), {
    initialProps: { active: true, scope: 'PRIVATE_SCOPE' },
  });
  return { hook, sdk, raw, replies, list, rebind: () => { revision += 1; } };
}

it('samples independent raw and public SDK coordinates without changing the render window', () => {
  const f = fixture();
  expect(f.raw.sample).not.toHaveBeenCalled();
  act(() => { expect(api.start()).toBe('started'); });
  act(() => f.replies[0]!({ available: true, offset: 5400, contentHeight: 6000, viewportHeight: 600, sequence: 3 }));
  expect(api.read().samples[0]).toMatchObject({ rawOffset: 5400, sdkOffset: 10000, jsOffset: 5400,
    rowCount: 80, sdkHeaderOffset: 56, visibleStart: 25, visibleEnd: 28 });
  expect(f.sdk.getLayout.mock.calls).toEqual([[25], [28], [24], [29]]);
  expect(f.sdk.scrollToOffset).not.toHaveBeenCalled();
  expect(f.sdk.recomputeViewableItems).not.toHaveBeenCalled();
  expect(f.sdk.recordInteraction).not.toHaveBeenCalled();
  expect(JSON.stringify(api.read())).not.toContain('PRIVATE');
});

it.each(['scope', 'focus', 'list', 'binding', 'background'] as const)('retires pending evidence across %s changes', change => {
  const f = fixture();
  act(() => { api.start(); });
  if (change === 'scope') f.hook.rerender({ active: true, scope: 'NEXT_PRIVATE_SCOPE' });
  else if (change === 'focus') f.hook.rerender({ active: false, scope: 'PRIVATE_SCOPE' });
  else if (change === 'list') f.list.current = { ...f.sdk } as unknown as FlashListRef<unknown>;
  else if (change === 'binding') f.rebind();
  else act(() => { background?.('background'); });
  act(() => f.replies[0]!({ offset: 25 }));
  expect(api.read()).toMatchObject({ status: 'stopped', samples: [], inFlight: false });
  expect(f.sdk.getAbsoluteLastScrollOffset).not.toHaveBeenCalled();
  expect(f.raw.enable).toHaveBeenLastCalledWith(false);
});

it('exposes unavailable public geometry without trying to repair or render it', () => {
  const f = fixture();
  f.sdk.computeVisibleIndices.mockImplementation(() => { throw new Error('PRIVATE_SDK_ERROR'); });
  act(() => { api.start(); });
  act(() => f.replies[0]!({ available: false }));
  expect(api.read().samples[0]).toMatchObject({ rawAvailable: false, sdkAvailable: false, rowCount: 80, sdkOffset: null });
  expect(JSON.stringify(api.read())).not.toContain('PRIVATE_SDK_ERROR');
  expect(f.sdk.scrollToOffset).not.toHaveBeenCalled();
});

it('does not install the Inspector entry point in a production module', () => {
  const host = globalThis as typeof globalThis & { __CLAWKET_CHAT_GEOMETRY_QA__?: ChatGeometryQaApi };
  const previous = host.__CLAWKET_CHAT_GEOMETRY_QA__;
  delete host.__CLAWKET_CHAT_GEOMETRY_QA__;
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: false });
  try {
    jest.isolateModules(() => { require('./useChatGeometryQa'); });
    expect(host.__CLAWKET_CHAT_GEOMETRY_QA__).toBeUndefined();
  } finally {
    host.__CLAWKET_CHAT_GEOMETRY_QA__ = previous;
    Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: true });
  }
});
