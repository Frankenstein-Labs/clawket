import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getConnectionRuntime, useConnections } from '../../connection';
import { FloatingButton } from '../../components/ui/FloatingButton';
import { HeaderPill } from '../../components/ui/HeaderPill';
import { LoadingState, useLoadingHandoff } from '../../components/ui/LoadingState';
import { SessionPanel } from '../SessionPanel';
import { ManualSessions } from '../../services/manual-sessions';
import { SessionPreferencesService } from '../../services/session-preferences';
import { useAppTheme } from '../../theme';
import { ControlSize, Space } from '../../theme/tokens';
import { useProPaywall } from '../../contexts/ProPaywallContext';
import type { ThreadScreenProps } from './ThreadScreen';
import type { RootStackParamList } from '../../navigation/root-stack';

/** Navigation only: never mounts a chat controller or creates a placeholder thread. */
export function ConversationEntry({ navigation, route, locked, lockedReason = 'agents', onSessionAction, onSessionPanelAfterClose, pinnedSessionKeys }: ThreadScreenProps) {
  const { connectionId, agentId } = route.params;
  const focused = useIsFocused();
  const connections = useConnections();
  const { theme } = useAppTheme();
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const { showPaywall } = useProPaywall();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<'connecting' | 'sessions'>('connecting');
  const closed = useRef(false);
  const pending = useRef<RootStackParamList['Thread'] | null>(null);
  const scope = useRef({ connectionId, agentId, focused });
  scope.current = { connectionId, agentId, focused };
  const rosterGroup = connections.roster.find(group => group.connection.id === connectionId);
  const rosterAgent = rosterGroup?.agents.find(row => row.agent.agentId === agentId)?.agent;
  const title = rosterAgent?.name ?? t('Sessions');
  // The picker rising over the page is the success moment; a failed connect hands over without a payoff.
  const loaderPhase = useLoadingHandoff(loading, connections.activeConnectionId === connectionId && connections.activeState === 'ready');

  useEffect(() => {
    if (!focused || !connections.initialized) return;
    let current = true;
    closed.current = false;
    setLoading(true);
    setStage('connecting');
    setVisible(false);
    pending.current = null;
    void (async () => {
      if (locked) return;
      const runtime = getConnectionRuntime();
      await runtime.activate(connectionId);
      if (current) setStage('sessions');
      await runtime.refreshRoster();
      const last = await SessionPreferencesService.getLastSession(connectionId, agentId);
      if (!current || runtime.getSnapshot().activeConnectionId !== connectionId) return;
      const sessions = runtime.getSnapshot().roster.find(group => group.connection.id === connectionId)?.agents
        .find(row => row.agent.agentId === agentId)?.sessions;
      if (last && sessions?.some(session => session.key === last)) {
        navigation.replace('Thread', { ...route.params, sessionKey: last });
        current = false;
      }
    })().catch(() => { /* The session sheet retains cached history and reconnect controls. */ }).finally(() => {
      if (current) { setLoading(false); setVisible(true); }
    });
    return () => { current = false; closed.current = true; };
  }, [connectionId, agentId, focused, connections.initialized, locked, navigation]);

  const choose = (sessionKey: string) => {
    pending.current = { ...route.params, sessionKey, from: 'panel' };
    setVisible(false);
  };
  const close = () => { closed.current = true; setVisible(false); };
  return <View testID="conversation-entry" style={[styles.page, { backgroundColor: theme.colors.canvas }]}>
    {/* The chat's own header and loading state, so entry, picker and thread never swap chrome. */}
    <View style={[styles.header, { paddingTop: insets.top + Space.sm }]}>
      <FloatingButton testID="conversation-entry-back" icon={ChevronLeft} appearance="surface"
        accessibilityLabel={t('Back')} onPress={() => navigation.goBack()} />
      <View style={styles.pillSlot}>
        <HeaderPill testID="conversation-entry-header-pill" agentId={agentId} name={title} subtitle=""
          emoji={rosterAgent?.emoji} avatarUrl={rosterAgent?.avatarUrl}
          platform={rosterGroup?.connection.backendKind} />
      </View>
      <View style={styles.headerSpacer} pointerEvents="none" />
    </View>
    {loaderPhase ? <LoadingState testID="conversation-entry-loading" pose="connecting" phase={loaderPhase}
      message={stage === 'connecting' ? t('Connecting') : t('Loading sessions')}
      slowAction={{ label: t('Manage connection', { ns: 'config' }), onPress: () => navigation.navigate('Connection', { connectionId }) }} /> : null}
    <SessionPanel connectionId={connectionId} visible={visible && focused} currentAgentId={agentId} currentSessionKey=""
      permissionDenied={locked} pinnedSessionKeys={pinnedSessionKeys} onClose={close}
      onAfterClose={() => {
        if (!scope.current.focused) return;
        const target = pending.current;
        pending.current = null;
        onSessionPanelAfterClose?.();
        if (target) navigation.replace('Thread', target);
        else if (!loading) navigation.goBack();
      }}
      onSelectSession={row => choose(row.key)}
      onCreateSession={async (agent, projectId) => {
        const runtime = getConnectionRuntime();
        const adapter = runtime.getSnapshot().activeAdapter;
        if (locked || !adapter || adapter.connection.id !== connectionId) throw new Error('Connection unavailable');
        const created = await ManualSessions.create(adapter, agent.agentId, 'manual', projectId ? { projectId } : undefined);
        const current = scope.current;
        if (closed.current || !current.focused || current.connectionId !== connectionId || current.agentId !== agentId || runtime.getSnapshot().activeAdapter !== adapter) return;
        choose(created.key);
      }}
      onSessionAction={onSessionAction ? async (row, action, payload) => {
        await onSessionAction(row, action, payload);
        if (action === 'export') close();
      } : undefined}
      onOpenPermission={() => showPaywall(lockedReason)} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  pillSlot: { flex: 1, alignItems: 'center', minWidth: 0 },
  headerSpacer: { width: ControlSize.floatingButton },
});
