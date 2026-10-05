import type { ChatGeometryQaApi } from './chatGeometryQa';
import { validViewportQaEvent } from './chatViewportQa';
import { sanitizeNativeViewportQa } from './chatNativeViewportQa';

const INTERVAL_MS = 10_000;
const LIFETIME_MS = 20 * 60_000;
const MAX_WRITES = 122;
const MAX_BYTES = 256 * 1024;
const MAX_NUMBER = 100_000_000;
type Snapshot = ReturnType<ChatGeometryQaApi['read']> | Awaited<ReturnType<NonNullable<ChatGeometryQaApi['readForCache']>>>;
export type QaCacheGate = { used: boolean; busy: boolean; starting: boolean; blocked: boolean };

function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function number(value: unknown, min = 0, max = MAX_NUMBER, integer = false): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    && (!integer || Number.isInteger(value));
}
const nullable = (value: unknown, min = 0, integer = false) => value === null || number(value, min, MAX_NUMBER, integer);
const SAMPLE_KEYS = ['elapsedMs', 'rawAvailable', 'rawSequence', 'rawAgeMs', 'rawEvent', 'rawOffset',
  'rawContentHeight', 'rawViewportHeight', 'sdkAvailable', 'sdkOffset', 'sdkHeaderOffset', 'sdkContentHeight',
  'sdkViewportHeight', 'visibleStart', 'visibleEnd', 'rowCount', 'dataRevision', 'jsOffset', 'jsContentHeight',
  'jsViewportHeight', 'readerScrolling', 'bottomFollowing', 'historyPaging', 'layouts'];

/** Reject corrupt snapshots before serializing; arbitrary fields never reach disk. */
export function encodeQaGeometryCache(value: unknown): string | null {
  try {
    const version = value !== null && typeof value === 'object' ? (value as Record<string, unknown>).version : null;
    if (!keys(value, ['version', 'status', 'reason', 'inFlight', 'elapsedMs', 'dropped', 'samples',
      ...(version === 2 || version === 3 ? ['viewport'] : []), ...(version === 3 ? ['nativeViewport'] : [])])
      || !(version === 1 || version === 2 || version === 3) || !['idle', 'capturing', 'stopped'].includes(value.status as string)
      || !(value.reason === null || ['manual', 'background', 'scope', 'expired', 'unavailable', 'replaced'].includes(value.reason as string))
      || typeof value.inFlight !== 'boolean' || !number(value.elapsedMs, 0, LIFETIME_MS)
      || !number(value.dropped, 0, MAX_NUMBER, true) || !Array.isArray(value.samples) || value.samples.length > 256) return null;
    const samples = [];
    for (const sample of value.samples) {
      if (!keys(sample, SAMPLE_KEYS) || !number(sample.elapsedMs, 0, LIFETIME_MS)
        || !['rawAvailable', 'sdkAvailable', 'readerScrolling', 'bottomFollowing', 'historyPaging'].every(key => typeof sample[key] === 'boolean')
        || !['none', 'scroll', 'drag_begin', 'drag_end', 'momentum_begin', 'momentum_end'].includes(sample.rawEvent as string)
        || !['rawSequence', 'visibleStart', 'visibleEnd', 'rowCount', 'dataRevision'].every(key => nullable(sample[key], 0, true))
        || !['rawAgeMs', 'rawContentHeight', 'rawViewportHeight', 'sdkContentHeight', 'sdkViewportHeight', 'jsContentHeight', 'jsViewportHeight'].every(key => nullable(sample[key]))
        || !['rawOffset', 'sdkOffset', 'sdkHeaderOffset', 'jsOffset'].every(key => nullable(sample[key], -MAX_NUMBER))
        || !Array.isArray(sample.layouts) || sample.layouts.length > 4) return null;
      const layouts = [];
      for (const layout of sample.layouts) {
        if (!keys(layout, ['index', 'y', 'height']) || !number(layout.index, 0, MAX_NUMBER, true)
          || !nullable(layout.y, -MAX_NUMBER) || !nullable(layout.height)) return null;
        layouts.push({ index: layout.index, y: layout.y, height: layout.height });
      }
      samples.push({ ...Object.fromEntries(SAMPLE_KEYS.filter(key => key !== 'layouts').map(key => [key, sample[key]])), layouts });
    }
    let viewport;
    if (version === 2 || version === 3) {
      const stage = value.viewport;
      if (!keys(stage, ['sequence', 'dropped', 'throttled', 'rejected', 'initialIncomplete', 'events'])
        || stage.initialIncomplete !== true || !['sequence', 'dropped', 'throttled', 'rejected'].every(key => number(stage[key], 0, MAX_NUMBER, true))
        || !Array.isArray(stage.events) || stage.events.length > 32
        || stage.sequence !== (stage.dropped as number) + (stage.throttled as number) + (stage.rejected as number) + stage.events.length) return null;
      let previousSequence = 0, previousElapsed = 0;
      const lastSequence = stage.sequence as number;
      const elapsedMs = value.elapsedMs as number;
      const events = [];
      for (const event of stage.events) {
        if (!validViewportQaEvent(event) || event.sequence <= previousSequence || event.sequence > lastSequence
          || event.elapsedMs < previousElapsed || event.elapsedMs > elapsedMs) return null;
        previousSequence = event.sequence; previousElapsed = event.elapsedMs;
        events.push({ ...event });
      }
      viewport = { sequence: stage.sequence, dropped: stage.dropped, throttled: stage.throttled,
        rejected: stage.rejected, initialIncomplete: true, events };
    }
    const nativeViewport = version === 3 ? sanitizeNativeViewportQa(value.nativeViewport) : null;
    if (version === 3 && nativeViewport === null) return null;
    const json = JSON.stringify({ version, status: value.status, reason: value.reason, inFlight: value.inFlight,
      elapsedMs: value.elapsedMs, dropped: value.dropped, samples, ...(viewport ? { viewport } : {}),
      ...(nativeViewport ? { nativeViewport } : {}) });
    // Allowed fields contain only ASCII enum/field names and JSON scalar syntax.
    return json.length <= MAX_BYTES ? json : null;
  } catch { return null; }
}

/** Reads the existing memory ring only. A pending file write is never retried or overlapped. */
export function createQaGeometryCache(options: Readonly<{
  api: ChatGeometryQaApi;
  gate: QaCacheGate;
  replace: (json: string) => Promise<void>;
  now?: () => number;
}>) {
  const now = options.now ?? (() => performance.now());
  let active = false;
  let writes = 0;
  let deadline = 0;
  let finalRequested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastClock = 0;
  const clock = () => {
    try {
      const value = now();
      if (!number(value, lastClock, Number.MAX_SAFE_INTEGER - LIFETIME_MS)) return null;
      lastClock = value;
      return value;
    } catch { return null; }
  };
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const stopApi = () => { try { options.api.stop(); } catch { options.gate.blocked = true; } };
  const retire = () => { if (active) stopApi(); active = false; clearTimer(); };
  const flush = async () => {
    if (!active || options.gate.busy) return;
    const time = clock();
    if (time === null || writes >= MAX_WRITES || time > deadline) { retire(); return; }
    if (time === deadline) stopApi();
    let snapshot: Snapshot;
    let json: string | null;
    // Include the optional async memory-ring copy in the existing shared one-flight gate.
    options.gate.busy = true;
    try {
      snapshot = options.api.readForCache ? await options.api.readForCache() : options.api.read();
      if (!active) return;
      const readyAt = clock();
      if (readyAt === null || readyAt > deadline) { retire(); return; }
      json = encodeQaGeometryCache(snapshot);
      if (json === null) { retire(); return; }
      writes += 1;
      await options.replace(json);
    }
    catch { retire(); return; }
    finally { options.gate.busy = false; }
    if (!active) return;
    const completedAt = clock();
    if (completedAt === null || snapshot.status !== 'capturing' || writes >= MAX_WRITES || completedAt >= deadline) { retire(); return; }
    if (finalRequested) { finalRequested = false; void flush(); return; }
    timer = setTimeout(() => { timer = null; void flush(); }, Math.min(INTERVAL_MS, deadline - completedAt));
  };
  return {
    start: (): 'started' | 'unavailable' => {
      const gate = options.gate;
      if (gate.used || gate.busy || gate.starting || gate.blocked) return 'unavailable';
      const time = clock();
      if (time === null) return 'unavailable';
      gate.starting = true;
      let result: ReturnType<ChatGeometryQaApi['start']>;
      try { result = options.api.start(); }
      catch { gate.blocked = true; stopApi(); return 'unavailable'; }
      finally { gate.starting = false; }
      // A known refusal consumes no arm; an unknown exception is blocked separately.
      if (result !== 'started') {
        if (result !== 'unavailable' && result !== 'already_active') { gate.blocked = true; stopApi(); }
        return 'unavailable';
      }
      gate.used = true;
      active = true;
      deadline = time + LIFETIME_MS;
      void flush();
      return 'started';
    },
    stop: () => {
      if (!active) return;
      stopApi(); clearTimer(); finalRequested = true;
      if (!options.gate.busy) { finalRequested = false; void flush(); }
    },
    retire,
  };
}
