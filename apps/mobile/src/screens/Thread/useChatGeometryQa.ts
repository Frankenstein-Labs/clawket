import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AppState } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { createChatGeometryQa, type ChatGeometryQaApi } from './chatGeometryQa';
import { registerChatGeometryQaCache } from './registerChatGeometryQaCache';
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
}>): void {
  const latest = useRef(options);
  latest.current = options;
  useLayoutEffect(() => {
    if (!collector || !options.active) return undefined;
    const expectedScope = options.scope;
    const detach = collector.attach(() => {
      const list = latest.current.list.current;
      if (!list || AppState.currentState !== 'active' || !latest.current.active
        || latest.current.scope !== expectedScope) return null;
      const raw = latest.current.raw;
      const bindingRevision = raw.bindingRevision();
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
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') collector.background();
    });
    return () => { detach(); subscription.remove(); };
  }, [options.active, options.scope]);
}
