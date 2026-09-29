import type { ChatMessage, SessionHistory } from '@clawket/agent-protocol';

/** One contiguous native page window plus an older segment retained while a
 * new head fills a gap. Native order/identity, never timestamps or text, joins it. */
export class CursorHistoryWindow {
  private head?: SessionHistory;
  private contiguous: ChatMessage[] = [];
  private retained: ChatMessage[] = [];
  private seen = new Set<string>();
  nextCursor?: string;

  clone(): CursorHistoryWindow {
    const next = new CursorHistoryWindow();
    next.head = this.head;
    next.contiguous = this.contiguous;
    next.retained = this.retained;
    next.seen = new Set(this.seen);
    next.nextCursor = this.nextCursor;
    return next;
  }

  private validate(page: SessionHistory): void {
    if (!Array.isArray(page.messages) || page.messages.some(message => typeof message.id !== 'string' || !message.id)) {
      throw new Error('Invalid history page');
    }
    if (new Set(page.messages.map(message => message.id)).size !== page.messages.length) {
      throw new Error('Duplicate native history identity');
    }
    if (page.nextCursor !== undefined && (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 4096)) {
      throw new Error('Invalid history cursor');
    }
    if (this.head && (page.key !== this.head.key || page.sessionId !== this.head.sessionId)) {
      throw new Error('History identity changed; refresh this conversation');
    }
  }

  private merge(older: ChatMessage[], newer: ChatMessage[]): ChatMessage[] {
    const ids = new Set(newer.map(message => message.id));
    const before = older.filter(message => { if (ids.has(message.id)) return false; ids.add(message.id); return true; });
    return [...before, ...newer];
  }

  acceptHead(page: SessionHistory): void {
    this.validate(page);
    const old = this.contiguous;
    const first = page.messages[0]?.id;
    const overlap = first ? old.findIndex(message => message.id === first) : -1;
    if (!page.nextCursor) {
      // A complete authoritative head supersedes retained snapshots.
      this.contiguous = this.merge([], page.messages);
      this.retained = [];
      this.nextCursor = undefined;
      this.seen.clear();
    } else if (overlap >= 0) {
      this.contiguous = this.merge(old.slice(0, overlap), page.messages);
      // Keep the oldest loaded cursor, including a known terminal boundary.
    } else {
      this.retained = this.merge(this.retained, old);
      this.contiguous = this.merge([], page.messages);
      this.nextCursor = page.nextCursor;
      this.seen.clear();
    }
    this.head = page;
  }

  append(page: SessionHistory, cursor: string): number {
    this.validate(page);
    if (!this.head || cursor !== this.nextCursor || this.seen.has(cursor)
      || page.nextCursor === cursor || (page.nextCursor && this.seen.has(page.nextCursor))) {
      throw new Error('History cursor did not advance');
    }
    const before = this.contiguous.length;
    this.contiguous = this.merge(page.messages, this.contiguous);
    this.seen.add(cursor);
    this.nextCursor = page.nextCursor;
    if (!page.nextCursor) this.retained = [];
    return this.contiguous.length - before;
  }

  snapshot(): SessionHistory {
    if (!this.head) throw new Error('History has not loaded');
    return { ...this.head, messages: this.merge(this.retained, this.contiguous), nextCursor: this.nextCursor };
  }
}
