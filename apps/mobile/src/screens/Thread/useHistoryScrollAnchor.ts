import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

type Row = Readonly<{ key: string; type: string }>;
type List = {
  getFirstVisibleIndex: () => number;
  getLayout: (index: number) => { y: number } | undefined;
  getFirstItemOffset: () => number;
  getAbsoluteLastScrollOffset: () => number;
  scrollToOffset: (options: { offset: number; animated: boolean }) => void;
};
type Anchor = { scope: string; list: List; key: string; viewportY: number; correction: number | null };

/** A conditional date separator is not a surviving row when an earlier page joins its minute. */
export function useHistoryScrollAnchor(scope: string, listRef: RefObject<List | null>, rows: ReadonlyArray<Row>) {
  const latest = useRef({ scope, rows });
  latest.current = { scope, rows };
  const anchor = useRef<Anchor | null>(null);
  const managedScope = useRef<string | null>(null);
  const [managed, setManaged] = useState<string | null>(null);
  const isActive = useCallback(() => anchor.current?.scope === latest.current.scope
    && anchor.current.list === listRef.current, [listRef]);
  const release = useCallback(() => {
    anchor.current = null;
  }, []);
  useLayoutEffect(() => {
    if (anchor.current?.scope !== scope) anchor.current = null;
    if (managedScope.current !== scope) {
      managedScope.current = null;
      setManaged(null);
    }
  }, [scope]);
  const capture = useCallback((offset?: number) => {
    const list = listRef.current;
    if (!list) return;
    try {
      const current = latest.current;
      const start = Math.max(0, list.getFirstVisibleIndex());
      // Date rows may disappear; messages, tool receipts and run rows keep their identities.
      const index = current.rows.findIndex((row, index) => index >= start && row.type !== 'date');
      const layout = index >= 0 ? list.getLayout(index) : undefined;
      const scrollOffset = offset ?? list.getAbsoluteLastScrollOffset();
      const viewportY = layout ? layout.y + list.getFirstItemOffset() - scrollOffset : NaN;
      if (!Number.isFinite(viewportY)) return;
      anchor.current = { scope: current.scope, list, key: current.rows[index]!.key, viewportY, correction: null };
      // Keep one correction owner for this list instance. Re-enabling FlashList
      // would apply its stale pre-page layout delta a second time.
      if (managedScope.current !== current.scope) {
        managedScope.current = current.scope;
        setManaged(current.scope);
      }
    } catch {
      // An unplaced/retired list cannot supply an anchor; its normal placement remains authoritative.
    }
  }, [listRef]);
  const restore = useCallback(() => {
    const saved = anchor.current;
    const current = latest.current;
    if (!saved || saved.scope !== current.scope || saved.list !== listRef.current) return;
    const index = current.rows.findIndex(row => row.key === saved.key);
    if (index < 0) {
      release();
      return;
    }
    try {
      const layout = saved.list.getLayout(index);
      if (!layout) return;
      const offset = Math.max(0, layout.y + saved.list.getFirstItemOffset() - saved.viewportY);
      if (!Number.isFinite(offset) || Math.abs(offset - saved.list.getAbsoluteLastScrollOffset()) < 0.5
        || (saved.correction !== null && Math.abs(offset - saved.correction) < 0.5)) return;
      saved.correction = offset;
      saved.list.scrollToOffset({ offset, animated: false });
    } catch {
      release();
    }
  }, [listRef, release]);
  const readerScrolled = useCallback((offset: number) => {
    if (!isActive()) return;
    const saved = anchor.current!;
    // A compensation's native event is not a new reading position.
    if (saved.correction !== null && Math.abs(offset - saved.correction) < 0.5) {
      saved.correction = null;
      return;
    }
    capture(offset);
  }, [capture, isActive]);
  const beginDrag = useCallback((pagePending: boolean) => {
    if (managedScope.current === latest.current.scope || (pagePending && isActive())) capture();
    else release();
  }, [capture, isActive, release]);
  return { managed: managed === scope, capture, restore, readerScrolled, beginDrag, release, isActive };
}
