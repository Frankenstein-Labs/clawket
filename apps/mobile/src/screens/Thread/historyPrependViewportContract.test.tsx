import React, { createRef, useLayoutEffect, useRef } from 'react';
import { act, render } from '@testing-library/react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { useHistoryScrollAnchor } from './useHistoryScrollAnchor';

// The installed SDK owns its real data update, manager, layouts, holders and
// render window. Only native host measurement, mount and event delivery are
// modeled. A host commit here is not evidence of a phone paint.
const { RecyclerView } = require('@shopify/flash-list/src/recyclerview/RecyclerView');
type Row = { key: string; type: 'message' | 'date'; height: number };
type Cell = { key: string; top: number; height: number };
const mockNative = { offset: 40, height: 3240, viewport: 400 };
const mockCells = new Map<symbol, Cell>();
const mockCommands: number[] = [];
let mockNativeScrollHandler: ((value: ReturnType<typeof event>) => void) | null = null;
const mockScrollTo = jest.fn(({ y = 0 }: { y?: number }) => { mockCommands.push(y); });
const mockCommits: Array<{ offset: number; height: number; keys: string[] }> = [];
const mockCaptureCommit = () => {
  const keys = [...mockCells.values()].filter(cell => cell.top < mockNative.offset + mockNative.viewport
    && cell.top + cell.height > mockNative.offset).sort((a, b) => a.top - b.top).map(cell => cell.key);
  mockCommits.push({ offset: mockNative.offset, height: mockNative.height, keys });
};

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const original = jest.requireActual('react-native');
  const primitive = (name: string) => ReactRuntime.forwardRef(({ children, index, style, ...props }: any, ref: any) => {
    const identity = ReactRuntime.useRef(Symbol());
    const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
    const row = ReactRuntime.Children.toArray(children).find((child: any) => child?.props?.testID?.startsWith('row:')) as any;
    const height = row?.props?.style.height ?? 100;
    ReactRuntime.useImperativeHandle(ref, () => ({
      measureLayout: (_relative: unknown, done: (...values: number[]) => void) =>
        done(0, 0, 393, index === undefined ? (flat.height ?? mockNative.viewport) : height),
      scrollTo: mockScrollTo,
    }), [height, index, style]);
    ReactRuntime.useLayoutEffect(() => {
      if (index !== undefined && row) mockCells.set(identity.current, { key: row.props.testID.slice(4), top: flat.top, height });
      return () => { mockCells.delete(identity.current); };
    }, [children, height, index, style]);
    ReactRuntime.useLayoutEffect(() => {
      if (name === 'ScrollView') mockNativeScrollHandler = props.onScroll;
    }, [props.onScroll]);
    return ReactRuntime.createElement(name, { ...props, index, style }, children);
  });
  const View = primitive('View');
  const ScrollView = primitive('ScrollView');
  return { ...original, View, ScrollView, Text: primitive('Text'), TextInput: primitive('TextInput'),
    Switch: primitive('Switch'), Pressable: primitive('Pressable'), RefreshControl: primitive('RefreshControl'),
    Platform: { ...original.Platform, OS: 'android', constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } } },
    PixelRatio: { getPixelSizeForLayoutSize: (value: number) => value, roundToNearestPixel: (value: number) => value },
    Animated: { View, ScrollView, createAnimatedComponent: (value: unknown) => value,
      Value: class { interpolate() { return 0; } }, event: (_mapping: unknown, options: any) => options.listener },
  };
});
jest.mock('@shopify/flash-list/src/native/config/PlatformHelper', () =>
  jest.requireActual('@shopify/flash-list/src/native/config/PlatformHelper.android'));

const numbered = (first: number, last: number): Row[] => [{ key: `date:${first}`, type: 'date', height: 40 },
  ...Array.from({ length: last - first + 1 }, (_, index) => [
    { key: `user:${first + index}`, type: 'message' as const, height: 100 },
    { key: `assistant:${first + index}`, type: 'message' as const, height: 100 },
  ]).flat()];
const event = (position: Partial<{ offset: number; height: number }> = {}) => ({ nativeEvent: {
  contentOffset: { x: 0, y: position.offset ?? mockNative.offset },
  contentSize: { width: 393, height: position.height ?? mockNative.height },
  layoutMeasurement: { width: 393, height: mockNative.viewport } } });
type HarnessApi = {
  begin: () => void;
  nativeSize: (height: number) => void;
  applyCommand: () => void;
  deliverAck: (position?: Partial<{ offset: number; height: number }>) => void;
  snapshot: () => { sdkOffset: number; firstVisibleKey: string | undefined; survivorTop: number | undefined;
    correctionPending: boolean };
};

function Harness({ rows, api }: { rows: Row[]; api: React.RefObject<HarnessApi | null> }) {
  const { Text } = require('react-native');
  const list = useRef<FlashListRef<Row>>(null);
  const reading = useRef(false);
  const anchor = useHistoryScrollAnchor('scope', list, rows);
  const report = () => ({ nativeMaxOffset: mockNative.height - mockNative.viewport,
    nativeOffset: mockNative.offset, nativeHeight: mockNative.height, viewport: mockNative.viewport,
    windowCommitEpoch: anchor.windowCommitEpoch });
  useLayoutEffect(() => {
    api.current = {
      begin: () => { reading.current = true; anchor.beginDrag(false, { offset: mockNative.offset, height: mockNative.height }); },
      nativeSize: height => { mockNative.height = height; anchor.restore({ ...report(), nativeGeometryCommitted: true }); },
      applyCommand: () => {
        const target = mockCommands.shift();
        if (target === undefined) throw new Error('missing modeled native command');
        mockNative.offset = Math.min(target, mockNative.height - mockNative.viewport);
        mockCaptureCommit();
      },
      deliverAck: position => { mockNativeScrollHandler!(event(position)); },
      snapshot: () => ({ sdkOffset: list.current!.getAbsoluteLastScrollOffset(),
        firstVisibleKey: rows[list.current!.computeVisibleIndices().startIndex]?.key,
        survivorTop: list.current!.getLayout(rows.findIndex(row => row.key === 'user:25'))?.y,
        correctionPending: anchor.isCorrectionPending() }),
    };
  });
  return <RecyclerView ref={list} data={rows} testID="native-scroll"
    keyExtractor={(row: Row) => row.key} getItemType={(row: Row) => row.type}
    renderItem={({ item }: { item: Row }) => <Text style={{ height: item.height }} testID={`row:${item.key}`}>{item.key}</Text>}
    maintainVisibleContentPosition={anchor.managed ? { disabled: true } : undefined}
    drawDistance={anchor.drawDistance}
    onScroll={(value: ReturnType<typeof event>) => anchor.readerScrolled(value.nativeEvent.contentOffset.y, reading.current,
      value.nativeEvent.contentSize.height)}
    onCommitLayoutEffect={() => { mockCaptureCommit(); anchor.restore(report()); }} />;
}

const originalRaf = global.requestAnimationFrame;
const originalCancelRaf = global.cancelAnimationFrame;
beforeEach(() => {
  jest.useFakeTimers();
  global.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 16) as unknown as number;
  global.cancelAnimationFrame = id => clearTimeout(id);
  Object.assign(mockNative, { offset: 40, height: 3240, viewport: 400 });
  mockCells.clear(); mockCommands.length = 0; mockCommits.length = 0; mockScrollTo.mockClear(); mockNativeScrollHandler = null;
});
afterEach(() => {
  jest.clearAllTimers(); jest.useRealTimers();
  global.requestAnimationFrame = originalRaf; global.cancelAnimationFrame = originalCancelRaf;
});
const settleExisting = (api: React.RefObject<HarnessApi | null>) => {
  act(() => jest.advanceTimersByTime(120));
  // Establish the same initial native position in the real SDK. This event
  // precedes the reader gesture and does not elect a reading anchor.
  act(() => api.current!.deliverAck());
};

it('records the intermediate SDK window and restores the survivor only after independent native command and ACK stages', () => {
  const api = createRef<HarnessApi>();
  const old = numbered(25, 40);
  const view = render(<Harness rows={old} api={api} />);
  try {
    settleExisting(api);
    expect(mockCommits.at(-1)?.keys).toContain('user:25');
    act(() => api.current!.begin());
    mockCommands.length = 0;
    mockCommits.length = 0;
    // The earlier page replaces the conditional date:25 separator while both
    // user and assistant identities of the existing turns survive.
    view.rerender(<Harness rows={[...numbered(9, 24), ...old.slice(1)]} api={api} />);
    // The size event is withheld independently of the SDK's new row commits.
    expect(mockCommands).toHaveLength(0);
    const beforeSize = mockCommits.map(commit => commit.keys);
    expect(beforeSize.length).toBeGreaterThan(0);
    // New holder layouts already intersect the unchanged modeled native
    // offset. This is a characterized host window, not an Android paint or
    // an atomic child-layout/offset guarantee from the SDK's public API.
    expect(beforeSize.every(keys => keys.join(',') === 'user:9,assistant:9,user:10,assistant:10')).toBe(true);
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 40, firstVisibleKey: 'user:9',
      survivorTop: 3240, correctionPending: true });
    act(() => api.current!.nativeSize(6440));
    expect(mockCommands).toEqual([3240]);
    expect(mockNative.offset).toBe(40);
    act(() => api.current!.applyCommand());
    // A command's native position and its JS onScroll ACK are distinct stages.
    expect(mockCommits.at(-1)?.keys).toEqual(['user:25', 'assistant:25', 'user:26', 'assistant:26']);
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 40, correctionPending: true });
    act(() => api.current!.deliverAck());
    mockCaptureCommit();
    expect(mockCommits.at(-1)?.keys).toEqual(['user:25', 'assistant:25', 'user:26', 'assistant:26']);
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 3240, firstVisibleKey: 'user:25',
      correctionPending: false });
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

it('waits for a native maximum that reaches the survivor instead of sending a command against a partial child', () => {
  const api = createRef<HarnessApi>();
  const old = numbered(25, 40);
  const view = render(<Harness rows={old} api={api} />);
  try {
    settleExisting(api);
    act(() => api.current!.begin());
    mockCommands.length = 0;
    view.rerender(<Harness rows={[...numbered(9, 24), ...old.slice(1)]} api={api} />);
    // Even a new content height is insufficient when its native maximum
    // remains 10 px short of the real SDK layout's anchored target.
    act(() => api.current!.nativeSize(3630));
    expect(mockCommands).toHaveLength(0);
    expect(api.current!.snapshot().correctionPending).toBe(true);
    act(() => api.current!.nativeSize(6440));
    expect(mockCommands).toEqual([3240]);
    act(() => api.current!.applyCommand());
    act(() => api.current!.deliverAck());
    mockCaptureCommit();
    expect(mockCommits.at(-1)?.keys).toEqual(['user:25', 'assistant:25', 'user:26', 'assistant:26']);
    expect(api.current!.snapshot().correctionPending).toBe(false);
  } finally { view.unmount(); }
});

it('keeps a fresh old-child drag displacement while the prepend size and command ACK remain delayed', () => {
  const api = createRef<HarnessApi>();
  const old = numbered(25, 40);
  const view = render(<Harness rows={old} api={api} />);
  try {
    settleExisting(api);
    act(() => api.current!.begin());
    mockCommands.length = 0;
    view.rerender(<Harness rows={[...numbered(9, 24), ...old.slice(1)]} api={api} />);
    // The fresh finger still moves in the old native child's coordinate
    // space. New JS layouts must not select user:9 as that gesture's anchor.
    act(() => api.current!.begin());
    mockNative.offset = 140;
    act(() => api.current!.deliverAck());
    expect(mockCommands).toHaveLength(0);
    act(() => api.current!.nativeSize(6440));
    expect(mockCommands).toEqual([3340]);
    act(() => api.current!.applyCommand());
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 140, correctionPending: true });
    act(() => api.current!.deliverAck());
    mockCaptureCommit();
    expect(mockCommits.at(-1)?.keys).toEqual(['assistant:25', 'user:26', 'assistant:26', 'user:27']);
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 3340, firstVisibleKey: 'assistant:25',
      correctionPending: false });
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});

it('observes ordinary reader scrolling through the SDK native handler without changing row identities', () => {
  const api = createRef<HarnessApi>();
  const view = render(<Harness rows={numbered(25, 40)} api={api} />);
  try {
    settleExisting(api);
    act(() => api.current!.begin());
    mockCommands.length = 0;
    mockCommits.length = 0;
    mockNative.offset = 140;
    act(() => api.current!.deliverAck());
    mockCaptureCommit();
    expect(mockCommits.at(-1)?.keys).toEqual(['assistant:25', 'user:26', 'assistant:26', 'user:27']);
    expect(mockCommands).toHaveLength(0);
  } finally { view.unmount(); }
});

it('does not let a delayed unacknowledged command replace a fresh reader anchor after estimate convergence', () => {
  const api = createRef<HarnessApi>();
  const old = numbered(25, 40);
  const view = render(<Harness rows={old} api={api} />);
  const page = (dateHeight: number) => {
    const rows = [...numbered(9, 24), ...old.slice(1)];
    rows[0] = { ...rows[0], height: dateHeight };
    return rows;
  };
  try {
    settleExisting(api);
    act(() => api.current!.begin());
    mockCommands.length = 0;
    view.rerender(<Harness rows={page(40)} api={api} />);
    act(() => api.current!.nativeSize(6440));
    view.rerender(<Harness rows={page(60)} api={api} />);
    act(() => api.current!.nativeSize(6460));
    expect(mockCommands[0]).toBe(3240);
    expect(mockCommands.length).toBeGreaterThan(1);
    expect(new Set(mockCommands.slice(1))).toEqual(new Set([3260]));
    act(() => api.current!.applyCommand());
    // Withhold this first command's event while later commands settle.
    expect(api.current!.snapshot().correctionPending).toBe(true);
    while (mockCommands.length) {
      act(() => api.current!.applyCommand());
      act(() => api.current!.deliverAck());
    }
    expect(api.current!.snapshot().correctionPending).toBe(false);

    mockNative.offset = 3360;
    act(() => api.current!.begin());
    act(() => api.current!.deliverAck());
    // A buffered event can update the SDK's public offset without moving
    // the modeled native host. Its old command identity must not re-anchor
    // the fresh reader, whose assistant:25 is now at viewport Y=0.
    act(() => api.current!.deliverAck({ offset: 3240, height: 6440 }));
    expect(mockNative.offset).toBe(3360);
    view.rerender(<Harness rows={page(80)} api={api} />);
    act(() => api.current!.nativeSize(6480));
    expect(mockCommands.length).toBeGreaterThan(0);
    expect(new Set(mockCommands)).toEqual(new Set([3380]));
    while (mockCommands.length) {
      act(() => api.current!.applyCommand());
      act(() => api.current!.deliverAck());
    }
    mockCaptureCommit();
    expect(mockCommits.at(-1)?.keys).toEqual(['assistant:25', 'user:26', 'assistant:26', 'user:27']);
    expect(api.current!.snapshot()).toMatchObject({ sdkOffset: 3380, firstVisibleKey: 'assistant:25',
      correctionPending: false });
  } finally { view.unmount(); }
});
