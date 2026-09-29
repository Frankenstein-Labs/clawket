import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { AndroidChatKeyboardAvoider } from './AndroidChatKeyboardAvoider';

let mockHandlers: Record<string, (event: { height: number; progress: number }) => void>;
let mockAnimatedStyle: () => { paddingBottom: number };
let mockGarbagePadding = 999;
let mockDeferJS = false;
let mockPendingJS: Array<() => void> = [];
const mockContext = { reanimated: { height: { value: 0 }, progress: { value: 0 } } };

jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const flatten = (style: any): any => Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten)) : style ?? {};
  return {
    View: ReactRuntime.forwardRef(({ children, ...props }: any, ref: any) => ReactRuntime.createElement('View', { ...props, ref }, children)),
    Text: ({ children }: any) => ReactRuntime.createElement('Text', {}, children),
    StyleSheet: { flatten },
  };
});

jest.mock('react-native-keyboard-controller', () => ({
  useKeyboardContext: () => mockContext,
  useWindowDimensions: () => ({ height: 832 }),
  useGenericKeyboardHandler: (handlers: typeof mockHandlers) => { mockHandlers = handlers; },
  // Calling the mode-changing API is an error in this component.
  useKeyboardHandler: () => { throw new Error('Do not change input mode'); },
}));

jest.mock('react-native-reanimated', () => {
  const ReactRuntime = require('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (Component: any) => ReactRuntime.forwardRef((props: any, ref: any) =>
      // Reproduce the library appending old settled props after caller styles.
      ReactRuntime.createElement(Component, { ...props, ref, paddingBottom: mockGarbagePadding,
        style: [props.style, { paddingBottom: mockGarbagePadding }] })) },
    useSharedValue: (initial: any) => ReactRuntime.useRef({ value: initial }).current,
    useAnimatedStyle: (updater: typeof mockAnimatedStyle) => { mockAnimatedStyle = updater; return {}; },
    runOnUI: (fn: (...args: any[]) => void) => fn,
    runOnJS: (fn: (...args: any[]) => void) => (...args: any[]) => {
      if (mockDeferJS) mockPendingJS.push(() => fn(...args)); else fn(...args);
    },
  };
});

beforeEach(() => {
  mockContext.reanimated.height.value = 0;
  mockContext.reanimated.progress.value = 0;
  mockGarbagePadding = 999;
  mockDeferJS = false;
  mockPendingJS = [];
});

function mount(offset = -36) {
  const view = render(<AndroidChatKeyboardAvoider testID="avoider" keyboardVerticalOffset={offset} style={{ flex: 1 }}>
    <Text>Same content</Text>
  </AndroidChatKeyboardAvoider>);
  fireEvent(view.getByTestId('avoider'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 384, height: 832 } } });
  return view;
}
const event = (kind: string, height: number, progress: number) => act(() => mockHandlers[kind]({ height, progress }));
const flush = () => act(() => { while (mockPendingJS.length) mockPendingJS.shift()!(); });
const padding = (view: ReturnType<typeof mount>) => StyleSheet.flatten(view.getByTestId('avoider').props.style).paddingBottom;

it('filters stale style and top-level GC padding while retaining ordinary styles and children', () => {
  const view = mount();
  expect(padding(view)).toBe(0);
  expect(view.getByTestId('avoider').props.paddingBottom).toBeUndefined();
  expect(StyleSheet.flatten(view.getByTestId('avoider').props.style).flex).toBe(1);
  expect(view.getByText('Same content')).toBeTruthy();
});

it('follows actual frame progress, not the opening destination; React only adopts the endpoint', () => {
  const view = mount();
  event('onStart', 358.4, 1);
  expect(mockAnimatedStyle().paddingBottom).toBe(0);
  event('onMove', 179.2, 0.5);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(161.2);
  expect(padding(view)).toBe(0);
  event('onEnd', 358.4, 1);
  expect(padding(view)).toBeCloseTo(322.4);
});

it('keeps the settled baseline on close start and commits zero only at native end', () => {
  const view = mount();
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  event('onStart', 0, 0);
  expect(padding(view)).toBeCloseTo(322.4);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(322.4);
  event('onMove', 179.2, 0.5);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(161.2);
  expect(padding(view)).toBeCloseTo(322.4);
  event('onEnd', 0, 0);
  expect(mockAnimatedStyle().paddingBottom).toBe(0);
  expect(padding(view)).toBe(0);
});

it('does not publish a JS boundary for every keyboard frame', () => {
  const view = mount();
  event('onStart', 358.4, 1);
  mockDeferJS = true;
  for (let step = 1; step < 20; step++) event('onMove', 358.4 * step / 20, step / 20);
  expect(mockPendingJS).toHaveLength(0);
  expect(padding(view)).toBe(0);
  event('onEnd', 358.4, 1);
  expect(mockPendingJS).toHaveLength(1);
  flush();
  expect(padding(view)).toBeCloseTo(322.4);
});

it('keeps active baseline and identities through unrelated rerenders and stale GC samples', () => {
  const view = mount(); const host = view.getByTestId('avoider'); const content = view.getByText('Same content');
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  event('onStart', 0, 0); event('onMove', 179.2, 0.5);
  mockGarbagePadding = 11;
  view.rerender(<AndroidChatKeyboardAvoider testID="avoider" keyboardVerticalOffset={-36} style={{ flex: 1 }}>
    <Text>Same content</Text>
  </AndroidChatKeyboardAvoider>);
  expect(view.getByTestId('avoider')).toBe(host); expect(view.getByText('Same content')).toBe(content);
  expect(padding(view)).toBeCloseTo(322.4);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(161.2);
  event('onEnd', 0, 0);
  expect(padding(view)).toBe(0);
});

it('initializes an already-open keyboard from the provider on first measured layout', () => {
  mockContext.reanimated.height.value = -358.4;
  mockContext.reanimated.progress.value = 1;
  const view = mount();
  expect(padding(view)).toBeCloseTo(322.4);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(322.4);
});

it('recomputes settled geometry on an offset change without remounting content', () => {
  mockContext.reanimated.height.value = -358.4; mockContext.reanimated.progress.value = 1;
  const view = mount(); const host = view.getByTestId('avoider');
  view.rerender(<AndroidChatKeyboardAvoider testID="avoider" keyboardVerticalOffset={-20}><Text>Same content</Text></AndroidChatKeyboardAvoider>);
  expect(view.getByTestId('avoider')).toBe(host); expect(padding(view)).toBeCloseTo(338.4);
});

it('rejects queued JS endpoints once the UI thread has already begun another transition', () => {
  const view = mount();
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  mockDeferJS = true;
  event('onStart', 0, 0); event('onEnd', 0, 0);
  // A new opening is already active before JS receives the old closing endpoint.
  event('onStart', 358.4, 1);
  flush();
  expect(padding(view)).toBeCloseTo(322.4);
  event('onMove', 179.2, 0.5); event('onEnd', 358.4, 1); flush();
  expect(padding(view)).toBeCloseTo(322.4);
});

it('also rejects an older queued endpoint when two transitions share the same destination height', () => {
  const view = mount(); mockDeferJS = true;
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  event('onStart', 358.4, 1); flush();
  expect(padding(view)).toBe(0);
  event('onEnd', 358.4, 1); flush(); expect(padding(view)).toBeCloseTo(322.4);
});

it('ignores the old native closing endpoint after a reversed opening starts', () => {
  const view = mount();
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  event('onStart', 0, 0); event('onMove', 179.2, 0.5);
  event('onStart', 358.4, 1); event('onEnd', 0, 0);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(161.2);
  event('onEnd', 358.4, 1); expect(padding(view)).toBeCloseTo(322.4);
});

it('handles interactive movement without a preceding start and settles on cancellation', () => {
  const view = mount();
  event('onInteractive', 179.2, 0.5);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(161.2);
  expect(padding(view)).toBe(0);
  event('onEnd', 0, 0); expect(padding(view)).toBe(0);
});

it('recovers a missed start from the first native frame and retires an older seed callback', () => {
  mockDeferJS = true;
  const view = mount();
  event('onMove', 75, 0.25);
  expect(mockAnimatedStyle().paddingBottom).toBeCloseTo(66);
  flush(); expect(padding(view)).toBe(0);
  // Layout while moving cannot publish a premature settled baseline.
  fireEvent(view.getByTestId('avoider'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 384, height: 820 } } });
  expect(mockPendingJS).toHaveLength(0);
  event('onEnd', 300, 1); flush(); expect(padding(view)).toBe(252);
});

it('does not poison geometry with invalid native frame values or divide by zero', () => {
  const view = mount();
  event('onStart', 300, 1); event('onMove', 75, 0.25);
  for (const kind of ['onMove', 'onInteractive', 'onEnd']) {
    event(kind, Number.NaN, 1); event(kind, 300, Number.NaN);
  }
  expect(mockAnimatedStyle().paddingBottom).toBe(66);
  event('onMove', 0, 0); expect(mockAnimatedStyle().paddingBottom).toBe(0);
  event('onEnd', 300, 1); expect(padding(view)).toBe(264);
});

it('drops pending boundary work after unmount', () => {
  const view = mount(); mockDeferJS = true;
  event('onStart', 358.4, 1); event('onEnd', 358.4, 1);
  view.unmount(); expect(() => flush()).not.toThrow();
});
