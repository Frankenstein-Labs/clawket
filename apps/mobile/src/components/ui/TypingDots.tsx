import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '../../theme';
import { LineHeight, Motion, Radius, Space } from '../../theme/tokens';

/**
 * Three dots that lift one after another while the Agent is working — the
 * messaging convention for "the other side is composing". One shared progress
 * value drives every dot, so the row costs one animation and stays in phase.
 * Native opacity/transform updates do not repeatedly commit the Fabric tree
 * while a long streaming Markdown message is being measured.
 * Reduced motion keeps the three dots at their resting opacities.
 */
const DOT_COUNT = 3;
const DOT_SIZE = Space.xs;
const DOT_GAP = Space.xs;
const DOT_LIFT = -2;
const REST_OPACITY = 0.32;
/** One full cycle shares the avatar working cadence; each dot bounces for `slow`. */
const CYCLE_MS = Motion.avatarWorkingLoop;
const STEP_MS = CYCLE_MS / DOT_COUNT;
const BOUNCE_MS = Motion.duration.slow;

export type TypingDotsProps = Readonly<{
  /** Defaults to the secondary ink so the dots read as a caption, not a badge. */
  color?: string;
  /** Row height; defaults to the caption line so it can replace a subtitle. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

function Dot({ index, progress, color, animate }: {
  index: number; progress: Animated.Value; color: string; animate: boolean;
}): React.JSX.Element {
  const start = (index * STEP_MS) / CYCLE_MS;
  const peak = (index * STEP_MS + BOUNCE_MS / 2) / CYCLE_MS;
  const end = (index * STEP_MS + BOUNCE_MS) / CYCLE_MS;
  const animatedStyle = useMemo(() => {
    const inputRange = [start, peak, end];
    return {
      opacity: animate ? progress.interpolate({
        inputRange, outputRange: [REST_OPACITY, 1, REST_OPACITY], extrapolate: 'clamp',
      }) : REST_OPACITY,
      transform: [{ translateY: animate ? progress.interpolate({
        inputRange, outputRange: [0, DOT_LIFT, 0], extrapolate: 'clamp',
      }) : 0 }],
    };
  }, [animate, progress, start, peak, end]);
  return (
    <Animated.View
      testID={`typing-dot-${index}`}
      style={[styles.dot, { backgroundColor: color }, animatedStyle]}
    />
  );
}

export function TypingDots({ color, height = LineHeight.caption, style, testID }: TypingDotsProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const animate = !reduceMotion;

  useEffect(() => {
    progress.setValue(0);
    if (!animate) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: CYCLE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
      // A persistent working indicator must not hold list rendering jobs.
      isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [animate, progress]);

  const dotColor = color ?? theme.colors.inkSecondary;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={[styles.row, { height }, style]}
    >
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <Dot key={index} index={index} progress={progress} color={dotColor} animate={animate} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radius.full,
  },
});
