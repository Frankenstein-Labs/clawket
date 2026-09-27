import React from 'react';
import { act, render } from '@testing-library/react-native';
import { CompanionScene } from './CompanionScene';
import { LoadingState, useLoadingHandoff } from '../LoadingState';

jest.mock('react-native', () => {
  const R = require('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => R.createElement(name, props, children);
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.default },
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
    StyleSheet: { create: (value: unknown) => value, absoluteFill: {} },
    View: host('View'),
    Text: host('Text'),
    Pressable: host('Pressable'),
  };
});
jest.mock('react-native-svg', () => {
  const R = require('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => R.createElement(name, props, children);
  return new Proxy({ __esModule: true }, {
    get: (target: Record<string, unknown>, name: string) => (name in target ? target[name] : host(name === 'default' ? 'Svg' : name)),
  });
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../theme', () => ({
  useAppTheme: () => ({ theme: { scheme: 'light', colors: { ink: '#111113', canvas: '#ffffff', surface: '#f2f2f4', line: '#e4e4e8', inkSecondary: '#6b6b72' } } }),
}));
jest.mock('../Button', () => ({ Button: (props: Record<string, unknown>) => require('react').createElement('Button', props) }));
jest.mock('../../../services/haptics', () => ({
  triggerHeavyImpact: jest.fn(), triggerLightImpact: jest.fn(), triggerMediumImpact: jest.fn(), triggerSelectionHaptic: jest.fn(),
}));

const haptics = jest.requireMock('../../../services/haptics') as Record<string, jest.Mock>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function pressable(view: ReturnType<typeof render>) {
  return view.getByTestId('scene');
}

it.each(['peek', 'fetch', 'yarn', 'pounce', 'listen'] as const)('draws the %s scene in one SVG stage', (scene) => {
  const view = render(<CompanionScene scene={scene} phase="wait" testID="scene" />);
  expect(view.UNSAFE_getAllByType('Svg' as unknown as React.ComponentType).length).toBeGreaterThan(0);
  // The Companion is always part of the stage: its face path comes from the shared geometry.
  expect(view.UNSAFE_getAllByType('Path' as unknown as React.ComponentType).length).toBeGreaterThan(3);
  view.unmount();
});

it('answers a tap with a press, a happy flavour and a light haptic, then rests', () => {
  const view = render(<CompanionScene scene="yarn" phase="wait" testID="scene" />);
  act(() => { pressable(view).props.onPress(); });
  // Math.random() = 0 picks the weighted favourite: a hop with hearts.
  expect(view.getByTestId('companion-mark-heart1')).toBeTruthy();
  expect(haptics.triggerLightImpact).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(1_400); });
  expect(view.queryByTestId('companion-mark-heart1')).toBeNull();
});

it('greets the tap that finds a hidden cat with surprise', () => {
  const view = render(<CompanionScene scene="peek" phase="wait" testID="scene" />);
  act(() => { pressable(view).props.onPress(); });
  expect(view.getByTestId('companion-mark-bang')).toBeTruthy();
});

it('warns, then swipes the glass on rapid taps, sulks and calms down', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  const view = render(<CompanionScene scene="yarn" phase="wait" testID="scene" />);
  for (let index = 0; index < 3; index += 1) act(() => { pressable(view).props.onPress(); });
  expect(view.getByTestId('companion-mark-vein')).toBeTruthy();
  expect(haptics.triggerMediumImpact).toHaveBeenCalled();
  // A random of 0.99 sets the patience limit to seven taps.
  for (let index = 0; index < 4; index += 1) act(() => { pressable(view).props.onPress(); });
  expect(view.getByTestId('companion-claw')).toBeTruthy();
  expect(haptics.triggerHeavyImpact).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(420); });
  expect(view.getByTestId('companion-mark-dots')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(2_000); });
  expect(view.queryByTestId('companion-mark-dots')).toBeNull();
  expect(view.queryByTestId('companion-claw')).toBeNull();
});

it('purrs while petted and settles when released', () => {
  const view = render(<CompanionScene scene="listen" phase="wait" testID="scene" />);
  expect(pressable(view).props.delayLongPress).toBe(450);
  act(() => { pressable(view).props.onLongPress(); });
  expect(view.getByTestId('companion-mark-purr')).toBeTruthy();
  expect(view.getByTestId('companion-mark-heart1')).toBeTruthy();
  act(() => { jest.advanceTimersByTime(270); });
  expect(haptics.triggerSelectionHaptic).toHaveBeenCalledTimes(3);
  act(() => { pressable(view).props.onPressOut(); });
  expect(view.queryByTestId('companion-mark-purr')).toBeNull();
  act(() => { jest.advanceTimersByTime(500); });
  expect(haptics.triggerSelectionHaptic).toHaveBeenCalledTimes(3);
});

it('ignores taps during the success payoff', () => {
  const view = render(<CompanionScene scene="pounce" phase="ready" testID="scene" />);
  expect(pressable(view).props.disabled).toBe(true);
  act(() => { pressable(view).props.onPress(); });
  expect(view.queryByTestId('companion-mark-heart1')).toBeNull();
  expect(haptics.triggerLightImpact).not.toHaveBeenCalled();
});

it('shows a pinned scene inside the loading state and a still cat under reduced motion', () => {
  const view = render(<LoadingState testID="loading" scene="fetch" message="Connecting" />);
  expect(view.getByTestId('loading-scene').props.accessible).toBe(false);
  expect(view.getByTestId('loading').props.accessibilityLabel).toBe('Connecting');
  view.unmount();
  const reanimated = jest.requireMock('react-native-reanimated') as { useReducedMotion: () => boolean };
  const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
  const still = render(<LoadingState testID="loading" message="Connecting" />);
  expect(still.queryByTestId('loading-scene')).toBeNull();
  spy.mockRestore();
});

function Handoff({ loading, succeeded, onPhase }: Readonly<{ loading: boolean; succeeded: boolean; onPhase: (phase: string | null) => void }>) {
  onPhase(useLoadingHandoff(loading, succeeded));
  return null;
}

describe('useLoadingHandoff', () => {
  it('plays the payoff only after a visible wait that ended in success', () => {
    const phases: Array<string | null> = [];
    const view = render(<Handoff loading succeeded={false} onPhase={(phase) => phases.push(phase)} />);
    expect(phases.at(-1)).toBe('wait');
    act(() => { jest.advanceTimersByTime(1_000); });
    view.rerender(<Handoff loading={false} succeeded onPhase={(phase) => phases.push(phase)} />);
    expect(phases.at(-1)).toBe('ready');
    // No null render between wait and ready: that would unmount the scene and redraw it.
    expect(phases).not.toContain(null);
    act(() => { jest.advanceTimersByTime(700); });
    expect(phases.at(-1)).toBeNull();
  });

  it('hands over at once when the wait was too short to show the cat, or failed', () => {
    const quick: Array<string | null> = [];
    const view = render(<Handoff loading succeeded onPhase={(phase) => quick.push(phase)} />);
    act(() => { jest.advanceTimersByTime(100); });
    view.rerender(<Handoff loading={false} succeeded onPhase={(phase) => quick.push(phase)} />);
    expect(quick.at(-1)).toBeNull();

    const failed: Array<string | null> = [];
    const second = render(<Handoff loading succeeded={false} onPhase={(phase) => failed.push(phase)} />);
    act(() => { jest.advanceTimersByTime(2_000); });
    second.rerender(<Handoff loading={false} succeeded={false} onPhase={(phase) => failed.push(phase)} />);
    expect(failed.at(-1)).toBeNull();
  });
});
