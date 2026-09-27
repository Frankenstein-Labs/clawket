import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { COMPACT_SCENE_POOL, rollScene, SCENE_POOL, type CompanionSceneKey } from '../../brand/companion-scenes';
import { useAppTheme } from '../../theme';
import { FontSize, LineHeight, Motion, Space } from '../../theme/tokens';
import { Button } from './Button';
import { Companion, type CompanionPose } from './Companion';
import { CompanionScene, type CompanionScenePhase } from './companion/CompanionScene';

/** `page` fills a screen that has nothing else to show; `compact` sits inside a sheet or card. */
export type LoadingStateSize = 'page' | 'compact';

const COMPACT_COMPANION = 48;
/** The success payoff fades out from here, so the loader is gone before `Motion.loadingPayoff` ends. */
const PAYOFF_FADE_AT = 460;

// Across mounts too, the next wait never replays the scene the previous one showed.
const lastScene: Record<LoadingStateSize, CompanionSceneKey | null> = { page: null, compact: null };

/** Draws the next scene for a wait of this size, never the one the previous wait showed. */
export function drawLoadingScene(size: LoadingStateSize): CompanionSceneKey {
  const scene = rollScene(size === 'compact' ? COMPACT_SCENE_POOL : SCENE_POOL, lastScene[size]);
  lastScene[size] = scene;
  return scene;
}

type Props = {
  message?: string;
  /** Pose of the still Companion shown when the system asks for reduced motion. */
  pose?: CompanionPose;
  size?: LoadingStateSize;
  /** `ready` plays the scene's success payoff; see `useLoadingHandoff`. */
  phase?: CompanionScenePhase;
  /** Pins one scene (design gallery); otherwise each wait draws from the weighted pool. */
  scene?: CompanionSceneKey;
  /** After `Motion.loadingSlowHint` the wait explains itself and offers this one action. */
  slowAction?: Readonly<{ label: string; onPress: () => void }>;
  testID?: string;
};

/**
 * The one waiting surface for content without a known layout (lists use `ListSkeleton`).
 * Owner decision 2026-09-27: every wait draws one of five Companion scenes (Pounce is the rare one),
 * the cat reacts to taps, and a success payoff plays only when the wait really ends in success.
 * It stays invisible for `Motion.loadingGrace` so fast loads never flash the Companion, while the
 * busy state and its label are exposed to assistive technology immediately.
 */
export function LoadingState({ message, pose = 'loading', size = 'page', phase = 'wait', scene: pinned, slowAction, testID }: Props): React.JSX.Element {
  const { theme } = useAppTheme();
  const { t } = useTranslation('common');
  const reducedMotion = useReducedMotion();
  const compact = size === 'compact';
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(Motion.loadingGrace, withTiming(1, { duration: Motion.duration.normal }));
  }, [opacity]);
  useEffect(() => {
    if (phase === 'ready') opacity.value = withDelay(PAYOFF_FADE_AT, withTiming(0, { duration: Motion.duration.normal }));
  }, [opacity, phase]);
  const appear = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const [drawn, setDrawn] = useState<CompanionSceneKey>(() => pinned ?? drawLoadingScene(size));
  const scene = pinned ?? drawn;
  // A long wait gets bored of its scene and plays another one.
  const sceneOpacity = useSharedValue(1);
  const rotateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pinned || reducedMotion || phase !== 'wait') return undefined;
    const interval = setInterval(() => {
      sceneOpacity.value = withTiming(0, { duration: Motion.duration.fast });
      rotateTimer.current = setTimeout(() => {
        setDrawn(drawLoadingScene(size));
        sceneOpacity.value = withTiming(1, { duration: Motion.duration.normal });
      }, Motion.duration.fast);
    }, Motion.loadingSceneRotate);
    return () => {
      clearInterval(interval);
      if (rotateTimer.current) clearTimeout(rotateTimer.current);
    };
  }, [phase, pinned, reducedMotion, sceneOpacity, size]);
  const sceneStyle = useAnimatedStyle(() => ({ opacity: sceneOpacity.value }));

  const [slow, setSlow] = useState(false);
  const hasSlowAction = Boolean(slowAction);
  useEffect(() => {
    if (!hasSlowAction) return undefined;
    const timer = setTimeout(() => setSlow(true), Motion.loadingSlowHint);
    return () => clearTimeout(timer);
  }, [hasSlowAction]);

  return (
    <View style={compact ? styles.compactRoot : styles.root}>
      <Animated.View style={[styles.content, appear]}>
        {/* The progress group is one accessible element; the slow-wait action stays outside it so it can be reached. */}
        <View
          testID={testID}
          style={styles.content}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={message ?? t('Loading...')}
          accessibilityState={{ busy: true }}
        >
          {reducedMotion ? (
            <Companion pose={pose} size={compact ? COMPACT_COMPANION : undefined} />
          ) : (
            <Animated.View style={sceneStyle}>
              <CompanionScene key={scene} scene={scene} phase={phase} compact={compact} testID={testID ? `${testID}-scene` : undefined} />
            </Animated.View>
          )}
          {message ? (
            <Text style={[compact ? styles.compactText : styles.text, { color: compact ? theme.colors.inkSecondary : theme.colors.ink }]}>
              {message}
            </Text>
          ) : null}
        </View>
        {slow && slowAction && phase === 'wait' ? (
          <View style={styles.slow}>
            <Text testID={testID ? `${testID}-slow` : undefined} style={[styles.slowText, { color: theme.colors.inkSecondary }]}>
              {t('Taking longer than usual')}
            </Text>
            <Button testID={testID ? `${testID}-slow-action` : undefined} label={slowAction.label} variant="text" size="sm" onPress={slowAction.onPress} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * Keeps a page loader on screen for its success payoff once a wait ends in success. Returns `wait` while
 * loading, `ready` for `Motion.loadingPayoff` afterwards, then null. Waits that ended before the loader
 * appeared (`Motion.loadingGrace`) or ended in failure hand over immediately: never fake a success.
 * Render the loader in the same place for both phases (an overlay above the content), so the scene
 * that played the wait also plays its payoff while the content fades in underneath.
 */
export function useLoadingHandoff(loading: boolean, succeeded: boolean): CompanionScenePhase | null {
  const [payoff, setPayoff] = useState(false);
  const startedAt = useRef<number | null>(loading ? Date.now() : null);
  const succeededRef = useRef(succeeded);
  succeededRef.current = succeeded;
  useEffect(() => {
    if (loading) {
      startedAt.current ??= Date.now();
      setPayoff(false);
      return undefined;
    }
    const shownFor = startedAt.current === null ? 0 : Date.now() - startedAt.current;
    startedAt.current = null;
    // `succeeded` is read when the wait ends; later changes must not restart a payoff.
    if (!succeededRef.current || shownFor < Motion.loadingGrace) {
      setPayoff(false);
      return undefined;
    }
    setPayoff(true);
    const timer = setTimeout(() => setPayoff(false), Motion.loadingPayoff);
    return () => clearTimeout(timer);
  }, [loading]);
  if (loading) return 'wait';
  // Keep the same scene mounted on the first success render, before the effect
  // starts its payoff timer. Returning null here would discard its scene and clocks.
  const completingVisibleWait = succeeded && startedAt.current !== null
    && Date.now() - startedAt.current >= Motion.loadingGrace;
  return payoff || completingVisibleWait ? 'ready' : null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  compactRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
  },
  content: {
    alignItems: 'center',
  },
  text: {
    marginTop: Space.md,
    fontSize: FontSize.secondary,
    lineHeight: LineHeight.secondary,
    textAlign: 'center',
  },
  slow: {
    marginTop: Space.sm,
    alignItems: 'center',
  },
  slowText: {
    fontSize: FontSize.secondary,
    lineHeight: LineHeight.secondary,
    textAlign: 'center',
  },
  compactText: {
    marginTop: Space.md,
    fontSize: FontSize.secondary,
    lineHeight: LineHeight.secondary,
    textAlign: 'center',
  },
});
