import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BorderWidth, Radius, StatusSize } from '../../theme/tokens';

export type StatusDotProps = Readonly<{
  color: string;
  /** The surface the dot sits on; the ring cuts the dot out of the mark beneath it. */
  ringColor: string;
  /**
   * Diameter of the circular mark the dot belongs to. The dot then sits on the
   * circle at 45° instead of on the square corner of its box.
   */
  circle?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Right/bottom inset that centres a badge on a circle's edge at 45°. On a
 * round avatar the box corner lies well outside the circle, so a badge placed
 * there only grazes the edge and its ring nicks a sliver off the avatar (owner
 * feedback 2026-09-27); centred on the edge, the ring cuts a deliberate notch.
 * Small circles yield a negative inset, placing the badge partly outside.
 */
export function circleBadgeInset(circle: number, badge: number): number {
  return (circle / 2) * (1 - Math.SQRT1_2) - badge / 2;
}

/**
 * The one corner status dot: 12 points including a 2-point ring. Avatar states
 * and connection marks share it so a green dot means the live connection
 * everywhere. Without `circle` it sits 2 points outside the bottom-right corner
 * of its box, for square and irregular marks.
 */
export function StatusDot({ color, ringColor, circle, style, testID }: StatusDotProps): React.JSX.Element {
  const position = useMemo(() => {
    if (circle === undefined) return null;
    const inset = circleBadgeInset(circle, StatusSize.attention);
    return { right: inset, bottom: inset };
  }, [circle]);
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[styles.dot, position, { backgroundColor: color, borderColor: ringColor }, style]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    right: -BorderWidth.strong,
    bottom: -BorderWidth.strong,
    width: StatusSize.attention,
    height: StatusSize.attention,
    borderRadius: Radius.full,
    borderWidth: BorderWidth.strong,
  },
});
