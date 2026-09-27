import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cancelAnimation, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  calmTemper, CLAW_MS, forgiveTemper, MOOD_ORDER, MOOD_POSES, newTemper, petTemper, pokeTemper, REACTION_MS,
  REACTION_ORDER, sulkTemper, TEMPER_TIMING, type CompanionFlavour, type CompanionMood, type MoodPose, type Temper,
} from '../../../brand/companion-temper';
import { triggerHeavyImpact, triggerLightImpact, triggerMediumImpact, triggerSelectionHaptic } from '../../../services/haptics';
import { Motion } from '../../../theme/tokens';
import { startTimer, stopTimer, useAmbientClock, type PlayValues, type SceneClock } from './motion';

const POSE_KEYS = Object.keys(MOOD_POSES.calm) as Array<keyof MoodPose>;
/** A woken cat stays out this long after the last touch, then the scene starts over. */
const WAKE_HOLD = 1_600;
const WAKE_AFTER_PET = 900;
/** A soft haptic tick this often reads as a purr while petting. */
const PURR_TICK = 90;
const TIMER_LIMIT = 60_000;

export type CompanionPlay = Readonly<{
  values: PlayValues;
  reaction: CompanionFlavour | null;
  mood: CompanionMood;
  /** Changes on every claw swipe; 0 while none is showing. */
  swipe: number;
  poke: () => void;
  pet: () => void;
  release: () => void;
}>;

/**
 * The cat's temper: taps, rapid taps and petting (owner-approved prototype, 2026-09-27). Pure rules live
 * in `companion-temper`; this hook owns the timers, haptics and the shared values the layers read.
 */
export function useCompanionPlay({ enabled, running, canHide, clock, onWakeEnd }: Readonly<{
  /** Taps are accepted (waiting, not the success payoff). */
  enabled: boolean;
  /** Foregrounded with motion allowed. */
  running: boolean;
  /** The scene can hide the cat (behind the box or underground); a tap brings it out. */
  canHide: boolean;
  clock: SceneClock;
  /** A wake-up ended: the scene loop restarts from the top. */
  onWakeEnd: () => void;
}>): CompanionPlay {
  const [temper, setTemperState] = useState<Temper>(() => newTemper());
  const temperRef = useRef(temper);
  const [reaction, setReaction] = useState<CompanionFlavour | null>(null);
  const [swipe, setSwipe] = useState(0);
  const press = useSharedValue(-1);
  const reactionIndex = useSharedValue(0);
  const reactionAt = useSharedValue(-1);
  const moodIndex = useSharedValue(0);
  const moodAt = useSharedValue(-1);
  const claw = useSharedValue(-1);
  const earL = useSharedValue(0);
  const earR = useSharedValue(0);
  const blink = useSharedValue(1);
  const eyeL = useSharedValue(0);
  const eyeR = useSharedValue(0);
  const body = useSharedValue(0);
  const gazeX = useSharedValue(0);
  const gazeY = useSharedValue(0);
  const happy = useSharedValue(0);
  const ambient = useAmbientClock(running);
  const pose = useMemo(() => ({ earL, earR, blink, eyeL, eyeR, body, gazeX, gazeY, happy }), [earL, earR, blink, eyeL, eyeR, body, gazeX, gazeY, happy]);
  const values = useMemo<PlayValues>(() => ({ press, reaction: reactionIndex, reactionAt, moodIndex, moodAt, ambient, claw, pose }),
    [press, reactionIndex, reactionAt, moodIndex, moodAt, ambient, claw, pose]);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastPoke = useRef(0);
  const petting = useRef(false);
  const purr = useRef<ReturnType<typeof setInterval> | null>(null);
  const onWakeEndRef = useRef(onWakeEnd);
  onWakeEndRef.current = onWakeEnd;

  const later = useCallback((key: string, ms: number, action: () => void) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(() => { timers.current.delete(key); action(); }, ms));
  }, []);

  const setTemper = useCallback((next: Temper) => {
    const previous = temperRef.current;
    temperRef.current = next;
    setTemperState(next);
    if (previous.mood === next.mood) return;
    moodIndex.value = MOOD_ORDER.indexOf(next.mood);
    startTimer(moodAt, TIMER_LIMIT);
    const target = MOOD_POSES[next.mood];
    for (const key of POSE_KEYS) pose[key].value = withTiming(target[key], { duration: Motion.duration.fast + 40 });
  }, [moodAt, moodIndex, pose]);

  const react = useCallback((flavour: CompanionFlavour | null) => {
    if (!flavour) {
      reactionIndex.value = 0;
      setReaction(null);
      return;
    }
    reactionIndex.value = REACTION_ORDER.indexOf(flavour) + 1;
    startTimer(reactionAt, REACTION_MS);
    setReaction(flavour);
    later('reaction', REACTION_MS, () => { reactionIndex.value = 0; setReaction(null); });
  }, [later, reactionAt, reactionIndex]);

  const endWake = useCallback(() => {
    if (petting.current || clock.wake.value < 0) return;
    stopTimer(clock.wake);
    onWakeEndRef.current();
  }, [clock.wake]);

  /** Brings a hidden cat out; true when this touch is the one that found it. */
  const wakeUp = useCallback((hold: number) => {
    if (!canHide) return false;
    const found = clock.wake.value < 0;
    if (found) startTimer(clock.wake, TIMER_LIMIT);
    later('wake', hold, endWake);
    return found;
  }, [canHide, clock.wake, endWake, later]);

  const stopPurr = useCallback(() => {
    if (purr.current) clearInterval(purr.current);
    purr.current = null;
  }, []);

  const poke = useCallback(() => {
    if (!enabled) return;
    lastPoke.current = Date.now();
    const found = wakeUp(WAKE_HOLD);
    startTimer(press, TIMER_LIMIT);
    const outcome = pokeTemper(temperRef.current, { found });
    setTemper(outcome.temper);
    react(outcome.reaction);
    if (outcome.swipe) {
      triggerHeavyImpact();
      startTimer(claw, TIMER_LIMIT);
      setSwipe((count) => count + 1);
      later('claw', CLAW_MS, () => setSwipe(0));
      later('sulk', TEMPER_TIMING.angryFor, () => setTemper(sulkTemper(temperRef.current)));
      later('calm', TEMPER_TIMING.angryFor + TEMPER_TIMING.sulkFor, () => setTemper(calmTemper(temperRef.current)));
    } else if (outcome.reaction === 'hmph') {
      triggerMediumImpact();
    } else if (outcome.reaction === 'hop' || outcome.reaction === 'nuzzle' || found) {
      triggerLightImpact();
    } else {
      triggerSelectionHaptic();
    }
  }, [claw, enabled, later, press, react, setTemper, wakeUp]);

  const pet = useCallback(() => {
    if (!enabled) return;
    const next = petTemper(temperRef.current);
    if (next === temperRef.current) return;
    petting.current = true;
    wakeUp(TIMER_LIMIT);
    react(null);
    setTemper(next);
    stopPurr();
    purr.current = setInterval(triggerSelectionHaptic, PURR_TICK);
  }, [enabled, react, setTemper, stopPurr, wakeUp]);

  const release = useCallback(() => {
    if (!petting.current) return;
    petting.current = false;
    stopPurr();
    setTemper(calmTemper(temperRef.current));
    if (canHide) later('wake', WAKE_AFTER_PET, endWake);
  }, [canHide, endWake, later, setTemper, stopPurr]);

  // Each quiet step after the last rapid tap forgives one tap.
  useEffect(() => {
    if (!enabled) return undefined;
    const ticker = setInterval(() => {
      if (Date.now() - lastPoke.current < TEMPER_TIMING.forgiveAfter) return;
      const next = forgiveTemper(temperRef.current);
      if (next !== temperRef.current) setTemper(next);
    }, TEMPER_TIMING.forgiveEvery);
    return () => clearInterval(ticker);
  }, [enabled, setTemper]);

  // The payoff, the background and unmounting settle everything at once.
  useEffect(() => {
    if (enabled) return undefined;
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    petting.current = false;
    stopPurr();
    setTemper(calmTemper(temperRef.current));
    react(null);
    setSwipe(0);
    stopTimer(claw);
    return undefined;
  }, [claw, enabled, react, setTemper, stopPurr]);

  // Unmount only: timers, the purr and running clocks never outlive the scene.
  const clocks = useRef([press, reactionAt, moodAt, claw]);
  clocks.current = [press, reactionAt, moodAt, claw];
  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    if (purr.current) clearInterval(purr.current);
    purr.current = null;
    for (const value of clocks.current) cancelAnimation(value);
  }, []);

  return { values, reaction, mood: temper.mood, swipe, poke, pet, release };
}
