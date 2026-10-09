import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { FloatingButton } from '../../components/ui/FloatingButton';
import { openHandsCredentialStore } from '../../connection/openhands/credential-store';
import {
  OPENHANDS_CLOUD_HOST,
  pollOpenHandsCloudToken,
  startOpenHandsCloudDeviceFlow,
} from '../../connection/openhands/device-flow';
import { isUnauthorizedCloudError, verifyOpenHandsCloudSession } from '../../connection/openhands/cloud-client';
import { useAppTheme } from '../../theme';
import { FontSize, FontWeight, LineHeight, Radius, Space } from '../../theme/tokens';

type Props = Readonly<{ onBack?: () => void; onConnected?: () => void }>;
type Phase = 'idle' | 'starting' | 'waiting' | 'connected' | 'error';

/** OpenHands Cloud OAuth Device Flow; tokens are never placed in ordinary app storage. */
export function OpenHandsCloudAuthScreen({ onBack, onConnected }: Props): React.JSX.Element {
  const { theme: { colors } } = useAppTheme();
  const insets = useSafeAreaInsets();
  const controllerRef = useRef<AbortController | null>(null);
  const connectedNotifiedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [authorization, setAuthorization] = useState<Awaited<ReturnType<typeof startOpenHandsCloudDeviceFlow>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Redirect the user exactly once, as soon as the credential is usable.
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const notifyConnected = useCallback(() => {
    if (connectedNotifiedRef.current) return;
    connectedNotifiedRef.current = true;
    onConnectedRef.current?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    void openHandsCredentialStore.getAccessToken().then(async (token) => {
      if (!token) return;
      // Show progress while the stored session is checked, so an already
      // connected user never sees the sign-in button during the probe.
      if (mounted) setPhase('starting');
      try {
        await verifyOpenHandsCloudSession();
        if (mounted) {
          setPhase('connected');
          notifyConnected();
        }
      } catch (error) {
        // Only a rejected credential is discarded; an offline start keeps the token.
        if (!isUnauthorizedCloudError(error)) {
          if (mounted) {
            setPhase('connected');
            notifyConnected();
          }
          return;
        }
        await openHandsCredentialStore.clearAccessToken();
        if (mounted) setMessage('Ta session OpenHands Cloud a expiré. Reconnecte-toi.');
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
      controllerRef.current?.abort();
    };
  }, [notifyConnected]);

  const beginLogin = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setAuthorization(null);
    setMessage(null);
    setCopied(false);
    setPhase('starting');
    try {
      const result = await startOpenHandsCloudDeviceFlow();
      if (controller.signal.aborted) return;
      setAuthorization(result);
      setPhase('waiting');
      void Linking.openURL(result.verification_uri_complete).catch(() => {
        setMessage('Ouvre le lien de vérification ci-dessous pour continuer.');
      });
      const token = await pollOpenHandsCloudToken(result.device_code, {
        interval: result.interval,
        timeout: result.expires_in * 1000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      await openHandsCredentialStore.saveAccessToken(token.access_token);
      try {
        await verifyOpenHandsCloudSession();
      } catch (error) {
        // The device flow produced a token, so the credential is valid; a
        // transient verification failure must not discard it. Only an explicit
        // rejection means the token already expired.
        if (isUnauthorizedCloudError(error)) {
          await openHandsCredentialStore.clearAccessToken().catch(() => undefined);
          if (!controller.signal.aborted) {
            setMessage('La connexion a échoué ou le code a expiré. Réessaie.');
            setPhase('error');
          }
          return;
        }
      }
      if (!controller.signal.aborted) {
        setPhase('connected');
        notifyConnected();
      }
    } catch {
      if (controller.signal.aborted) return;
      await openHandsCredentialStore.clearAccessToken().catch(() => undefined);
      setMessage('La connexion a échoué ou le code a expiré. Réessaie.');
      setPhase('error');
    }
  }, [notifyConnected]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setAuthorization(null);
    setMessage(null);
    setPhase('idle');
  }, []);

  const openVerification = useCallback(() => {
    const url = authorization?.verification_uri_complete;
    if (url) void Linking.openURL(url).catch(() => setMessage('Impossible d’ouvrir le navigateur.'));
  }, [authorization]);

  const copyCode = useCallback(async () => {
    if (!authorization) return;
    await Clipboard.setStringAsync(authorization.user_code);
    setCopied(true);
  }, [authorization]);

  const disconnect = useCallback(async () => {
    controllerRef.current?.abort();
    await openHandsCredentialStore.clearAccessToken();
    setAuthorization(null);
    setMessage(null);
    setPhase('idle');
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas, paddingTop: insets.top }]} testID="openhands-cloud-auth">
      <View style={styles.header}>
        {onBack ? <FloatingButton icon={ArrowLeft} appearance="surface" onPress={onBack} accessibilityLabel="Retour" /> : <View style={styles.headerSpacer} />}
        <Text style={[styles.headerTitle, { color: colors.ink }]}>OpenHands Cloud</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, Space.lg) + Space.lg }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Connexion sécurisée</Text>
        <Text style={[styles.body, { color: colors.inkSecondary }]}>Autorise OpenHands sur ton compte dans le navigateur. Le jeton reste dans le stockage sécurisé de cet appareil.</Text>

        {phase === 'waiting' && authorization ? (
          <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.codeLabel, { color: colors.inkSecondary }]}>Code de vérification</Text>
            <Text selectable style={[styles.code, { color: colors.ink }]}>{authorization.user_code}</Text>
            <Button testID="openhands-copy-code" label={copied ? 'Code copié' : 'Copier le code'} variant="text" onPress={() => { void copyCode(); }} />
            <Button testID="openhands-open-verification" label="Ouvrir la page de vérification" icon={ExternalLink} onPress={openVerification} />
            <View style={styles.waiting}>
              <ActivityIndicator color={colors.inkSecondary} />
              <Text style={[styles.waitingText, { color: colors.inkSecondary }]}>En attente de ton autorisation…</Text>
            </View>
          </View>
        ) : null}

        {phase === 'connected' ? (
          <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.connectedTitle, { color: colors.ink }]}>OpenHands Cloud est connecté</Text>
            <Text style={[styles.body, { color: colors.inkSecondary }]}>L’accès est enregistré dans SecureStore et protégé par le stockage sécurisé Android.</Text>
            <Button label="Ouvrir OpenHands Cloud" icon={ExternalLink} onPress={() => { void Linking.openURL(OPENHANDS_CLOUD_HOST); }} />
            <Button label="Déconnecter" variant="text" onPress={() => { void disconnect(); }} />
          </View>
        ) : null}

        {message ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.inkSecondary }]}>{message}</Text> : null}
        {phase === 'error' ? <Button label="Réessayer" onPress={() => { void beginLogin(); }} /> : null}
        {phase === 'idle' ? <Button testID="openhands-login" size="lg" label="Se connecter à OpenHands Cloud" onPress={() => { void beginLogin(); }} /> : null}
        {phase === 'starting' ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.inkSecondary} />
            <Text style={[styles.waitingText, { color: colors.inkSecondary }]}>Préparation de la connexion…</Text>
          </View>
        ) : null}
        {phase === 'waiting' ? <Button label="Annuler" variant="text" onPress={cancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 60, paddingHorizontal: Space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: FontSize.body, lineHeight: LineHeight.body, fontWeight: FontWeight.semibold },
  headerSpacer: { width: 44, height: 44 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Space.xl, gap: Space.lg },
  title: { fontSize: FontSize.title, lineHeight: LineHeight.title, fontWeight: FontWeight.semibold, textAlign: 'center' },
  body: { fontSize: FontSize.body, lineHeight: LineHeight.body, textAlign: 'center' },
  codeCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.xl, padding: Space.lg, gap: Space.md },
  codeLabel: { fontSize: FontSize.secondary, lineHeight: LineHeight.secondary, textAlign: 'center' },
  code: { fontSize: FontSize.title, lineHeight: LineHeight.title, fontWeight: FontWeight.semibold, letterSpacing: 4, textAlign: 'center' },
  connectedTitle: { fontSize: FontSize.body, lineHeight: LineHeight.body, fontWeight: FontWeight.semibold, textAlign: 'center' },
  waiting: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Space.sm },
  waitingText: { fontSize: FontSize.secondary, lineHeight: LineHeight.secondary },
  message: { fontSize: FontSize.secondary, lineHeight: LineHeight.secondary, textAlign: 'center' },
});
