import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated } from '../../../__mocks__/native-animated';
import { Motion } from '../../theme/tokens';
import { TypingDots } from './TypingDots';

let mockReducedMotion = false;
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  ...require('../../../__mocks__/native-animated'),
  View: 'View',
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => mockReducedMotion }));
jest.mock('../../theme', () => ({ useAppTheme: () => ({ theme: { colors: { inkSecondary: '#777' } } }) }));

beforeEach(() => {
  mockReducedMotion = false;
  jest.clearAllMocks();
});

it('runs the persistent header animation on the native driver without blocking list work', () => {
  const view = render(<TypingDots testID="dots" />);
  expect(Animated.timing).toHaveBeenCalledWith(expect.any(Animated.Value), expect.objectContaining({
    duration: Motion.avatarWorkingLoop, useNativeDriver: true, isInteraction: false,
  }));
  const loop = Animated.loop.mock.results[0].value;
  expect(loop.start).toHaveBeenCalledTimes(1);
  // Streaming updates must not rebuild or restart the persistent animation.
  const style = view.getByTestId('typing-dot-0').props.style[2];
  view.rerender(<TypingDots testID="dots" />);
  expect(Animated.loop).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('typing-dot-0').props.style[2]).toBe(style);
  view.unmount();
  expect(loop.stop).toHaveBeenCalledTimes(1);
});

it('preserves staggered lift and opacity, clamped to rest outside each dot window', () => {
  const view = render(<TypingDots />);
  for (let index = 0; index < 3; index++) {
    const style = view.getByTestId(`typing-dot-${index}`).props.style[2];
    expect(style.opacity).toMatchObject({ outputRange: [0.32, 1, 0.32], extrapolate: 'clamp' });
    expect(style.transform[0].translateY).toMatchObject({ outputRange: [0, -2, 0], extrapolate: 'clamp' });
    expect(style.opacity.inputRange[0]).toBeCloseTo(index / 3);
  }
});

it('keeps reduced-motion dots static and stops an existing loop when motion is reduced', () => {
  const view = render(<TypingDots />);
  const loop = Animated.loop.mock.results[0].value;
  mockReducedMotion = true;
  view.rerender(<TypingDots />);
  expect(loop.stop).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 3; index++) {
    expect(view.getByTestId(`typing-dot-${index}`).props.style[2]).toEqual({ opacity: 0.32, transform: [{ translateY: 0 }] });
  }
  expect(Animated.loop).toHaveBeenCalledTimes(1);
});
