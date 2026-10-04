import { act, render, renderHook } from '@testing-library/react-native';
import React from 'react';
import { AppState, Platform, View, type AppStateStatus } from 'react-native';
jest.mock('react-native', () => ({ ...jest.requireActual('react-native'), View: 'View' }));
jest.mock('expo-application', () => ({ applicationId: 'com.p697.clawket.qa' }));
import { ChatGeometryQaCell } from './ChatGeometryQaCell';
import { useHistoryScrollAnchor } from './useHistoryScrollAnchor';
import type { FlashListRef } from '@shopify/flash-list';
import type { ChatGeometryQaApi } from './chatGeometryQa';
Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: true });
const { useChatGeometryQa } = require('./useChatGeometryQa') as typeof import('./useChatGeometryQa');

const api = (globalThis as typeof globalThis & { __CLAWKET_CHAT_GEOMETRY_QA__: ChatGeometryQaApi }).__CLAWKET_CHAT_GEOMETRY_QA__;
const reading = () => ({ offset: 5400, height: 6000, viewport: 600, readerScrolling: true, bottomFollowing: false, historyPaging: false });
let background: ((state: AppStateStatus) => void) | null = null;
let subscription: jest.SpyInstance;
const pendingReplies: Array<(value: unknown) => void> = [];
const originalPlatform = Platform.OS;
const originalOptIn = process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;

beforeEach(() => {
  jest.useFakeTimers();
  Platform.OS = 'android'; process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = '1';
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active', writable: true });
  subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    background = callback;
    return { remove: jest.fn() };
  });
});
afterEach(() => { api.stop(); pendingReplies.splice(0).forEach(receive => receive({ available: false }));
  subscription.mockRestore(); jest.useRealTimers(); Platform.OS = originalPlatform;
  if (originalOptIn === undefined) delete process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;
  else process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = originalOptIn;
});

function fixture() {
  let revision = 0;
  const replies: ((value: unknown) => void)[] = [];
  const raw = {
    enable: jest.fn(), sample: jest.fn((receive: (value: unknown) => void) => { replies.push(receive); pendingReplies.push(receive); }), bindingRevision: () => revision,
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
  const hook = renderHook<ReturnType<typeof useChatGeometryQa>, { active: boolean; scope: string }>(({ active, scope }) => useChatGeometryQa({ active, scope, list, rows, raw, reading }), {
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
  f.hook.result.current.observe({ kind: 'content_size', contentHeight: 999 });
  expect(api.read()).toMatchObject({ status: 'stopped', samples: [], inFlight: false });
  expect(f.sdk.getAbsoluteLastScrollOffset).not.toHaveBeenCalled();
  expect(f.raw.enable).toHaveBeenLastCalledWith(false);
});

it('starts with unreported React cells and records subsequent actual recycle/unmount without a native wrapper or UI query', () => {
  const f = fixture(); const observe = f.hook.result.current.cell;
  const view = render(<ChatGeometryQaCell index={25} observe={observe}><View testID="existing-cell" /></ChatGeometryQaCell>);
  expect(api.read()).toMatchObject({ viewport: { sequence: 0, events: [] } });
  act(() => { api.start(); });
  f.hook.result.current.observe({ kind: 'layout_commit' });
  expect(api.read()).toMatchObject({ viewport: { initialIncomplete: true, events: [{ mountedCount: null }] } });
  const native = view.getByTestId('existing-cell');
  view.rerender(<ChatGeometryQaCell index={26} observe={observe}><View testID="existing-cell" /></ChatGeometryQaCell>);
  expect(view.getByTestId('existing-cell')).toBe(native);
  expect(api.read()).toMatchObject({ viewport: { events: [
    { kind: 'layout_commit', mountedCount: null }, { kind: 'cell_unmount', anchorIndex: 25, mountedCount: 0 },
    { kind: 'cell_mount', anchorIndex: 26, mountedStart: 26, mountedEnd: 26, mountedCount: 1 },
  ] } });
  view.unmount();
  expect((api.read() as any).viewport.events.at(-1)).toMatchObject({
    kind: 'cell_unmount', mountedCount: 0, mountedStart: null, mountedEnd: null });
  expect(f.sdk.computeVisibleIndices).not.toHaveBeenCalled(); expect(f.raw.sample).toHaveBeenCalledTimes(1);
});

it('bounds lifecycle bookkeeping and leaves overflow/incomplete coverage visible', () => {
  const f = fixture(); act(() => { api.start(); });
  for (let index = 0; index < 257; index += 1) f.hook.result.current.cell(index, true);
  expect(api.read()).toMatchObject({ viewport: { sequence: 257, dropped: 225, initialIncomplete: true,
    events: expect.arrayContaining([expect.objectContaining({ mountedCount: 256, mountedTruncated: true })]) } });
});

it('reports truncation rather than silently clipping repeated lifecycle observations at one index', () => {
  const f = fixture(); act(() => { api.start(); });
  for (let count = 0; count < 257; count += 1) f.hook.result.current.cell(25, true);
  expect((api.read() as any).viewport.events.at(-1)).toMatchObject({
    mountedStart: 25, mountedEnd: 25, mountedCount: 256, mountedTruncated: true });
});

it('retires on focus departure without changing the QA cell or remounting its native child', () => {
  const f = fixture();
  const view = render(<ChatGeometryQaCell index={25} observe={f.hook.result.current.cell}><View testID="stable-cell" /></ChatGeometryQaCell>);
  const child = view.getByTestId('stable-cell'), observer = f.hook.result.current.cell;
  act(() => { api.start(); });
  f.hook.rerender({ active: false, scope: 'PRIVATE_SCOPE' });
  view.rerender(<ChatGeometryQaCell index={25} observe={f.hook.result.current.cell}><View testID="stable-cell" /></ChatGeometryQaCell>);
  expect(f.hook.result.current.enabled).toBe(true);
  expect(f.hook.result.current.cell).toBe(observer);
  expect(view.getByTestId('stable-cell')).toBe(child);
  expect(api.read().status).toBe('stopped');
  const sequence = (api.read() as any).viewport.sequence;
  f.hook.rerender({ active: true, scope: 'PRIVATE_SCOPE' });
  f.hook.result.current.observe({ kind: 'layout_commit' });
  expect((api.read() as any).viewport.sequence).toBe(sequence);
  expect(f.raw.sample).toHaveBeenCalledTimes(1);
});

it('leaves stage and cell recording inert when any QA gate is absent', () => {
  delete process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;
  const f = fixture(); act(() => { api.start(); });
  expect(f.hook.result.current.enabled).toBe(false);
  f.hook.result.current.cell(25, true); f.hook.result.current.observe({ kind: 'content_size', contentHeight: 123 });
  expect(api.read()).toMatchObject({ viewport: { sequence: 0, events: [] } });
});

it('observes actual anchor commands and delayed/older ACK lineage without sending additional commands', () => {
  let rows = [{ key: 'PRIVATE_25', type: 'message' }, { key: 'PRIVATE_26', type: 'message' }];
  let positions = [0, 200], offset = 40;
  const list = { current: { getFirstVisibleIndex: () => 0, getFirstItemOffset: () => 0,
    getAbsoluteLastScrollOffset: () => offset, getLayout: (index: number) => ({ y: positions[index]!, height: 200 }),
    scrollToOffset: jest.fn(), computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }),
    getChildContainerDimensions: () => ({ height: 400, width: 400 }), getWindowSize: () => ({ height: 200, width: 400 }) } };
  const raw = { enable: jest.fn(), sample: jest.fn((receive: (value: unknown) => void) => receive({ available: false })), bindingRevision: () => 0 };
  const hook = renderHook<{ qa: ReturnType<typeof useChatGeometryQa>; anchor: ReturnType<typeof useHistoryScrollAnchor> }, { rows: typeof rows }>(({ rows }) => {
    const qa = useChatGeometryQa({ active: true, scope: 'PRIVATE', rows, list: list as any, raw, reading });
    const anchor = useHistoryScrollAnchor('PRIVATE', list, rows, 250, qa.observe);
    return { qa, anchor };
  }, { initialProps: { rows } });
  act(() => { api.start(); hook.result.current.anchor.capture(); });
  rows = [{ key: 'PRIVATE_09', type: 'message' }, ...rows]; positions = [0, 3200, 3400];
  hook.rerender({ rows });
  act(() => { hook.result.current.anchor.restore(); });
  expect(list.current.scrollToOffset).toHaveBeenCalledTimes(1);
  const first = (api.read() as any).viewport.events[0];
  expect(first).toMatchObject({ kind: 'offset_command', targetOffset: 3240, anchorIndex: 1, anchorY: 3200 });
  positions = [0, 3220, 3420]; act(() => hook.result.current.anchor.restore());
  act(() => { hook.result.current.anchor.readerScrolled(3240, false, 3800); hook.result.current.anchor.readerScrolled(3260, false, 3800); });
  expect((api.read() as any).viewport.events.map((event: any) => event.kind)).toEqual(['offset_command', 'offset_command', 'older_ack', 'offset_ack']);
  expect((api.read() as any).viewport.events[2].commandSequence).toBe(first.sequence);
  expect(list.current.scrollToOffset).toHaveBeenCalledTimes(2); expect(JSON.stringify(api.read())).not.toContain('PRIVATE');
});

it('does not associate a pending old anchor ACK with a reused sequence in another Inspector capture', () => {
  let y = 0;
  const rows = [{ key: 'PRIVATE', type: 'message' }];
  const list = { current: { getFirstVisibleIndex: () => 0, getFirstItemOffset: () => 0,
    getAbsoluteLastScrollOffset: () => 40, getLayout: () => ({ y, height: 200 }), scrollToOffset: jest.fn(),
    computeVisibleIndices: () => ({ startIndex: 0, endIndex: 0 }),
    getChildContainerDimensions: () => ({ height: 4000, width: 400 }), getWindowSize: () => ({ height: 200, width: 400 }) } };
  const raw = { enable: jest.fn(), sample: (receive: (value: unknown) => void) => receive({ available: false }), bindingRevision: () => 0 };
  const hook = renderHook(() => {
    const qa = useChatGeometryQa({ active: true, scope: 'PRIVATE', rows, list: list as any, raw, reading });
    return { qa, anchor: useHistoryScrollAnchor('PRIVATE', list, rows, 250, qa.observe) };
  });
  act(() => { api.start(); hook.result.current.anchor.capture(); y = 3200; hook.result.current.anchor.restore(); });
  expect((api.read() as any).viewport.events[0]).toMatchObject({ sequence: 1, kind: 'offset_command', targetOffset: 3240 });
  act(() => { api.stop(); expect(api.start()).toBe('started'); });
  hook.result.current.qa.observe({ kind: 'layout_commit' });
  hook.result.current.qa.observe({ kind: 'content_size', contentHeight: 4000 });
  act(() => { expect(hook.result.current.anchor.readerScrolled(3240, false, 4000)).toBe(true); });
  expect((api.read() as any).viewport.events[2]).toMatchObject({ sequence: 3, kind: 'offset_ack', commandSequence: null });
  act(() => { y = 3220; hook.result.current.anchor.restore(); hook.result.current.anchor.readerScrolled(3260, false, 4000); });
  expect((api.read() as any).viewport.events[4]).toMatchObject({ kind: 'offset_ack', commandSequence: 4 });
  expect(list.current.scrollToOffset).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(api.read())).not.toContain('PRIVATE');
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
