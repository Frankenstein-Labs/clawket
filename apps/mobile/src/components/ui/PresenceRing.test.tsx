import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Animated, AppState, Platform } from 'react-native';
import { useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { PresenceRing } from './PresenceRing';
import { Motion } from '../../theme/tokens';
import { withAlpha } from '../../theme/color';

let mockReducedMotion = false;
let mockLifecycle: ((state: string) => void) | undefined;
const mockRemove = jest.fn();
const mockLoops: Array<{ start: jest.Mock; stop: jest.Mock }> = [];
jest.mock('react-native', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: any) => ReactRuntime.createElement(name, props, children);
  class Value {
    value: number;
    constructor(value: number) { this.value = value; }
    setValue = jest.fn((value: number) => { this.value = value; });
    interpolate = jest.fn((config: unknown) => ({ config, value: this }));
  }
  const quad = (value: number) => value * value;
  return {
    View: host('View'), Platform: { OS: 'android' },
    StyleSheet: { create: (value: unknown) => value, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
    AppState: { currentState: 'active', addEventListener: jest.fn((_: string, callback: (state: string) => void) => {
      mockLifecycle = callback; return { remove: mockRemove };
    }) },
    Easing: { linear: (value: number) => value, quad, inOut: (easing: (value: number) => number) =>
      (value: number) => value < 0.5 ? easing(value * 2) / 2 : 1 - easing((1 - value) * 2) / 2 },
    Animated: {
      Value, View: host('NativeAnimatedView'),
      timing: jest.fn((value: unknown, config: unknown) => ({ value, config })),
      loop: jest.fn(() => { const loop = { start: jest.fn(), stop: jest.fn() }; mockLoops.push(loop); return loop; }),
    },
  };
});
jest.mock('react-native-svg', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: any) => ReactRuntime.createElement(name, props, children);
  return { __esModule: true, default: host('Svg'), Circle: host('Circle'), Path: host('Path') };
});
jest.mock('react-native-reanimated', () => {
  const ReactRuntime = require('react');
  const host = (name: string) => ({ children, ...props }: any) => ReactRuntime.createElement(name, props, children);
  return {
    __esModule: true, default: { View: host('ReanimatedView') },
    Easing: require('react-native').Easing,
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: jest.fn((value: number) => ReactRuntime.useRef({ value }).current),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: jest.fn((value: number) => value), withRepeat: jest.fn((value: number) => value),
    cancelAnimation: jest.fn(),
  };
});

beforeEach(() => {
  Platform.OS = 'android'; AppState.currentState = 'active';
  mockReducedMotion = false; mockLifecycle = undefined; mockLoops.length = 0; jest.clearAllMocks();
});

const props = { avatarSize: 28, color: '#123456', testID: 'presence' };

it('runs the Android working arc on the native driver without a Reanimated progress node', () => {
  const view = render(<PresenceRing {...props} tone="working" />);
  expect(Animated.timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 1_400, useNativeDriver: true, isInteraction: false,
  }));
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  expect(Animated.loop).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ useNativeDriver: true }) }), { iterations: -1 });
  expect(mockLoops[0].start).toHaveBeenCalledTimes(1);
  expect(useSharedValue).not.toHaveBeenCalled();
  expect(withRepeat).not.toHaveBeenCalled();
  const style = view.UNSAFE_getByType('NativeAnimatedView' as any).props.style[1];
  expect(style.transform[0].rotate.config).toEqual({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  expect(style.opacity.config).toEqual({ inputRange: [0, 1], outputRange: [1, 1] });
  expect(view.getByTestId('presence').props.pointerEvents).toBe('none');
  view.unmount();
  expect(mockLoops[0].stop).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

it('encodes the complete eased attention breath in one seamless native cycle', () => {
  const view = render(<PresenceRing {...props} tone="attention" />);
  const config = jest.mocked(Animated.timing).mock.calls[0][1];
  expect(config).toEqual(expect.objectContaining({ duration: Motion.avatarWorkingLoop * 2, useNativeDriver: true, isInteraction: false }));
  // Independently compare every 60 Hz sample against the previous forward/reverse quadratic breath.
  const eased = (value: number) => value < 0.5 ? 2 * value * value : 1 - 2 * (1 - value) ** 2;
  const frameCount = Math.round(Motion.avatarWorkingLoop * 2 / (1000 / 60));
  for (let frame = 0; frame <= frameCount; frame++) {
    const elapsed = frame / frameCount;
    const expected = elapsed <= 0.5 ? eased(elapsed * 2) : 1 - eased(elapsed * 2 - 1);
    expect(config.easing!(elapsed)).toBeCloseTo(expected, 12);
  }
  expect(config.easing!(0)).toBe(0); expect(config.easing!(0.5)).toBe(1); expect(config.easing!(1)).toBe(0);
  const style = view.UNSAFE_getByType('NativeAnimatedView' as any).props.style[1];
  expect(style.opacity.config).toEqual({ inputRange: [0, 1], outputRange: [1, 0.45] });
  expect(style.transform[0].rotate.config).toEqual({ inputRange: [0, 1], outputRange: ['0deg', '0deg'] });
  view.unmount();
});

it.each(['inactive', 'background'] as const)('stops native motion while %s and restarts only on foreground', state => {
  const view = render(<PresenceRing {...props} tone="working" />);
  act(() => mockLifecycle!(state));
  expect(mockLoops[0].stop).toHaveBeenCalledTimes(1);
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  act(() => mockLifecycle!('active'));
  expect(Animated.loop).toHaveBeenCalledTimes(2);
  expect(mockLoops[1].start).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(mockLoops[1].stop).toHaveBeenCalledTimes(1);
});

it('does not start a loop when mounted in the background', () => {
  AppState.currentState = 'background';
  const view = render(<PresenceRing {...props} tone="attention" />);
  expect(Animated.loop).not.toHaveBeenCalled();
  act(() => mockLifecycle!('active'));
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('retires the working loop when status changes and keeps ordinary renders on the same loop', () => {
  const view = render(<PresenceRing {...props} tone="working" />);
  view.rerender(<PresenceRing {...props} color="#abcdef" avatarSize={24} tone="working" />);
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  view.rerender(<PresenceRing {...props} tone="attention" />);
  expect(mockLoops[0].stop).toHaveBeenCalledTimes(1);
  expect(Animated.loop).toHaveBeenCalledTimes(2);
  expect(jest.mocked(Animated.timing).mock.calls[1][1].duration).toBe(Motion.avatarWorkingLoop * 2);
  view.unmount();
});

it.each(['working', 'attention'] as const)('keeps %s still under reduced motion and stops a newly disabled loop', tone => {
  mockReducedMotion = true;
  const view = render(<PresenceRing {...props} tone={tone} />);
  expect(Animated.loop).not.toHaveBeenCalled();
  mockReducedMotion = false;
  view.rerender(<PresenceRing {...props} tone={tone} />);
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  mockReducedMotion = true;
  view.rerender(<PresenceRing {...props} tone={tone} />);
  expect(mockLoops[0].stop).toHaveBeenCalledTimes(1);
  expect(jest.mocked(Animated.timing).mock.calls[0][0].setValue).toHaveBeenLastCalledWith(0);
  view.unmount();
});

it.each(['working', 'attention'] as const)('preserves the %s SVG geometry, colors and accessibility across platforms', tone => {
  const android = render(<PresenceRing {...props} tone={tone} />);
  const svg = android.UNSAFE_getByType('Svg' as any);
  expect(svg.props).toEqual(expect.objectContaining({ width: 36, height: 36, viewBox: '0 0 36 36' }));
  const circle = android.UNSAFE_getByType('Circle' as any);
  expect(circle.props).toEqual(expect.objectContaining({ cx: 18, cy: 18, r: 17, strokeWidth: 2, fill: 'none',
    stroke: tone === 'working' ? withAlpha(props.color, 0.16) : props.color }));
  if (tone === 'working') expect(android.UNSAFE_getByType('Path' as any).props).toEqual(expect.objectContaining({
    d: 'M18 1A17 17 0 0 1 35 18', stroke: props.color, strokeWidth: 2, strokeLinecap: 'round', fill: 'none',
  }));
  const androidSvg = { ...svg.props, children: undefined };
  const androidCircles = android.UNSAFE_getAllByType('Circle' as any).map(node => node.props);
  const androidPaths = android.UNSAFE_queryAllByType('Path' as any).map(node => node.props);
  const androidContainer = { ...android.getByTestId('presence').props, children: undefined };
  android.unmount(); Platform.OS = 'ios';
  const ios = render(<PresenceRing {...props} tone={tone} />);
  expect({ ...ios.UNSAFE_getByType('Svg' as any).props, children: undefined }).toEqual(androidSvg);
  expect(ios.UNSAFE_getAllByType('Circle' as any).map(node => node.props)).toEqual(androidCircles);
  expect(ios.UNSAFE_queryAllByType('Path' as any).map(node => node.props)).toEqual(androidPaths);
  expect({ ...ios.getByTestId('presence').props, children: undefined }).toEqual(androidContainer);
  ios.unmount();
});

it.each(['working', 'attention'] as const)('keeps the existing iOS %s animation driver and cadence', tone => {
  Platform.OS = 'ios';
  const view = render(<PresenceRing {...props} tone={tone} />);
  expect(Animated.loop).not.toHaveBeenCalled(); expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(useSharedValue).toHaveBeenCalledTimes(1);
  expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: tone === 'working' ? 1_400 : Motion.avatarWorkingLoop }));
  expect(withRepeat).toHaveBeenCalledWith(1, -1, tone === 'attention');
  view.unmount();
});
