import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { ArrowUpRight, Settings, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme';
import { FontSize, FontWeight, IconSize, LineHeight, Motion, Radius, Space } from '../../theme/tokens';
import { Companion } from '../../components/ui/Companion';
import { Button } from '../../components/ui/Button';
import { FloatingButton } from '../../components/ui/FloatingButton';
import { PlatformDisc, type PlatformKind } from '../../components/ui/PlatformMark';
import { CLAWKET_GITHUB_REPO_URL } from '../../config/app-links';
import { openExternalUrl } from '../../utils/openExternalUrl';

type Props = {
  onConnect: () => void;
  onClose?: () => void;
  onSettings?: () => void;
};

/**
 * The agent products a new user can pair, in the backend chooser's order (owner decision
 * 2026-09-26). Brand names stay untranslated; the local-model server is not a product to list.
 */
export const WELCOME_AGENTS: ReadonlyArray<Readonly<{ platform: PlatformKind; name: string }>> = [
  { platform: 'openclaw', name: 'OpenClaw' },
  { platform: 'hermes', name: 'Hermes' },
  { platform: 'codex', name: 'Codex' },
  { platform: 'claude-code', name: 'Claude Code' },
  { platform: 'pi', name: 'Pi' },
];

/**
 * Stacked official marks: large enough to recognise at a glance, overlapping like a group of faces.
 * Each mark paints over its left neighbour in document order (Android ignores sibling zIndex here).
 */
const MARK_SIZE = 48;
/** Canvas ring cut around each disc so an overlapped neighbour reads as a separate face. */
const MARK_RING = 3;
const MARK_OVERLAP = Space.md;
/** Share of the circle a bare mark spans, matching an Agent's product face on the roster. */
const MARK_GLYPH = 0.54;

/**
 * First screen of a fresh install (owner request 2026-09-27): what Clawket connects to is the
 * message, so the supported agents take the centre and the open-source repository sits under the
 * one action. Setup instructions belong to the next step.
 */
export function WelcomeScreen({ onConnect, onClose, onSettings }: Props): React.JSX.Element {
  const { t } = useTranslation('config');
  const { theme: { colors } } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <View testID="welcome-screen" style={[styles.screen, { backgroundColor: colors.canvas, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.wordmark}>
          <Companion size={IconSize.lg} />
          <Text style={[styles.brand, { color: colors.ink }]}>{t('Clawket')}</Text>
        </View>
        {onSettings && !onClose ? <FloatingButton icon={Settings} appearance="plain" onPress={onSettings} accessibilityLabel={t('Settings')} /> : null}
        {onClose ? <FloatingButton icon={X} appearance="plain" onPress={onClose} accessibilityLabel={t('Close', { ns: 'common' })} /> : null}
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Space.lg) + Space.lg }]} showsVerticalScrollIndicator={false}>
        <View style={styles.introduction}>
          <Animated.View
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            entering={reducedMotion ? undefined : FadeIn.duration(Motion.duration.slow)}
            style={styles.artwork}
          >
            <Companion size={120} pose="curious" />
          </Animated.View>
          <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(Motion.duration.slow)} style={styles.copy}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{t('The agents on your computer,\nall in one app')}</Text>
            <View testID="welcome-agents" style={styles.agents}>
              <View
                testID="welcome-agent-marks"
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.marks}
              >
                {WELCOME_AGENTS.map((agent, index) => (
                  <View
                    key={agent.platform}
                    testID={`welcome-agent-${agent.platform}`}
                    style={[
                      styles.markRing,
                      { backgroundColor: colors.canvas },
                      index > 0 ? styles.markOverlap : null,
                    ]}
                  >
                    <PlatformDisc platform={agent.platform} size={MARK_SIZE} glyph={MARK_GLYPH} />
                    {/* A white disc would dissolve into the canvas without its hairline edge. */}
                    <View pointerEvents="none" style={[styles.markEdge, { borderColor: colors.line }]} />
                  </View>
                ))}
              </View>
              <Text testID="welcome-agent-names" style={[styles.names, { color: colors.inkSecondary }]}>
                {WELCOME_AGENTS.map((agent) => agent.name).join(' · ')}
              </Text>
            </View>
          </Animated.View>
        </View>
        <View style={styles.actions}>
          <Button testID="welcome-connect" size="lg" label={t('Connect an agent')} onPress={onConnect} />
          <Button
            testID="welcome-open-source"
            label={t('Clawket is open source')}
            variant="text"
            icon={ArrowUpRight}
            accessibilityRole="link"
            multiline
            onPress={() => { void openExternalUrl(CLAWKET_GITHUB_REPO_URL, () => undefined); }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 60, paddingHorizontal: Space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  brand: { fontSize: FontSize.body, lineHeight: LineHeight.body, fontWeight: FontWeight.semibold },
  content: { flexGrow: 1, paddingHorizontal: Space.xl, gap: Space.xxl },
  introduction: { flex: 1, justifyContent: 'center', paddingVertical: Space.xl, gap: Space.lg },
  artwork: { height: 168, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', gap: Space.xl },
  title: { fontSize: FontSize.display, lineHeight: LineHeight.display, fontWeight: FontWeight.semibold, textAlign: 'center' },
  agents: { alignItems: 'center', gap: Space.md },
  // Always left to right, like the names line under it, including in Arabic.
  marks: { flexDirection: 'row', alignItems: 'center', direction: 'ltr' },
  markRing: { padding: MARK_RING, borderRadius: Radius.full },
  markOverlap: { marginLeft: -MARK_OVERLAP },
  markEdge: {
    position: 'absolute',
    top: MARK_RING,
    left: MARK_RING,
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  names: { fontSize: FontSize.secondary, lineHeight: LineHeight.secondary, fontWeight: FontWeight.regular, textAlign: 'center' },
  actions: { gap: Space.xs, paddingBottom: Space.sm },
});
