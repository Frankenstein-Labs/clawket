import React, { useEffect, useState } from 'react';
import { Animated as NativeAnimated, AppState, Easing as NativeEasing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { withAlpha } from '../../theme/color';
import { Motion } from '../../theme/tokens';

export type PresenceRingTone = 'working' | 'attention';

/** Ring stroke and the air between it and the avatar, in points. */
export const PRESENCE_RING_STROKE = 2;
export const PRESENCE_RING_GAP = 2;
/** One turn of the working arc (A+ motion prototype). */
const SPIN_MS = 1_400;
const TRACK_ALPHA = 0.16;
const BREATH_LOW = 0.45;

export type PresenceRingProps = Readonly<{
  tone: PresenceRingTone;
  /** Diameter of the avatar the ring surrounds. */
  avatarSize: number;
  color: string;
  testID?: string;
}>;

/**
 * The Agent's presence around its header avatar (A+ chat design, owner
 * decision 2026-09-30): a quarter arc turning on a faint track while it
 * works, and a full ring breathing in the attention color while it waits for
 * you. Only the UI thread animates it; reduced motion holds it still.
 */
export function PresenceRing({ tone, avatarSize, color, testID }: PresenceRingProps): React.JSX.Element {
  const size = avatarSize + (PRESENCE_RING_GAP + PRESENCE_RING_STROKE) * 2;
  const center = size / 2;
  const radius = center - PRESENCE_RING_STROKE / 2;
  const RingMotion = Platform.OS === 'android' ? AndroidRingMotion : ReanimatedRingMotion;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[styles.ring, { width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }]}
    >
      <RingMotion tone={tone}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {tone === 'working' ? (
            <>
              <Circle cx={center} cy={center} r={radius} fill="none" stroke={withAlpha(color, TRACK_ALPHA)} strokeWidth={PRESENCE_RING_STROKE} />
              <Path
                d={`M${center} ${center - radius}A${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
                fill="none"
                stroke={color}
                strokeWidth={PRESENCE_RING_STROKE}
                strokeLinecap="round"
              />
            </>
          ) : (
            <Circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={PRESENCE_RING_STROKE} />
          )}
        </Svg>
      </RingMotion>
    </View>
  );
}

type RingMotionProps = Readonly<{ tone: PresenceRingTone; children: React.ReactNode }>;

function AndroidRingMotion({ tone, children }: RingMotionProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new NativeAnimated.Value(0));
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    setForeground(AppState.currentState === 'active');
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    progress.setValue(0);
    if (reduceMotion || !foreground) return;
    const ease = NativeEasing.inOut(NativeEasing.quad);
    // One precomputed native cycle includes both halves of the original breath.
    // Animated.sequence would restart each cycle through JavaScript.
    const loop = NativeAnimated.loop(NativeAnimated.timing(progress, {
      toValue: 1,
      duration: tone === 'working' ? SPIN_MS : Motion.avatarWorkingLoop * 2,
      easing: tone === 'working' ? NativeEasing.linear : value => ease(value <= 0.5 ? value * 2 : (1 - value) * 2),
      useNativeDriver: true,
      isInteraction: false,
    }), { iterations: -1 });
    loop.start();
    return () => loop.stop();
  }, [foreground, progress, reduceMotion, tone]);

  // Keep both native properties explicit when a mounted dock changes tone.
  const animatedStyle = {
    transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', tone === 'working' ? '360deg' : '0deg'] }) }],
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, tone === 'working' ? 1 : BREATH_LOW] }),
  };
  return <NativeAnimated.View style={[StyleSheet.absoluteFill, animatedStyle]}>{children}</NativeAnimated.View>;
}

function ReanimatedRingMotion({ tone, children }: RingMotionProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (!reduceMotion) {
      progress.value = tone === 'working'
        ? withRepeat(withTiming(1, { duration: SPIN_MS, easing: Easing.linear }), -1, false)
        : withRepeat(withTiming(1, { duration: Motion.avatarWorkingLoop, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, tone]);
  const animatedStyle = useAnimatedStyle(() => (tone === 'working'
    ? { transform: [{ rotate: `${progress.value * 360}deg` }] }
    : { opacity: 1 - (1 - BREATH_LOW) * progress.value }), [tone]);
  return <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // Centred on the avatar's centre, whatever the avatar box.
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
});
