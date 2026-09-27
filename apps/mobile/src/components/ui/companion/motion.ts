import { useEffect } from 'react';
import { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { sampleTimed, sampleTrack, type Keyframes, type TimedFrames } from '../../../brand/companion-keyframes';
import type { MoodPose } from '../../../brand/companion-temper';

/** Scene clocks: loop progress (0–1), and milliseconds since the payoff / a wake-up began (−1 when not). */
export type SceneClock = Readonly<{
  loop: SharedValue<number>;
  payoff: SharedValue<number>;
  wake: SharedValue<number>;
}>;

/** Tap state the Companion layers read; milliseconds count up from each event (−1 = never). */
export type PlayValues = Readonly<{
  press: SharedValue<number>;
  reaction: SharedValue<number>;
  reactionAt: SharedValue<number>;
  moodIndex: SharedValue<number>;
  moodAt: SharedValue<number>;
  ambient: SharedValue<number>;
  claw: SharedValue<number>;
  pose: Readonly<Record<keyof MoodPose, SharedValue<number>>>;
}>;

export type Layer = { x: number; y: number; sx: number; sy: number; r: number; o: number };
export const REST: Readonly<Layer> = { x: 0, y: 0, sx: 1, sy: 1, r: 0, o: 1 };

/** SVG matrix of `translate(x, y) scale(sx, sy) rotate(r)` about a pivot, in CSS order. */
export function affine(x: number, y: number, sx: number, sy: number, degrees: number, px: number, py: number): number[] {
  'worklet';
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = sx * cos;
  const b = sy * sin;
  const c = -sx * sin;
  const d = sy * cos;
  return [a, b, c, d, px + x - (a * px + c * py), py + y - (b * px + d * py)];
}

export function loopLayer(frames: Keyframes | undefined, t: number, base: Readonly<Layer>): Layer {
  'worklet';
  return {
    x: sampleTrack(frames?.x, t, base.x),
    y: sampleTrack(frames?.y, t, base.y),
    sx: sampleTrack(frames?.sx, t, base.sx),
    sy: sampleTrack(frames?.sy, t, base.sy),
    r: sampleTrack(frames?.r, t, base.r),
    o: sampleTrack(frames?.o, t, base.o),
  };
}

export function timedLayer(part: TimedFrames | undefined, elapsed: number, base: Readonly<Layer>): Layer {
  'worklet';
  return {
    x: sampleTimed(part, 'x', elapsed, base.x),
    y: sampleTimed(part, 'y', elapsed, base.y),
    sx: sampleTimed(part, 'sx', elapsed, base.sx),
    sy: sampleTimed(part, 'sy', elapsed, base.sy),
    r: sampleTimed(part, 'r', elapsed, base.r),
    o: sampleTimed(part, 'o', elapsed, base.o),
  };
}

/**
 * One stage layer. As in the prototype's CSS, the payoff replaces the loop (layers without a payoff
 * part fall back to their static base), and a wake-up replaces the loop until it ends.
 */
export type StageLayer = Readonly<{
  loop?: Keyframes;
  payoff?: TimedFrames;
  /** `hide` rests at `base` while a tapped cat is out; a part plays the wake-up instead. */
  wake?: TimedFrames | 'hide';
  base?: Readonly<Partial<Layer>>;
  pivot?: readonly [number, number];
}>;

export function stageLayer(clock: SceneClock, spec: StageLayer): Layer {
  'worklet';
  const base = { ...REST, ...spec.base };
  if (clock.payoff.value >= 0) return spec.payoff ? timedLayer(spec.payoff, clock.payoff.value, base) : base;
  if (clock.wake.value >= 0 && spec.wake) return spec.wake === 'hide' ? base : timedLayer(spec.wake, clock.wake.value, base);
  return loopLayer(spec.loop, clock.loop.value, base);
}

/** Animated props (matrix + opacity) for an `AnimatedG` stage layer. */
export function useStageLayer(clock: SceneClock, spec: StageLayer) {
  return useAnimatedProps(() => {
    const layer = stageLayer(clock, spec);
    const [px, py] = spec.pivot ?? [0, 0];
    return { matrix: affine(layer.x, layer.y, layer.sx, layer.sy, layer.r, px, py), opacity: layer.o };
  });
}

/** Counts milliseconds up from zero on demand; the value rests at `limit` afterwards. */
export function startTimer(value: SharedValue<number>, limit: number): void {
  cancelAnimation(value);
  value.value = 0;
  value.value = withTiming(limit, { duration: limit, easing: Easing.linear });
}

export function stopTimer(value: SharedValue<number>): void {
  cancelAnimation(value);
  value.value = -1;
}

/** A 0–1 loop that runs while `running`; `restart` changes rewind it to the start. */
export function useLoopClock(period: number, running: boolean, restart = 0): SharedValue<number> {
  const loop = useSharedValue(0);
  useEffect(() => {
    if (!running) {
      cancelAnimation(loop);
      return undefined;
    }
    loop.value = 0;
    loop.value = withRepeat(withTiming(1, { duration: period, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(loop);
  }, [loop, period, running, restart]);
  return loop;
}

/** Free-running milliseconds for mood loops; the period is a common multiple of every mood loop. */
export const AMBIENT_PERIOD = 25_200;

export function useAmbientClock(running: boolean): SharedValue<number> {
  const ambient = useSharedValue(0);
  useEffect(() => {
    if (!running) {
      cancelAnimation(ambient);
      return undefined;
    }
    ambient.value = 0;
    ambient.value = withRepeat(withTiming(AMBIENT_PERIOD, { duration: AMBIENT_PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(ambient);
  }, [ambient, running]);
  return ambient;
}
