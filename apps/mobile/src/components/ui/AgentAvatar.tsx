import React, { useEffect, useMemo } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
} from 'react-native';
import { Lock, type LucideIcon } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme';
import { agentPalette } from '../../theme/theme';
import {
  BorderWidth,
  ControlSize,
  FontSize,
  FontWeight,
  IconSize,
  LineHeight,
  Motion,
  Radius,
  Space,
} from '../../theme/tokens';
import { resolveAgentAvatarImageSource } from '../../utils/agent-avatar-uri';
import { isProductFacePlatform, PlatformDisc, type PlatformKind } from './PlatformMark';
import { circleBadgeInset, StatusDot } from './StatusDot';

export type AgentAvatarVariant = 'roster' | 'header' | 'settings' | 'sheet' | 'panel';
/** `live` marks an Agent on the connection the phone is live on (owner decision 2026-09-26). */
export type AgentAvatarStatus = 'idle' | 'working' | 'attention' | 'done' | 'live' | 'offline' | 'locked';
export type AgentAttentionTone = 'warn' | 'bad';

type AvatarMetrics = Readonly<{
  size: number;
  radius: number;
  fontSize: number;
  lineHeight: number;
}>;

export const AGENT_AVATAR_METRICS: Readonly<Record<AgentAvatarVariant, AvatarMetrics>> = {
  roster: {
    size: ControlSize.settingsRow + Space.xs,
    radius: Radius.full,
    fontSize: FontSize.title,
    lineHeight: LineHeight.title,
  },
  header: {
    size: ControlSize.pill - Space.md,
    radius: Radius.full,
    fontSize: FontSize.caption,
    lineHeight: LineHeight.caption,
  },
  settings: {
    size: ControlSize.floatingButton,
    radius: Radius.full,
    fontSize: FontSize.body,
    lineHeight: LineHeight.body,
  },
  sheet: {
    size: Space.xxl,
    radius: Radius.full,
    fontSize: FontSize.secondary,
    lineHeight: LineHeight.secondary,
  },
  panel: {
    size: ControlSize.pill,
    radius: Radius.full,
    fontSize: FontSize.body,
    lineHeight: LineHeight.body,
  },
};

const AVATAR_MUTED_SATURATION = 0.4;
/** Share of the circle a bare official mark spans: on a face, and inside the smaller corner badge. */
const FACE_GLYPH = 0.54;
const BADGE_GLYPH = 0.72;

export type AgentAvatarProps = Readonly<{
  agentId: string;
  name: string;
  emoji?: string | null;
  avatarUrl?: string | null;
  variant?: AgentAvatarVariant;
  status?: AgentAvatarStatus;
  attentionTone?: AgentAttentionTone;
  /**
   * Glyph of a conversation badge on the top-right of the circle, for a
   * conversation that stands in for its Agent (a roster conversation row).
   */
  badgeIcon?: LucideIcon;
  /**
   * The Agent's backend. On a product backend (`isProductFacePlatform`) the
   * official mark is the face in place of emoji, image and initials (owner
   * decision 2026-09-27); other backends keep the Agent's own avatar.
   */
  platform?: PlatformKind | null;
  /**
   * Carry the backend's official mark on the bottom-right of an Agent's own
   * avatar; the roster asks for it when its rows mix two or more backends.
   * Lock and attention take that corner first, and a live Agent's badge rings
   * in `good` instead of adding the separate live dot.
   */
  platformBadge?: boolean;
  /**
   * A `locked` avatar is muted and badged with a lock. A row that already ends
   * in its own lock marker turns the badge off, so the corner can carry the
   * backend mark instead (roster, owner decision 2026-09-27).
   */
  lockBadge?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function getAgentPaletteIndex(agentId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < agentId.length; index += 1) {
    hash ^= agentId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % agentPalette.length;
}

/** Full-width scripts: one glyph already fills a small avatar, two crowd its edges. */
const WIDE_SCRIPT_PATTERN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function getAgentInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length > 1) {
    return `${Array.from(words[0] ?? '')[0] ?? ''}${Array.from(words.at(-1) ?? '')[0] ?? ''}`.toLocaleUpperCase();
  }
  const word = words[0] ?? '';
  const length = WIDE_SCRIPT_PATTERN.test(word) ? 1 : 2;
  return Array.from(word).slice(0, length).join('').toLocaleUpperCase();
}

export function AgentAvatar({
  agentId,
  name,
  emoji,
  avatarUrl,
  variant = 'roster',
  status = 'idle',
  attentionTone = 'warn',
  badgeIcon: BadgeIcon,
  platform,
  platformBadge = false,
  lockBadge = true,
  style,
  testID,
}: AgentAvatarProps): React.JSX.Element {
  const { theme } = useAppTheme();
  const doneOpacity = useSharedValue(status === 'done' ? 1 : 0);
  const metrics = AGENT_AVATAR_METRICS[variant];
  const paletteColor = agentPalette[getAgentPaletteIndex(agentId)] ?? agentPalette[0];
  const content = emoji || getAgentInitials(name);
  const labelColor = theme.scheme === 'light' ? theme.colors.surfaceFloating : theme.colors.ink;
  const textStyle = useMemo(
    () => ({
      color: labelColor,
      fontSize: metrics.fontSize,
      lineHeight: metrics.lineHeight,
      fontWeight: FontWeight.semibold,
    }),
    [labelColor, metrics.fontSize, metrics.lineHeight],
  );

  useEffect(() => {
    cancelAnimation(doneOpacity);
    if (status !== 'done') {
      doneOpacity.value = 0;
      return () => cancelAnimation(doneOpacity);
    }
    doneOpacity.value = 1;
    doneOpacity.value = withDelay(
      Motion.avatarDoneFade,
      withTiming(0, { duration: Motion.duration.fast }),
    );
    return () => cancelAnimation(doneOpacity);
  }, [doneOpacity, status]);

  // A row that mounts live shows its dot at once; one that becomes live (its
  // connection finished connecting) fades the dot in. Opacity only, so the
  // fade also suits reduced motion.
  const liveOpacity = useSharedValue(status === 'live' ? 1 : 0);
  useEffect(() => {
    cancelAnimation(liveOpacity);
    if (status !== 'live') {
      liveOpacity.value = 0;
      return () => cancelAnimation(liveOpacity);
    }
    liveOpacity.value = withTiming(1, { duration: Motion.duration.normal });
    return () => cancelAnimation(liveOpacity);
  }, [liveOpacity, status]);

  const doneDotStyle = useAnimatedStyle(() => ({ opacity: doneOpacity.value }));
  const liveDotStyle = useAnimatedStyle(() => ({ opacity: liveOpacity.value }));
  const isMuted = status === 'offline' || status === 'locked';
  const mutedFilter = isMuted ? [{ saturate: AVATAR_MUTED_SATURATION }] : undefined;
  const productFace = isProductFacePlatform(platform);
  // One corner, one marker: lock and attention outrank the backend badge, which in turn carries the live state.
  const showLock = status === 'locked' && lockBadge;
  const badgePlatform = platformBadge && !productFace && !showLock && status !== 'attention'
    ? platform ?? null
    : null;
  const statusDotColor = attentionTone === 'bad' ? theme.colors.bad : theme.colors.warn;
  // The lock badge shares the dots' corner: centred on the circle at 45°.
  const lockPosition = useMemo(() => {
    const inset = circleBadgeInset(metrics.size, Space.lg);
    return { right: inset, bottom: inset };
  }, [metrics.size]);
  // The conversation badge mirrors them on the top-right of the circle.
  const badgePosition = useMemo(() => {
    const inset = circleBadgeInset(metrics.size, IconSize.md);
    return { top: inset, right: inset };
  }, [metrics.size]);
  // The backend badge shares the status corner and its geometry.
  const platformBadgePosition = useMemo(() => {
    const inset = circleBadgeInset(metrics.size, Space.xl);
    return { right: inset, bottom: inset };
  }, [metrics.size]);
  const resolvedAvatarSource = !emoji && !productFace ? resolveAgentAvatarImageSource(avatarUrl) : null;

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[
        styles.container,
        { width: metrics.size, height: metrics.size },
        style,
      ]}
    >
      <View
        testID={testID ? `${testID}-fill` : undefined}
        style={[
          styles.fill,
          {
            borderRadius: metrics.radius,
            backgroundColor: productFace ? theme.colors.surfaceFloating : paletteColor,
            filter: mutedFilter,
          },
        ]}
      >
        {productFace ? (
          <>
            <PlatformDisc
              testID={testID ? `${testID}-face` : undefined}
              platform={platform}
              size={metrics.size}
              glyph={FACE_GLYPH}
            />
            {/* The white face would dissolve into the canvas without its hairline edge. */}
            <View pointerEvents="none" style={[styles.faceEdge, { borderRadius: metrics.radius, borderColor: theme.colors.line }]} />
          </>
        ) : (
          <>
            {content ? (
              <Text numberOfLines={1} allowFontScaling={false} style={textStyle}>
                {content}
              </Text>
            ) : null}
            {resolvedAvatarSource ? (
              <Image
                testID={testID ? `${testID}-image` : undefined}
                source={resolvedAvatarSource}
                resizeMode="cover"
                style={styles.image}
              />
            ) : null}
          </>
        )}
      </View>
      {/* A grey disc cut out by a canvas ring: a white disc vanished on the
          canvas and floated off the box corner (owner feedback 2026-09-27). */}
      {BadgeIcon ? (
        <View
          testID={testID ? `${testID}-overlay` : undefined}
          pointerEvents="none"
          style={[
            styles.badge,
            badgePosition,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.canvas },
          ]}
        >
          <BadgeIcon
            testID={testID ? `${testID}-overlay-icon` : undefined}
            size={Space.md}
            color={theme.colors.inkSecondary}
            strokeWidth={BorderWidth.strong}
          />
        </View>
      ) : null}
      {status === 'attention' ? (
        <StatusDot
          testID={testID ? `${testID}-attention` : undefined}
          color={statusDotColor}
          ringColor={theme.colors.canvas}
          circle={metrics.size}
        />
      ) : null}
      {badgePlatform ? (
        // A canvas disc behind the mark cuts it out of the avatar; the live connection's badge fades
        // that ring to `good`, the same green the live dot and "My connections" use.
        <View
          testID={testID ? `${testID}-platform` : undefined}
          pointerEvents="none"
          style={[
            styles.platformBadge,
            platformBadgePosition,
            { backgroundColor: theme.colors.canvas, filter: mutedFilter },
          ]}
        >
          {status === 'live' ? (
            <Animated.View
              testID={testID ? `${testID}-platform-live` : undefined}
              style={[styles.platformLiveRing, { backgroundColor: theme.colors.good }, liveDotStyle]}
            />
          ) : null}
          <PlatformDisc
            testID={testID ? `${testID}-platform-mark` : undefined}
            platform={badgePlatform}
            size={IconSize.md}
            glyph={BADGE_GLYPH}
            ground="surface"
          />
        </View>
      ) : null}
      {status === 'done' && !badgePlatform ? (
        <Animated.View pointerEvents="none" style={[styles.statusLayer, doneDotStyle]}>
          <StatusDot
            testID={testID ? `${testID}-done` : undefined}
            color={theme.colors.good}
            ringColor={theme.colors.canvas}
            circle={metrics.size}
          />
        </Animated.View>
      ) : null}
      {status === 'live' && !badgePlatform ? (
        <Animated.View pointerEvents="none" style={[styles.statusLayer, liveDotStyle]}>
          <StatusDot
            testID={testID ? `${testID}-live` : undefined}
            color={theme.colors.good}
            ringColor={theme.colors.canvas}
            circle={metrics.size}
          />
        </Animated.View>
      ) : null}
      {showLock ? (
        <View
          testID={testID ? `${testID}-locked` : undefined}
          pointerEvents="none"
          style={[
            styles.lockBadge,
            lockPosition,
            {
              backgroundColor: theme.colors.surfaceFloating,
              borderColor: theme.colors.canvas,
            },
          ]}
        >
          <Lock size={Space.md} color={theme.colors.inkSecondary} strokeWidth={BorderWidth.strong} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  fill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  faceEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  platformBadge: {
    position: 'absolute',
    width: Space.xl,
    height: Space.xl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformLiveRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.full,
  },
  // Carries a dot's fade; the dot itself sits on the avatar's corner.
  statusLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'visible',
  },
  badge: {
    position: 'absolute',
    width: IconSize.md,
    height: IconSize.md,
    borderRadius: Radius.full,
    borderWidth: BorderWidth.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.full,
    borderWidth: BorderWidth.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
