import type { CodexRpc } from './rpc.js';
import { DESKTOP_HISTORY_BYTES as COMPLETE_BYTES, DesktopHistoryLimitError } from './desktop-limits.js';

/** A normal follower gets a cheap tail; explicit complete-history requests have finite budgets. */
export async function loadDesktopHistory(rpc: Pick<CodexRpc, 'request'>, threadId: string, cwd: string, complete: boolean): Promise<{ thread: any; cursor: string | null; complete: boolean }> {
  const metadata = await rpc.request('thread/read', { threadId, includeTurns: false });
  if (metadata.thread?.cwd !== cwd) throw new Error('Conversation belongs to another project');
  if (!complete) {
    let limit = 5;
    for (;;) {
      try {
        const page = await rpc.request('thread/turns/list', { threadId, limit, itemsView: 'summary', sortDirection: 'desc' });
        if (!Array.isArray(page.data) || (page.nextCursor != null && typeof page.nextCursor !== 'string')) throw new Error('Invalid native history');
        if (Buffer.byteLength(JSON.stringify(page.data)) <= COMPLETE_BYTES) return {
          thread: { ...metadata.thread, turns: [...page.data].reverse() }, cursor: page.nextCursor ?? null, complete: false,
        };
        if (limit === 1) throw new DesktopHistoryLimitError();
      } catch (error) { if ((error as { code?: string }).code !== 'frame_too_large' || limit === 1) throw error; }
      limit = Math.max(1, Math.floor(limit / 2));
    }
  }
  const turns: any[] = [], seen = new Set<string>();
  let cursor: string | undefined, bytes = 0, itemCount = 0;
  do {
    const page = await rpc.request('thread/turns/list', { threadId, limit: 10, itemsView: 'notLoaded', sortDirection: 'desc', ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.data)) throw new Error('Invalid native history');
    for (const turn of page.data) {
      if (turns.length >= 200) throw new DesktopHistoryLimitError();
      const items: any[] = [], itemCursors = new Set<string>(); let itemCursor: string | undefined;
      do {
        const result = await rpc.request('thread/items/list', { threadId, turnId: turn.id, limit: 20, sortDirection: 'desc', ...(itemCursor ? { cursor: itemCursor } : {}) });
        if (!Array.isArray(result.data)) throw new Error('Invalid native item history');
        for (const row of result.data) {
          if (row.turnId !== turn.id || !row.item) throw new Error('Native history returned another turn');
          bytes += Buffer.byteLength(JSON.stringify(row.item));
          if (++itemCount > 5000 || bytes > COMPLETE_BYTES) throw new DesktopHistoryLimitError();
          items.push(row.item);
        }
        itemCursor = result.nextCursor ?? undefined;
        if (itemCursor) { if (typeof itemCursor !== 'string' || itemCursors.has(itemCursor)) throw new Error('Invalid native item cursor'); itemCursors.add(itemCursor); }
      } while (itemCursor);
      turns.push({ ...turn, items: items.reverse(), itemsView: 'full' });
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor) { if (typeof cursor !== 'string' || seen.has(cursor)) throw new Error('Invalid native history cursor'); seen.add(cursor); }
  } while (cursor);
  return { thread: { ...metadata.thread, turns: turns.reverse() }, cursor: cursor ?? null, complete };
}
