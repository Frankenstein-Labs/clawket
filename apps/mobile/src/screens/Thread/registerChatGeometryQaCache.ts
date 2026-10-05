import { DevSettings, Platform, ToastAndroid } from 'react-native';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import type { ChatGeometryQaApi } from './chatGeometryQa';
import { createQaGeometryCache, type QaCacheGate } from './chatGeometryQaCache';

const CACHE_NAME = 'clawket-chat-geometry-qa-v1';
const SHARED = Symbol.for('clawket.chatGeometryQa.cacheExport');
type Binding = { api: ChatGeometryQaApi; sink: ReturnType<typeof createQaGeometryCache> };
type Shared = { gate: QaCacheGate; binding: Binding | null };
type QaHost = typeof globalThis & { [SHARED]?: Shared };

export function qaGeometryCacheEnabled(dev: boolean, platform: string, appId: string | null, optIn: string | undefined): boolean {
  return dev === true && platform === 'android' && appId === 'com.p697.clawket.qa' && optIn === '1';
}

/** Fixed Dev Menu controls. Registration itself neither captures nor reads/writes files. */
export function registerChatGeometryQaCache(api: ChatGeometryQaApi | null): void {
  const host = globalThis as QaHost;
  const enabled = qaGeometryCacheEnabled(typeof __DEV__ !== 'undefined' && __DEV__, Platform.OS,
    Application.applicationId, process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE);
  const previous = host[SHARED];
  if (!api || !enabled) {
    previous?.binding?.sink.retire();
    if (previous) previous.binding = null;
    return;
  }
  const shared = previous ?? { gate: { used: false, busy: false, starting: false, blocked: false }, binding: null };
  host[SHARED] = shared;
  if (shared.binding?.api !== api) {
    shared.binding?.sink.retire();
    const sink = createQaGeometryCache({ api, gate: shared.gate, replace: async json => {
      const cache = FileSystem.cacheDirectory;
      if (typeof cache !== 'string' || !cache.startsWith('file://')) throw new Error('qa_cache_unavailable');
      // Same app-private cache filesystem; Android legacy moveAsync uses renameTo, with no copy fallback.
      const temp = cache + CACHE_NAME + '.tmp';
      await FileSystem.writeAsStringAsync(temp, json, { encoding: FileSystem.EncodingType.UTF8 });
      await FileSystem.moveAsync({ from: temp, to: cache + CACHE_NAME + '.json' });
    } });
    shared.binding = { api, sink };
  }
  // Read the current binding at invocation, rather than closing over a retired API/module.
  DevSettings.addMenuItem('QA Geometry Start', () => {
    if (!qaGeometryCacheEnabled(typeof __DEV__ !== 'undefined' && __DEV__, Platform.OS,
      Application.applicationId, process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE)) return;
    const message = shared.binding?.sink.start() === 'started' ? 'QA Geometry started' : 'QA Geometry unavailable';
    // Sampler acceptance is not asynchronous file-write success. Feedback must not change the gate.
    try { ToastAndroid.show(message, ToastAndroid.SHORT); } catch { /* QA feedback is best effort. */ }
  });
  DevSettings.addMenuItem('QA Geometry Stop', () => { shared.binding?.sink.stop(); });
}
