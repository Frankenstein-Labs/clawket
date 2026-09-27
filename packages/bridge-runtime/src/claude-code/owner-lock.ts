import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeFault } from './errors.js';

/** Shared by pairing metadata and native-session writers; never expires a live owner. */
export class ClaudeOwnerLock {
  private readonly lockPath: string;
  private readonly owner = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new ClaudeFault('Invalid Claude owner directory');
    this.lockPath = join(directory, 'owner.lock');
    this.acquire();
  }
  private acquire(): void {
    try { writeFileSync(this.lockPath, this.owner, { flag: 'wx', mode: 0o600 }); return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new ClaudeFault('Cannot create Claude owner lock'); }
    // Two contenders must not both decide the same old lock is stale and unlink a replacement.
    const recoveryPath = join(this.directory, 'owner-recovery.lock');
    try { writeFileSync(recoveryPath, this.owner, { flag: 'wx', mode: 0o600 }); }
    catch { throw new ClaudeFault('Claude owner recovery is already in progress'); }
    try { this.recoverDeadOwner(); }
    finally {
      try { if (readFileSync(recoveryPath, 'utf8') === this.owner) unlinkSync(recoveryPath); } catch { /* Fail closed. */ }
    }
  }

  private recoverDeadOwner(): void {
    const stat = lstatSync(this.lockPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 || stat.nlink !== 1) throw new ClaudeFault('Invalid Claude owner lock');
    let prior: { pid: number };
    try { prior = JSON.parse(readFileSync(this.lockPath, 'utf8')); }
    catch { throw new ClaudeFault('Invalid Claude owner lock'); }
    if (!Number.isSafeInteger(prior?.pid) || prior.pid <= 0) throw new ClaudeFault('Invalid Claude owner process');
    try { process.kill(prior.pid, 0); throw new ClaudeFault('This Claude pairing already has a Bridge owner'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    // Compare the inode again before removing a confirmed dead owner's lock.
    const current = lstatSync(this.lockPath);
    if (current.ino !== stat.ino || current.dev !== stat.dev) throw new ClaudeFault('Claude owner changed during recovery');
    unlinkSync(this.lockPath);
    writeFileSync(this.lockPath, this.owner, { flag: 'wx', mode: 0o600 });
  }

  close(): void {
    try {
      if (readFileSync(this.lockPath, 'utf8') === this.owner) unlinkSync(this.lockPath);
    } catch { /* Never remove another owner's lock. */ }
  }
}
