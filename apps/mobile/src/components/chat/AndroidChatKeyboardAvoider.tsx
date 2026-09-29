import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { useGenericKeyboardHandler, useKeyboardContext, useWindowDimensions } from 'react-native-keyboard-controller';
import Animated, { runOnJS, runOnUI, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

type Boundary = { revision: number; padding: number | null };
type BoundarySink = React.RefObject<((boundary: Boundary) => void) | null>;
type PaddingHostProps = ViewProps & { boundarySink: BoundarySink; isCurrent: (revision: number) => boolean; paddingBottom?: number };

/** React keeps the last settled baseline; UI-thread animation overlays it natively.
 * Filter incoming padding even during motion: Reanimated's settled-props cache
 * must not replace this baseline on a later React render. Other styles stay intact.
 * This isolates an observed commit mismatch; it does not prove its library cause.
 */
const PaddingHost = React.forwardRef<View, PaddingHostProps>(function PaddingHost({
  boundarySink, isCurrent, style, paddingBottom: _incomingTopLevelPadding, ...props
}, ref) {
  const [baseline, setBaseline] = useState(0);
  const revision = useRef(-1);
  useLayoutEffect(() => {
    const accept = (boundary: Boundary) => {
      if (!isCurrent(boundary.revision) || boundary.revision < revision.current) return;
      revision.current = boundary.revision;
      // Begin does not remove/reset the React padding property mid-animation.
      if (boundary.padding !== null) setBaseline(boundary.padding);
    };
    boundarySink.current = accept;
    return () => { if (boundarySink.current === accept) boundarySink.current = null; };
  }, [boundarySink, isCurrent]);
  const { paddingBottom: _incomingPadding, ...rest } = StyleSheet.flatten(style) ?? {};
  return <View {...props} ref={ref} style={[rest, { paddingBottom: baseline }]} />;
});

const AnimatedPaddingHost = Animated.createAnimatedComponent(PaddingHost);
type Frame = { y: number; height: number };
type Geometry = { frame: Frame | null; screenHeight: number; offset: number };

function keyboardPadding(geometry: Geometry, openedHeight: number, progress: number): number {
  'worklet';
  if (!geometry.frame) return 0;
  const keyboardY = geometry.screenHeight - openedHeight - geometry.offset;
  return Math.max(0, geometry.frame.y + geometry.frame.height - keyboardY) * Math.max(0, Math.min(1, progress));
}

/** Android chat only. Native keyboard frames animate padding without JS frame
 * updates; start/end and idle geometry changes publish generation-fenced baselines.
 * Public generic handlers preserve the application's existing input-mode policy.
 */
export function AndroidChatKeyboardAvoider({
  keyboardVerticalOffset = 0, behavior: _behavior, onLayout, style, ...props
}: ViewProps & { keyboardVerticalOffset?: number; behavior?: 'padding' }): React.JSX.Element {
  const { reanimated } = useKeyboardContext();
  const { height: screenHeight } = useWindowDimensions();
  const geometry = useSharedValue<Geometry>({ frame: null, screenHeight, offset: keyboardVerticalOffset });
  const openedHeight = useSharedValue(0);
  const progress = useSharedValue(0);
  const moving = useSharedValue(false);
  const destination = useSharedValue<number | null>(null);
  const revision = useSharedValue(0);
  const boundarySink = useRef<((boundary: Boundary) => void) | null>(null);
  const mounted = useRef(false);
  const isCurrent = useCallback((value: number) => mounted.current && revision.value === value, [revision]);
  const publish = useCallback((value: number, padding: number | null) => {
    if (isCurrent(value)) boundarySink.current?.({ revision: value, padding });
  }, [isCurrent]);

  useLayoutEffect(() => {
    mounted.current = true;
    runOnUI(() => {
      'worklet';
      const currentProgress = reanimated.progress.value;
      const currentHeight = Math.max(0, -reanimated.height.value);
      progress.value = currentProgress;
      openedHeight.value = currentProgress > 0 ? currentHeight / currentProgress : 0;
      revision.value += 1;
      runOnJS(publish)(revision.value, keyboardPadding(geometry.value, openedHeight.value, progress.value));
    })();
    return () => { mounted.current = false; };
  }, [geometry, openedHeight, progress, publish, reanimated, revision]);

  useLayoutEffect(() => {
    runOnUI((height: number, offset: number) => {
      'worklet';
      geometry.value = { ...geometry.value, screenHeight: height, offset };
      if (!moving.value) {
        revision.value += 1;
        runOnJS(publish)(revision.value, keyboardPadding(geometry.value, openedHeight.value, progress.value));
      }
    })(screenHeight, keyboardVerticalOffset);
  }, [screenHeight, keyboardVerticalOffset, geometry, moving, openedHeight, progress, publish, revision]);

  useGenericKeyboardHandler({
    onStart: event => {
      'worklet';
      if (!Number.isFinite(event.height) || event.height < 0) return;
      // onStart reports the destination, not the current frame's height.
      destination.value = event.height;
      if (event.height > 0) openedHeight.value = event.height;
      moving.value = true;
      revision.value += 1;
      runOnJS(publish)(revision.value, null);
    },
    onMove: event => {
      'worklet';
      if (!Number.isFinite(event.height) || event.height < 0 || !Number.isFinite(event.progress)
        || event.progress < 0 || event.progress > 1) return;
      // Recover if mounting missed the start event. A frame is self-contained;
      // do not let an older seed/idle-layout callback settle this new motion.
      if (!moving.value) {
        moving.value = true;
        destination.value = null;
        revision.value += 1;
        runOnJS(publish)(revision.value, null);
      }
      if (event.height > 0 && event.progress > 0) openedHeight.value = event.height / event.progress;
      progress.value = event.progress;
    },
    onInteractive: event => {
      'worklet';
      if (!Number.isFinite(event.height) || event.height < 0 || !Number.isFinite(event.progress)
        || event.progress < 0 || event.progress > 1) return;
      if (!moving.value) {
        moving.value = true;
        revision.value += 1;
        runOnJS(publish)(revision.value, null);
      }
      destination.value = null;
      progress.value = event.progress;
      if (event.height > 0 && event.progress > 0) openedHeight.value = event.height / event.progress;
    },
    onEnd: event => {
      'worklet';
      if (!Number.isFinite(event.height) || event.height < 0 || !Number.isFinite(event.progress)
        || event.progress < 0 || event.progress > 1) return;
      // A reversed transition can leave an older terminal event queued.
      if (moving.value && destination.value !== null && Math.abs(destination.value - event.height) > 1) return;
      if (event.height > 0) openedHeight.value = event.height;
      progress.value = event.progress;
      moving.value = false;
      destination.value = null;
      revision.value += 1;
      runOnJS(publish)(revision.value, keyboardPadding(geometry.value, openedHeight.value, progress.value));
    },
  }, [geometry, openedHeight, progress, moving, destination, revision, publish]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    onLayout?.(event);
    const { y, height } = event.nativeEvent.layout;
    runOnUI((frame: Frame) => {
      'worklet';
      const previous = geometry.value.frame;
      if (previous?.y === frame.y && previous.height === frame.height) return;
      geometry.value = { ...geometry.value, frame };
      if (!moving.value) {
        revision.value += 1;
        runOnJS(publish)(revision.value, keyboardPadding(geometry.value, openedHeight.value, progress.value));
      }
    })({ y, height });
  }, [onLayout, geometry, moving, openedHeight, progress, publish, revision]);
  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardPadding(geometry.value, openedHeight.value, progress.value),
  }));
  return <AnimatedPaddingHost {...props} boundarySink={boundarySink} isCurrent={isCurrent}
    onLayout={handleLayout} style={[style, animatedStyle]} />;
}
