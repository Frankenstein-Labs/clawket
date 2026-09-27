import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeOwnerLock } from './owner-lock.js';
const directories: string[] = [];
const fixture = () => { const directory = mkdtempSync(join(tmpdir(), 'claude-writer-')); directories.push(directory); return directory; };
afterEach(() => { vi.restoreAllMocks(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('Claude cross-pairing writer locks', () => {
  it('rejects a live competing writer and never removes a replacement on old-owner cleanup', () => {
    const dir = fixture(); const first = new ClaudeOwnerLock(dir);
    expect(() => new ClaudeOwnerLock(dir)).toThrow('already has');
    first.close(); const second = new ClaudeOwnerLock(dir); const path = join(dir, 'owner.lock');
    const replacement = readFileSync(path, 'utf8'); first.close();
    expect(readFileSync(path, 'utf8')).toBe(replacement); second.close();
  });
  it('recovers only a confirmed dead process, retaining locks on unknown process errors', () => {
    const dir = fixture(); const path = join(dir, 'owner.lock');
    writeFileSync(path, JSON.stringify({ pid: 123456789, nonce: 'old' }));
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('unknown'), { code: 'EPERM' }); });
    expect(() => new ClaudeOwnerLock(dir)).toThrow();
    expect(JSON.parse(readFileSync(path, 'utf8')).nonce).toBe('old');
    kill.mockImplementation(() => { throw Object.assign(new Error('dead'), { code: 'ESRCH' }); });
    const recovered = new ClaudeOwnerLock(dir);
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(process.pid); recovered.close();
  });
  it('does not replace malformed evidence or another recovery in progress', () => {
    const dir = fixture(); const path = join(dir, 'owner.lock'); writeFileSync(path, '{broken');
    expect(() => new ClaudeOwnerLock(dir)).toThrow('Invalid'); expect(readFileSync(path, 'utf8')).toBe('{broken');
    writeFileSync(join(dir, 'owner-recovery.lock'), 'pending');
    expect(() => new ClaudeOwnerLock(dir)).toThrow('recovery'); expect(readFileSync(path, 'utf8')).toBe('{broken');
  });
});
