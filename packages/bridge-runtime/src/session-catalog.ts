import { randomBytes } from 'node:crypto';
import type { SessionCatalogSyncRequest, SessionCatalogSyncResponse, SessionDescriptor } from '@clawket/agent-protocol';

export const SESSION_CATALOG_PAGE_BYTES = 64 * 1024;
export const SESSION_CATALOG_MAX_BYTES = 8 * 1024 * 1024;
export const SESSION_CATALOG_MAX_ROWS = 10_000;
const TOKEN = /^[a-f0-9]{32}$/;
type Row = { key: string; json: string; bytes: number };
type Snapshot = { revision: string; rows: Row[]; byKey: Map<string, Row>; bytes: number };

function invalid(): never { throw new Error('Invalid conversation catalog request'); }
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function request(value: unknown): SessionCatalogSyncRequest {
  if (!object(value) || Object.keys(value).some(key => key !== 'base' && key !== 'page')) invalid();
  if (value.base !== undefined && value.page !== undefined) invalid();
  const ref = value.page !== undefined ? value.page : value.base;
  if (ref === undefined) return {};
  if (!object(ref) || typeof ref.epoch !== 'string' || !TOKEN.test(ref.epoch)
    || typeof ref.revision !== 'string' || !TOKEN.test(ref.revision)
    || Object.keys(ref).some(key => !['epoch', 'revision', ...(value.page !== undefined ? ['offset'] : [])].includes(key))) invalid();
  if (value.page !== undefined) {
    if (!Number.isInteger(ref.offset) || (ref.offset as number) < 0 || (ref.offset as number) > SESSION_CATALOG_MAX_ROWS) invalid();
    return { page: { epoch: ref.epoch, revision: ref.revision, offset: ref.offset as number } };
  }
  return { base: { epoch: ref.epoch, revision: ref.revision } };
}

function canonical(value: unknown, depth = 0): unknown {
  if (depth > 24) throw new Error('Conversation catalog is too complex');
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  return value;
}

/** One authenticated service/scope. No per-peer state, transcript storage or native writes. */
export class SessionCatalogSync {
  private readonly epoch = randomBytes(16).toString('hex');
  private readonly snapshots = new Map<string, Snapshot>();
  private current?: Snapshot;
  private refreshing?: Promise<Snapshot>;
  private generation = 0;

  constructor(private readonly load: () => Promise<SessionDescriptor[]> | SessionDescriptor[]) {}

  /** Preserve a known Pi row only when its enumerated native file is temporarily unreadable. */
  cachedRows(): SessionDescriptor[] { return this.current?.rows.map(row => JSON.parse(row.json)) ?? []; }

  /** A successful management write fences scans begun before its acknowledgement. */
  invalidate(): void { this.generation++; this.refreshing = undefined; }

  async reply(params: unknown): Promise<SessionCatalogSyncResponse> {
    const input = request(params);
    if (input.page) {
      const snapshot = input.page.epoch === this.epoch ? this.snapshots.get(input.page.revision) : undefined;
      return snapshot ? this.page(snapshot, input.page.offset) : { kind: 'expired', epoch: this.epoch };
    }
    const snapshot = await this.refresh();
    if (input.base?.epoch === this.epoch) {
      if (input.base.revision === snapshot.revision) return { kind: 'unchanged', epoch: this.epoch, revision: snapshot.revision };
      const before = this.snapshots.get(input.base.revision);
      if (before) {
        const delta: SessionCatalogSyncResponse = {
          kind: 'delta', epoch: this.epoch, baseRevision: before.revision, revision: snapshot.revision,
          upserts: snapshot.rows.filter(row => before.byKey.get(row.key)?.json !== row.json).map(row => JSON.parse(row.json)),
          removedKeys: before.rows.filter(row => !snapshot.byKey.has(row.key)).map(row => row.key),
          order: snapshot.rows.map(row => row.key),
        };
        const bytes = Buffer.byteLength(JSON.stringify(delta));
        if (bytes <= SESSION_CATALOG_PAGE_BYTES && bytes < snapshot.bytes) return delta;
      }
    }
    return this.page(snapshot, 0);
  }

  private refresh(retried = false): Promise<Snapshot> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    const newer = (): Promise<Snapshot> => {
      if (retried) throw new Error('Conversation catalog changed during refresh; try again');
      const retryGeneration = this.generation;
      return this.refresh(true).then(snapshot => {
        if (retryGeneration !== this.generation) throw new Error('Conversation catalog changed during refresh; try again');
        return snapshot;
      });
    };
    const work = Promise.resolve().then(() => this.load()).then(sessions => {
      if (generation !== this.generation) return newer();
      if (!Array.isArray(sessions) || sessions.length > SESSION_CATALOG_MAX_ROWS) throw new Error('Conversation catalog exceeds its size limit');
      const rows: Row[] = [], byKey = new Map<string, Row>();
      let bytes = 2;
      for (const session of sessions) {
        if (!object(session) || typeof session.key !== 'string' || !session.key || session.key.length > 1024 || byKey.has(session.key)) {
          throw new Error('Invalid conversation catalog');
        }
        let json: string;
        try { json = JSON.stringify(canonical(session)); } catch { throw new Error('Invalid conversation catalog'); }
        const row = { key: session.key, json, bytes: Buffer.byteLength(json) };
        // Leave room for the fixed page envelope, including maximum offsets.
        if (row.bytes > SESSION_CATALOG_PAGE_BYTES - 512) throw new Error('A conversation catalog entry exceeds its size limit');
        bytes += row.bytes + (rows.length ? 1 : 0);
        if (bytes > SESSION_CATALOG_MAX_BYTES) throw new Error('Conversation catalog exceeds its size limit');
        rows.push(row); byKey.set(row.key, row);
      }
      if (this.current?.rows.length === rows.length && rows.every((row, index) => this.current!.rows[index].json === row.json)) return this.current;
      const snapshot = { revision: randomBytes(16).toString('hex'), rows, byKey, bytes };
      this.snapshots.set(snapshot.revision, snapshot);
      while (this.snapshots.size > 2) this.snapshots.delete(this.snapshots.keys().next().value!);
      this.current = snapshot;
      return snapshot;
    }, () => {
      if (generation !== this.generation) return newer();
      throw new Error('Conversation catalog could not be refreshed completely');
    });
    this.refreshing = work;
    void work.finally(() => { if (this.refreshing === work) this.refreshing = undefined; }).catch(() => {});
    return work;
  }

  private page(snapshot: Snapshot, offset: number): SessionCatalogSyncResponse {
    if (offset > 0 && offset >= snapshot.rows.length) invalid();
    const response: Extract<SessionCatalogSyncResponse, { kind: 'full' }> = {
      kind: 'full', epoch: this.epoch, revision: snapshot.revision,
      offset, total: snapshot.rows.length, sessions: [], nextOffset: SESSION_CATALOG_MAX_ROWS,
    };
    let bytes = Buffer.byteLength(JSON.stringify(response));
    let end = offset;
    while (end < snapshot.rows.length) {
      const row = snapshot.rows[end];
      const extra = row.bytes + (response.sessions.length ? 1 : 0);
      if (bytes + extra > SESSION_CATALOG_PAGE_BYTES) break;
      bytes += extra; response.sessions.push(JSON.parse(row.json)); end++;
    }
    response.nextOffset = end < snapshot.rows.length ? end : null;
    return response;
  }
}
