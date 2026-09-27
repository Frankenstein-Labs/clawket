import React from 'react';
import { Platform, Switch, type SwitchProps } from 'react-native';
import { useAppTheme } from '../../theme';

type ThemedSwitchProps = SwitchProps & { tone?: 'accent' | 'neutral' };

/** Keep the native control mounted and its value truthful through theme changes. */
export function ThemedSwitch({ tone = 'neutral', ...props }: ThemedSwitchProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const { value, thumbColor, trackColor, ...rest } = props;
  const neutral = tone === 'neutral';
  const resolvedTrackColor = trackColor ?? {
    // Android draws a white thumb beside (not inside) the track, so the hairline
    // track left the off state almost invisible on light cards (device review 2026-09-27).
    false: Platform.OS === 'android' && theme.scheme === 'light' ? theme.colors.inkTertiary : theme.colors.line,
    true: neutral
      ? (theme.scheme === 'dark' ? theme.colors.inkSecondary : theme.colors.ink)
      : theme.colors.accentSoft,
  };
  return (
    <Switch
      {...rest}
      value={value}
      ios_backgroundColor={props.ios_backgroundColor ?? resolvedTrackColor.false ?? undefined}
      thumbColor={thumbColor ?? (neutral ? (theme.scheme === 'dark' ? theme.colors.ink : theme.colors.canvas) : value ? theme.colors.accent : theme.colors.surface)}
      trackColor={resolvedTrackColor}
    />
  );
}
