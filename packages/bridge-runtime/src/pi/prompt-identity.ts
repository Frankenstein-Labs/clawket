import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

/** A bounded cursor read, not another transcript parser on the send path. */
export function persistedPiCursor(path: string): string | null | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const stat = fstatSync(fd);
    if (!stat.isFile()) return undefined;
    const size = Math.min(stat.size, 64 * 1024), start = stat.size - size;
    const buffer = Buffer.alloc(size);
    if (readSync(fd, buffer, 0, size, start) !== size) return undefined;
    const text = buffer.toString('utf8').trimEnd();
    const lastBreak = text.lastIndexOf('\n');
    if (start > 0 && lastBreak < 0) return undefined;
    const entry = JSON.parse(text.slice(lastBreak + 1));
    if (entry.type === 'session' && start === 0 && lastBreak < 0) return null;
    return validId(entry.id) ? entry.id : undefined;
  } catch { return undefined; }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Exact parent ancestry and a single native user entry; content and timestamps never participate. */
export function piPromptEntryId(boundary: string | null, value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const result = value as { entries?: any[]; leafId?: unknown };
  if (!Array.isArray(result.entries) || result.entries.length > 256 || !validId(result.leafId)) return undefined;
  const byId = new Map<string, any>();
  for (const entry of result.entries) {
    if (!entry || !validId(entry.id) || byId.has(entry.id)
      || !(entry.parentId === null || validId(entry.parentId))) return undefined;
    byId.set(entry.id, entry);
  }
  const seen = new Set<string>();
  const users: string[] = [];
  let cursor: string | null = result.leafId;
  while (cursor !== boundary) {
    if (cursor === null || seen.has(cursor)) return undefined;
    seen.add(cursor);
    const entry = byId.get(cursor);
    if (!entry) return undefined;
    if (entry.type === 'message' && entry.message?.role === 'user') users.push(entry.id);
    cursor = entry.parentId;
  }
  // An off-branch entry means a concurrent extension/fork changed the transcript.
  if (seen.size !== byId.size || users.length !== 1) return undefined;
  return users[0];
}
