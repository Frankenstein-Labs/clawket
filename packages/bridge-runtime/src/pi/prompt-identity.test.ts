import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { persistedPiCursor, piPromptEntryId } from './prompt-identity.js';

const user = (id: string, parentId: string | null) => ({ type: 'message', id, parentId, message: { role: 'user', content: 'same', timestamp: 1 } });
it('associates only a single exact native user on a continuous bounded branch', () => {
  const entry = user('native-id', 'boundary');
  expect(piPromptEntryId('boundary', { entries: [entry], leafId: entry.id })).toBe(entry.id);
  expect(piPromptEntryId(null, { entries: [{ ...entry, parentId: null }], leafId: entry.id })).toBe(entry.id);
  for (const result of [
    { entries: [entry], leafId: 'missing' },
    { entries: [entry, entry], leafId: entry.id },
    { entries: [entry, user('other', entry.id)], leafId: 'other' },
    { entries: [entry, { type: 'custom', id: 'off-branch', parentId: 'boundary' }], leafId: entry.id },
    { entries: [{ ...entry, parentId: entry.id }], leafId: entry.id },
    { entries: Array.from({ length: 257 }, (_, i) => user(String(i), i ? String(i - 1) : 'boundary')), leafId: '256' },
  ]) expect(piPromptEntryId('boundary', result)).toBeUndefined();
});
it('reads only a bounded private transcript cursor and fails closed on a truncated or oversized row', () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-cursor-'));
  try {
    const file = join(root, 'private.jsonl');
    writeFileSync(file, JSON.stringify({ type: 'session', version: 3 }) + '\n');
    expect(persistedPiCursor(file)).toBeNull();
    writeFileSync(file, 'x'.repeat(128_000) + '\n' + JSON.stringify(user('last', null)) + '\n');
    expect(persistedPiCursor(file)).toBe('last');
    writeFileSync(file, JSON.stringify({ ...user('large', null), content: 'x'.repeat(128_000) }) + '\n');
    expect(persistedPiCursor(file)).toBeUndefined();
    writeFileSync(file, '{partial'); expect(persistedPiCursor(file)).toBeUndefined();
    expect(persistedPiCursor(join(root, 'missing'))).toBeUndefined();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
