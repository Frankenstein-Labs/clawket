import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import type { FlashListRef } from '@shopify/flash-list';
import { createChatGeometryQa, type ChatGeometryQaApi, type ChatGeometryQaSource } from './chatGeometryQa';
import { registerChatGeometryQaCache, qaGeometryCacheEnabled } from './registerChatGeometryQaCache';
import type { ViewportQaObserver } from './chatViewportQa';
import type { UiThreadFollow } from './useUiThreadFollow';

const QUERY_GATE = Symbol.for('clawket.chatGeometryQa.queryGate');
type QaGlobal = typeof globalThis & { __CLAWKET_CHAT_GEOMETRY_QA__?: ChatGeometryQaApi & {
  [QUERY_GATE]?: { busy: boolean; request: number };
} };
// An Inspector entry point, not persistent configuration or an analytics sink.
const previous = (globalThis as QaGlobal).__CLAWKET_CHAT_GEOMETRY_QA__;
const collector = typeof __DEV__ !== 'undefined' && __DEV__
  ? createChatGeometryQa(true, undefined, previous?.[QUERY_GATE]) : null;
if (collector) {
  const host = globalThis as QaGlobal;
  previous?.stop();
  // A fixed, private gate survives Fast Refresh without retaining old rings.
  host.__CLAWKET_CHAT_GEOMETRY_QA__ = Object.freeze({ ...collector.api, [QUERY_GATE]: collector.queryGate });
}
registerChatGeometryQaCache(collector?.api ?? null);

type ReadingState = Readonly<{
  offset: number;
  height: number;
  viewport: number;
  readerScrolling: boolean;
  bottomFollowing: boolean;
  historyPaging: boolean;
}>;

/** Samples public getters only; no SDK interaction/viewability/scroll commands. */
export function useChatGeometryQa<T>(options: Readonly<{
  active: boolean;
  scope: string;
  list: RefObject<FlashListRef<T> | null>;
  rows: ReadonlyArray<T>;
  raw: UiThreadFollow['qaGeometry'];
  reading: () => ReadingState;
}>) {
  const viewportEnabled = qaGeometryCacheEnabled(typeof __DEV__ !== 'undefined' && __DEV__, Platform.OS,
    Application.applicationId, process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE);
  const latest = useRef(options);
  latest.current = options;
  const binding = useRef<(() => ChatGeometryQaSource | null) | null>(null);
  const mounted = useRef(new Map<number, number>());
  const mountState = useRef({ observed: false, truncated: false });
  const observer = useMemo(() => {
    const scope = options.scope;
    const allowed = () => viewportEnabled && latest.current.active && latest.current.scope === scope
      && binding.current !== null && collector?.isRecording(binding.current) === true;
    const observe: ViewportQaObserver = (value, command) => {
      try {
        if (!allowed()) return null;
        const indices = [...mounted.current.keys()];
        const reading = latest.current.reading();
        return collector!.observe(binding.current!, { offset: reading.offset, contentHeight: reading.height,
          viewportHeight: reading.viewport, rowCount: latest.current.rows.length,
          mountedStart: indices.length ? Math.min(...indices) : null,
          mountedEnd: indices.length ? Math.max(...indices) : null,
          mountedCount: mountState.current.observed ? [...mounted.current.values()].reduce((sum, count) => sum + count, 0) : null,
          mountedTruncated: mountState.current.truncated, ...value }, command);
      } catch { return null; }
    };
    // Keep the QA Fragment shape stable across focus changes. Recording itself
    // still requires the current active binding and an accepted Start.
    return { enabled: viewportEnabled, observe,
      cell: (index: number, present: boolean) => {
        // Existing cells at Start may never commit again. This is an incomplete
        // React lifecycle range, not the SDK engaged range or native paint.
        if (!allowed() || !Number.isInteger(index) || index < 0 || index > 100_000_000) return;
        mountState.current.observed = true;
        const count = mounted.current.get(index) ?? 0;
        if (present) {
          if (count === 256) mountState.current.truncated = true;
          else if (mounted.current.size < 256 || count > 0) mounted.current.set(index, count + 1);
          else mountState.current.truncated = true;
        } else if (count > 1) mounted.current.set(index, count - 1);
        else mounted.current.delete(index);
        observe({ kind: present ? 'cell_mount' : 'cell_unmount', anchorIndex: index });
      },
    };
  }, [options.scope, viewportEnabled]);
  useLayoutEffect(() => {
    if (!collector || !options.active) return undefined;
    const expectedScope = options.scope;
    const open = () => {
      const list = latest.current.list.current;
      if (!list || AppState.currentState !== 'active' || !latest.current.active
        || latest.current.scope !== expectedScope) return null;
      const raw = latest.current.raw;
      const bindingRevision = raw.bindingRevision();
      mounted.current.clear(); mountState.current = { observed: false, truncated: false };
      let lastRows = latest.current.rows;
      let dataRevision = 0;
      return {
        isCurrent: () => latest.current.active && latest.current.scope === expectedScope
          && latest.current.list.current === list && raw.bindingRevision() === bindingRevision
          && AppState.currentState === 'active',
        enableRaw: raw.enable,
        readRaw: raw.sample,
        readSdk: () => {
          if (lastRows !== latest.current.rows) {
            dataRevision = Math.min(100_000_000, dataRevision + 1);
            lastRows = latest.current.rows;
          }
          const reading = latest.current.reading();
          const base = {
            rowCount: lastRows.length, dataRevision,
            jsOffset: reading.offset, jsContentHeight: reading.height, jsViewportHeight: reading.viewport,
            readerScrolling: reading.readerScrolling, bottomFollowing: reading.bottomFollowing,
            historyPaging: reading.historyPaging,
          };
          try {
            const range = list.computeVisibleIndices();
            // At most four layout reads, regardless of transcript size.
            const indices = [...new Set([range.startIndex, range.endIndex, range.startIndex - 1, range.endIndex + 1])]
              .filter(index => Number.isInteger(index) && index >= 0 && index < lastRows.length);
            return {
              ...base, available: true,
              offset: list.getAbsoluteLastScrollOffset(), headerOffset: list.getFirstItemOffset(),
              contentHeight: list.getChildContainerDimensions().height,
              viewportHeight: list.getWindowSize().height,
              visibleStart: range.startIndex, visibleEnd: range.endIndex,
              layouts: indices.map(index => {
                const layout = list.getLayout(index);
                return { index, y: layout?.y, height: layout?.height };
              }),
            };
          } catch { return { ...base, available: false }; }
        },
      };
    };
    binding.current = open;
    const detach = collector.attach(open);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') collector.background();
    });
    return () => { detach(); if (binding.current === open) binding.current = null; subscription.remove(); };
  }, [options.active, options.scope]);
  return observer;
}
