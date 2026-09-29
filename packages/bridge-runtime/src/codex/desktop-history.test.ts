import { expect, it, vi } from 'vitest';
import { loadDesktopHistory } from './desktop-history.js';
it('publishes only a summary tail during ordinary following', async () => {
  const request = vi.fn(async (method: string) => method === 'thread/read' ? { thread: { cwd: '/qa' } }
    : { data: [{ id: 'new', items: [] }, { id: 'old', items: [] }], nextCursor: 'older' });
  const result = await loadDesktopHistory({ request }, 'thread', '/qa', false);
  expect(result.thread.turns.map((t: any) => t.id)).toEqual(['old', 'new']);
  expect(result.cursor).toBe('older');
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledWith('thread/turns/list', { threadId: 'thread', limit: 5, itemsView: 'summary', sortDirection: 'desc' });
});
it('hydrates all paginated items only for an explicit complete-history request', async () => {
  const request = vi.fn(async (method: string, params: any) => {
    if (method === 'thread/read') return { thread: { cwd: '/qa' } };
    if (method === 'thread/turns/list') return { data: [{ id: 't', items: [] }] };
    return params.cursor ? { data: [{ turnId: 't', item: { id: 'user', type: 'userMessage' } }] }
      : { data: [{ turnId: 't', item: { id: 'assistant', type: 'agentMessage' } }], nextCursor: 'older-items' };
  });
  const result = await loadDesktopHistory({ request }, 'thread', '/qa', true);
  expect(result).toMatchObject({ cursor: null, complete: true });
  expect(result.thread.turns[0].items.map((i: any) => i.id)).toEqual(['user', 'assistant']);
  expect(result.thread.turns[0].itemsView).toBe('full');
});
it('refuses oversized complete history without pretending it is complete', async () => {
  const request = vi.fn(async (method: string) => method === 'thread/read' ? { thread: { cwd: '/qa' } }
    : method === 'thread/turns/list' ? { data: [{ id: 't', items: [] }] }
    : { data: [{ turnId: 't', item: { id: 'tool', output: 'x'.repeat(7 * 1024 * 1024) } }] });
  await expect(loadDesktopHistory({ request }, 'thread', '/qa', true)).rejects.toThrow('synchronization limit');
});
it('reduces an oversized summary tail while retaining its exact older cursor', async () => {
  const turn = { id: 't', items: [{ id: 'image', type: 'userMessage', content: 'x'.repeat(4 * 1024 * 1024) }] };
  const request = vi.fn(async (method: string, params: any) => method === 'thread/read' ? { thread: { cwd: '/qa' } }
    : { data: params.limit === 1 ? [turn] : [turn, turn], nextCursor: params.limit === 1 ? 'after-one' : 'after-two' });
  const result = await loadDesktopHistory({ request }, 'thread', '/qa', false);
  expect(result.thread.turns).toHaveLength(1); expect(result.cursor).toBe('after-one');
});
