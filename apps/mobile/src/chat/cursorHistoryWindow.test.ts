import { CursorHistoryWindow } from './cursorHistoryWindow';
import type { ChatMessage, SessionHistory } from '@clawket/agent-protocol';
const row = (id: string, text = id): ChatMessage => ({ id, role: 'user', text, timestampMs: 100 });
const page = (ids: string[], nextCursor?: string): SessionHistory => ({ key: 'session', sessionId: 'native', messages: ids.map(id => row(id)), nextCursor, hasActiveRun: false });
const ids = (window: CursorHistoryWindow) => window.snapshot().messages.map(message => message.id);

it('prepends exact native IDs in native order and keeps the head value and live metadata', () => {
  const window = new CursorHistoryWindow();
  window.acceptHead({ ...page(['b', 'c'], 'older'), hasActiveRun: true, thinkingLevel: 'high' });
  window.append({ ...page(['a', 'b']), messages: [row('a'), row('b', 'outdated')], thinkingLevel: 'low' }, 'older');
  expect(ids(window)).toEqual(['a', 'b', 'c']);
  expect(window.snapshot()).toMatchObject({ hasActiveRun: true, thinkingLevel: 'high' });
  expect(window.snapshot().messages[1].text).toBe('b');
  expect(window.nextCursor).toBeUndefined();
});
it('keeps previously loaded older pages across an overlapping head refresh', () => {
  const window = new CursorHistoryWindow();
  window.acceptHead(page(['c', 'd'], 'p1'));
  window.append(page(['a', 'b'], 'p2'), 'p1');
  window.acceptHead(page(['d', 'e'], 'new-head-cursor'));
  expect(ids(window)).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(window.nextCursor).toBe('p2');
});
it('keeps an exhausted boundary only when the new head overlaps', () => {
  const window = new CursorHistoryWindow();
  window.acceptHead(page(['b'], 'p1')); window.append(page(['a']), 'p1');
  window.acceptHead(page(['b', 'c'], 'new-head-cursor'));
  expect(ids(window)).toEqual(['a', 'b', 'c']);
  expect(window.nextCursor).toBeUndefined();
});
it('retains the reading segment but fills a non-overlapping refresh gap using the new head cursor', () => {
  const window = new CursorHistoryWindow();
  window.acceptHead(page(['b'], 'p1')); window.append(page(['a']), 'p1');
  window.acceptHead(page(['e'], 'gap'));
  expect(ids(window)).toEqual(['a', 'b', 'e']); expect(window.nextCursor).toBe('gap');
  window.append(page(['c', 'd'], 'old'), 'gap');
  expect(ids(window)).toEqual(['a', 'b', 'c', 'd', 'e']);
  window.append(page(['a', 'b']), 'old');
  expect(ids(window)).toEqual(['a', 'b', 'c', 'd', 'e']); expect(window.nextCursor).toBeUndefined();
});
it('a full authoritative head removes retained deleted history', () => {
  const window = new CursorHistoryWindow(); window.acceptHead(page(['b'], 'old'));
  window.append(page(['a']), 'old'); window.acceptHead(page(['new']));
  expect(ids(window)).toEqual(['new']);
});
it('empty native pages can advance without becoming terminal', () => {
  const window = new CursorHistoryWindow(); window.acceptHead(page([], 'p1'));
  expect(window.append(page([], 'p2'), 'p1')).toBe(0);
  expect(window.append(page(['a']), 'p2')).toBe(1); expect(ids(window)).toEqual(['a']);
});
it.each(['same', 'cycle', 'identity', 'malformed'])('rejects a %s page without fabricating a terminal cursor', kind => {
  const window = new CursorHistoryWindow(); window.acceptHead(page(['c'], 'p1'));
  window.append(page(['b'], 'p2'), 'p1');
  const invalid = kind === 'same' ? page([], 'p2') : kind === 'cycle' ? page([], 'p1')
    : kind === 'identity' ? { ...page(['a']), sessionId: 'another' } : { ...page(['a']), messages: [{}] as ChatMessage[] };
  expect(() => window.append(invalid, 'p2')).toThrow();
  expect(ids(window)).toEqual(['b', 'c']); expect(window.nextCursor).toBe('p2');
});
it('a staged page does not modify the committed window', () => {
  const window = new CursorHistoryWindow(); window.acceptHead(page(['b'], 'p1'));
  const staged = window.clone(); staged.append(page(['a']), 'p1');
  expect(ids(window)).toEqual(['b']); expect(window.nextCursor).toBe('p1');
});
it.each(['head', 'older'])('rejects duplicate identities within one %s page', kind => {
  const window = new CursorHistoryWindow(); window.acceptHead(page(['b'], 'p1'));
  expect(() => kind === 'head' ? window.acceptHead(page(['c', 'c'], 'p2')) : window.append(page(['a', 'a']), 'p1')).toThrow('Duplicate');
  expect(ids(window)).toEqual(['b']); expect(window.nextCursor).toBe('p1');
});
