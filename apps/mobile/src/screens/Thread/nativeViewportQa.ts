import { requireOptionalNativeModule } from 'expo';
import { findNodeHandle } from 'react-native';
import { sanitizeNativeViewportQa, unavailableNativeViewportQa, type NativeViewportQaSnapshot } from './chatNativeViewportQa';

type NativeApi = Readonly<{
  startAsync: (tag: number, generation: number, optIn: boolean) => Promise<unknown>;
  stopAsync: (generation: number) => Promise<unknown>;
  readAsync: (generation: number) => Promise<unknown>;
}>;
export type NativeViewportQaSession = Readonly<{
  start: () => void; stop: () => void; hasModule: () => boolean; read: () => Promise<NativeViewportQaSnapshot | null>;
}>;
const SHARED = Symbol.for('clawket.nativeViewportQa.generation');
type Host = typeof globalThis & { [SHARED]?: { generation: number } };

/** Optional on old APKs. No module lookup, binding or native query until accepted Start. */
export function createNativeViewportQaSession(options: Readonly<{
  current: () => boolean;
  nativeRef: () => Parameters<typeof findNodeHandle>[0];
  enabled: () => boolean;
}>, load: () => NativeApi | null = () => requireOptionalNativeModule<NativeApi>('ClawketQaViewport')): NativeViewportQaSession {
  let native: NativeApi | null = null;
  let generation = 0;
  let started = false;
  let retired = false;
  let failed = false;
  let pending: Promise<void> | null = null;
  let inFlight: Promise<NativeViewportQaSnapshot | null> | null = null;
  const isCurrent = () => { try { return !retired && options.enabled() && options.current(); } catch { return false; } };
  const stopNative = () => {
    if (!native || generation === 0) return;
    try { void native.stopAsync(generation).catch(() => { failed = true; }); } catch { failed = true; }
  };
  const stop = () => { if (retired) return; retired = true; stopNative(); };
  return {
    start: () => {
      if (started || retired || !isCurrent()) return;
      started = true;
      try {
        native = load();
        if (!native) return; // Exact version-2 snapshot on an APK without this module.
        const host = globalThis as Host;
        const shared = host[SHARED] ?? { generation: 0 };
        host[SHARED] = shared;
        if (!Number.isInteger(shared.generation) || shared.generation < 0 || shared.generation >= 100_000_000) { failed = true; return; }
        generation = ++shared.generation;
        const tag = findNodeHandle(options.nativeRef());
        if (!Number.isInteger(tag) || tag === null || tag <= 0 || !isCurrent()) { failed = true; stop(); return; }
        pending = native.startAsync(tag, generation, true).then(result => {
          if (result !== 'started') failed = true;
          // A stop queued before a deferred bind may have found no native binding.
          // A late completion cleans up only this captured generation, even if JS already retired it.
          if (!isCurrent() || failed) { retired = true; stopNative(); }
        }, () => { failed = true; retired = true; stopNative(); });
      } catch { failed = true; stop(); }
    },
    stop,
    hasModule: () => native !== null && generation > 0,
    read: () => {
      if (!native || generation === 0) return Promise.resolve(null);
      if (inFlight) return inFlight;
      inFlight = (async () => {
        await pending;
        if (!retired && !isCurrent()) stop();
        if (failed) return unavailableNativeViewportQa(generation);
        try {
          const snapshot = sanitizeNativeViewportQa(await native!.readAsync(generation));
          if (!snapshot || snapshot.generation !== generation) { failed = true; stop(); return unavailableNativeViewportQa(generation); }
          // A scope can retire while the ring copy crosses the bridge. Do not call a late capturing result current.
          if (retired && snapshot.status === 'capturing') return unavailableNativeViewportQa(generation);
          if (!retired && !isCurrent()) { stop(); return unavailableNativeViewportQa(generation); }
          return snapshot;
        } catch { failed = true; stop(); return unavailableNativeViewportQa(generation); }
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
