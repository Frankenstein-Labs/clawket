import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme';
import { ControlSize, Motion } from '../../theme/tokens';

export type SheetHeaderSpinnerProps = Readonly<{
  accessibilityLabel: string;
  /** A wait the person just started shows at once; a background refresh waits out `Motion.loadingGrace`. */
  immediate?: boolean;
  testID?: string;
}>;

/**
 * Work in progress for an open sheet, drawn in the header's trailing slot (the
 * 44-point corner `SheetHeaderButton` uses) instead of a "Loading…" line in the
 * body, so the sheet never changes height when the wait ends (owner report
 * 2026-09-29: the Codex model and permission sheets jumped). A background
 * refresh stays invisible for `Motion.loadingGrace` so quick reads never flash;
 * assistive technology hears the busy state at once.
 */
export function SheetHeaderSpinner({
  accessibilityLabel,
  immediate = false,
  testID,
}: SheetHeaderSpinnerProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const opacity = useSharedValue(immediate ? 1 : 0);

  useEffect(() => {
    if (immediate) {
      opacity.value = 1;
      return;
    }
    opacity.value = withDelay(
      Motion.loadingGrace,
      withTiming(1, { duration: Motion.duration.normal }),
    );
  }, [immediate, opacity]);

  const appear = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      style={[styles.slot, appear]}
    >
      <ActivityIndicator size="small" color={theme.colors.inkSecondary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: ControlSize.floatingButton,
    height: ControlSize.floatingButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
