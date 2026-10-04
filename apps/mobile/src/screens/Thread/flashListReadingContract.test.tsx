import React, { createRef } from 'react';
import { act, render } from '@testing-library/react-native';

// Import the installed implementation, including its controller, native event
// handler, manager, layout engine and engaged-row tracker. Only native hosts
// and native measurement/scroll feedback are simulated; no copied SDK algorithm.
// Load implementation at test runtime; production typechecking consumes the
// package's published declarations, not its source build configuration.
const { RecyclerView } = require('@shopify/flash-list/src/recyclerview/RecyclerView');
import type { FlashListRef } from '@shopify/flash-list';

const mockNative = { height: 6000, viewport: 600, offset: 0, correctionCount: 0 };
const mockScrollTo = jest.fn(({ y = 0 }: { y?: number }) => {
  mockNative.offset = Math.min(Math.max(0, y), Math.max(0, mockNative.height - mockNative.viewport));
});
const originalRaf = global.requestAnimationFrame;
const originalCancelRaf = global.cancelAnimationFrame;

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const original = jest.requireActual('react-native');
  const primitive = (name: string) => ReactRuntime.forwardRef(({ children, index, style, ...props }: any, ref: any) => {
    const previousAnchor = ReactRuntime.useRef(null as number | null);
    ReactRuntime.useImperativeHandle(ref, () => ({
      measureLayout: (_relative: unknown, done: (...values: number[]) => void) => {
        const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
        done(0, 0, 393, index === undefined ? (flat.height ?? mockNative.viewport) : 200);
      },
      scrollTo: mockScrollTo,
    }), [index, style]);
    // Inject native feedback with a content maximum that has not caught up to
    // JS placement. RN normally applies MVCP after the mount; this deliberately
    // injected boundary is NOT evidence that a real phone used an old maximum.
    // It tests the installed SDK's response to that mismatch, not native timing.
    ReactRuntime.useLayoutEffect(() => {
      const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
      const top = flat.height === 0 && flat.position === 'absolute' && flat.top >= 1_000_000 ? flat.top : null;
      if (top !== null && previousAnchor.current !== null && top !== previousAnchor.current) {
        mockNative.correctionCount += 1;
        mockScrollTo({ y: mockNative.offset + top - previousAnchor.current });
      }
      previousAnchor.current = top;
    }, [style]);
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

type Row = { key: string };
const rows = (prefix: string, count: number): Row[] => Array.from({ length: count }, (_, index) => ({ key: `${prefix}:${index}` }));
const scrollEvent = () => ({ nativeEvent: { contentOffset: { x: 0, y: mockNative.offset },
  contentSize: { width: 393, height: mockNative.height }, layoutMeasurement: { width: 393, height: mockNative.viewport } } });

beforeEach(() => {
  jest.useFakeTimers();
  global.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 16) as unknown as number;
  global.cancelAnimationFrame = id => clearTimeout(id);
  Object.assign(mockNative, { height: 6000, viewport: 600, offset: 0, correctionCount: 0 });
  mockScrollTo.mockClear();
});
afterEach(() => {
  jest.clearAllTimers(); jest.useRealTimers();
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancelRaf;
});

it('keeps a window stale after injected native clamp feedback is ignored, until a later real event is delivered', () => {
  const { Text } = require('react-native');
  const old = rows('old', 30);
  const ref = createRef<FlashListRef<Row>>();
  const onScroll = jest.fn();
  const props = { data: old, keyExtractor: (row: Row) => row.key, renderItem: ({ item }: { item: Row }) =>
    <Text testID={`sdk-row-${item.key}`}>{item.key}</Text>, onScroll, testID: 'sdk-scroll' };
  const view = render(<RecyclerView ref={ref} {...props} />);
  try {
    act(() => jest.advanceTimersByTime(120));
    mockNative.offset = 2000;
    act(() => view.getByTestId('sdk-scroll').props.onScroll(scrollEvent()));
    act(() => jest.advanceTimersByTime(120));
    expect(ref.current!.getAbsoluteLastScrollOffset()).toBe(2000);
    const earlier = rows('earlier', 40);
    view.rerender(<RecyclerView ref={ref} {...props} data={[...earlier, ...old]} />);
    expect(mockNative.correctionCount).toBeGreaterThan(0);
    expect(mockNative.offset).toBe(5400); // Old native maximum; the JS child is already longer.
    expect(ref.current!.getAbsoluteLastScrollOffset()).toBe(10000);
    onScroll.mockClear();
    act(() => view.getByTestId('sdk-scroll').props.onScroll(scrollEvent()));
    expect(onScroll).not.toHaveBeenCalled(); // Real SDK onScrollHandler ignores this feedback.
    act(() => jest.advanceTimersByTime(120));
    expect(ref.current!.getAbsoluteLastScrollOffset()).toBe(10000); // Timer only releases the ignore gate.
    expect(view.queryByTestId('sdk-row-earlier:27')).toBeNull(); // Native's actual viewport is not engaged.
    mockNative.height = 14000;
    act(() => view.getByTestId('sdk-scroll').props.onScroll(scrollEvent()));
    expect(ref.current!.getAbsoluteLastScrollOffset()).toBe(5400);
    expect(view.getByTestId('sdk-row-earlier:27')).toBeTruthy(); // A finger supplies the missing native position.
  } finally { view.unmount(); }
});

it('keeps native scroll feedback deliverable when a reader has elected one app correction owner', () => {
  const { Text } = require('react-native');
  const old = rows('old', 30);
  const ref = createRef<FlashListRef<Row>>();
  const onScroll = jest.fn();
  const props = { data: old, keyExtractor: (row: Row) => row.key, renderItem: ({ item }: { item: Row }) =>
    <Text testID={`sdk-row-${item.key}`}>{item.key}</Text>, onScroll, testID: 'sdk-scroll',
    maintainVisibleContentPosition: { disabled: true } };
  const view = render(<RecyclerView ref={ref} {...props} />);
  try {
    act(() => jest.advanceTimersByTime(120));
    mockNative.offset = 2000;
    act(() => view.getByTestId('sdk-scroll').props.onScroll(scrollEvent()));
    const earlier = rows('earlier', 40);
    view.rerender(<RecyclerView ref={ref} {...props} data={[...earlier, ...old]} />);
    expect(mockNative.correctionCount).toBe(0);
    onScroll.mockClear();
    act(() => view.getByTestId('sdk-scroll').props.onScroll(scrollEvent()));
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(ref.current!.getAbsoluteLastScrollOffset()).toBe(mockNative.offset);
  } finally { view.unmount(); }
});
