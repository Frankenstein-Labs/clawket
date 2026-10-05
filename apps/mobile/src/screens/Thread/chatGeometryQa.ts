import { createViewportQaRecorder, type ViewportQaInput, type ViewportQaSnapshot, type ViewportQaObservation } from './chatViewportQa';
/** Local, opt-in QA evidence. Never contains transcript or transport identities. */
const INTERVAL_MS = 1_000;
const LIFETIME_MS = 20 * 60_000;
const CAPACITY = 256;
const MAX_NUMBER = 100_000_000;

type StopReason = 'manual' | 'background' | 'scope' | 'expired' | 'unavailable' | 'replaced';
type RawEvent = 'none' | 'scroll' | 'drag_begin' | 'drag_end' | 'momentum_begin' | 'momentum_end';
type QueryGate = { busy: boolean; request: number };
type LayoutSample = { index: number; y: number | null; height: number | null };
type Sample = {
  elapsedMs: number;
  rawAvailable: boolean;
  rawSequence: number | null;
  rawAgeMs: number | null;
  rawEvent: RawEvent;
  rawOffset: number | null;
  rawContentHeight: number | null;
  rawViewportHeight: number | null;
  sdkAvailable: boolean;
  sdkOffset: number | null;
  sdkHeaderOffset: number | null;
  sdkContentHeight: number | null;
  sdkViewportHeight: number | null;
  visibleStart: number | null;
  visibleEnd: number | null;
  rowCount: number | null;
  dataRevision: number | null;
  jsOffset: number | null;
  jsContentHeight: number | null;
  jsViewportHeight: number | null;
  readerScrolling: boolean;
  bottomFollowing: boolean;
  historyPaging: boolean;
  layouts: LayoutSample[];
};

export type ChatGeometryQaSource = Readonly<{
  isCurrent: () => boolean;
  enableRaw: (enabled: boolean) => void;
  readRaw: (receive: (value: unknown) => void) => void;
  readSdk: () => unknown;
}>;
type GeometrySnapshot = {
  version: 1; status: 'idle' | 'capturing' | 'stopped'; reason: StopReason | null;
  inFlight: boolean; elapsedMs: number; dropped: number; samples: Sample[];
};
export type ChatGeometryQaApi = Readonly<{
  start: () => 'started' | 'already_active' | 'unavailable';
  stop: () => void;
  read: () => GeometrySnapshot | (Omit<GeometrySnapshot, 'version'> & { version: 2; viewport: ViewportQaSnapshot });
}>;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function number(value: unknown, min = 0, integer = false): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= MAX_NUMBER
    && (!integer || Number.isInteger(value)) ? value : null;
}
function sanitize(rawValue: unknown, sdkValue: unknown, elapsedMs: number): Sample {
  const raw = object(rawValue);
  const sdk = object(sdkValue);
  const event = raw.event;
  const rawEvent: RawEvent = event === 'scroll' || event === 'drag_begin' || event === 'drag_end'
    || event === 'momentum_begin' || event === 'momentum_end' ? event : 'none';
  return {
    elapsedMs,
    rawAvailable: raw.available === true,
    rawSequence: number(raw.sequence, 0, true),
    rawAgeMs: number(raw.ageMs),
    rawEvent,
    rawOffset: number(raw.offset, -MAX_NUMBER),
    rawContentHeight: number(raw.contentHeight),
    rawViewportHeight: number(raw.viewportHeight),
    sdkAvailable: sdk.available === true,
    sdkOffset: number(sdk.offset, -MAX_NUMBER),
    sdkHeaderOffset: number(sdk.headerOffset, -MAX_NUMBER),
    sdkContentHeight: number(sdk.contentHeight),
    sdkViewportHeight: number(sdk.viewportHeight),
    visibleStart: number(sdk.visibleStart, 0, true),
    visibleEnd: number(sdk.visibleEnd, 0, true),
    rowCount: number(sdk.rowCount, 0, true),
    dataRevision: number(sdk.dataRevision, 0, true),
    jsOffset: number(sdk.jsOffset, -MAX_NUMBER),
    jsContentHeight: number(sdk.jsContentHeight),
    jsViewportHeight: number(sdk.jsViewportHeight),
    readerScrolling: sdk.readerScrolling === true,
    bottomFollowing: sdk.bottomFollowing === true,
    historyPaging: sdk.historyPaging === true,
    layouts: Array.isArray(sdk.layouts) ? sdk.layouts.slice(0, 4).flatMap(value => {
      const layout = object(value);
      const index = number(layout.index, 0, true);
      return index === null ? [] : [{ index, y: number(layout.y, -MAX_NUMBER), height: number(layout.height) }];
    }) : [],
  };
}

/** Owns at most one UI query. A stalled query is never retried or overlapped. */
export function createChatGeometryQa(enabled: boolean, now: () => number = () => performance.now(),
  queryGate: QueryGate = { busy: false, request: 0 }) {
  let open: (() => ChatGeometryQaSource | null) | null = null;
  let source: ChatGeometryQaSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let endedAt = 0;
  let generation = 0;
  let pendingRequest: number | null = null;
  let status: 'idle' | 'capturing' | 'stopped' = 'idle';
  let reason: StopReason | null = null;
  let dropped = 0;
  let samples: Sample[] = [];
  const viewport = createViewportQaRecorder();
  let viewportCapture = {};
  const elapsed = () => Math.min(LIFETIME_MS, Math.max(0, (status === 'capturing' ? now() : endedAt) - startedAt));
  const stop = (why: StopReason) => {
    if (status !== 'capturing') return;
    endedAt = now();
    status = 'stopped';
    reason = why;
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
    timer = deadlineTimer = null;
    const previous = source;
    source = null;
    try { previous?.enableRaw(false); } catch { /* QA cannot change application behavior. */ }
  };
  const current = (captured: ChatGeometryQaSource) => {
    if (source !== captured || status !== 'capturing') return false;
    if (elapsed() >= LIFETIME_MS) { stop('expired'); return false; }
    try {
      if (captured.isCurrent()) return true;
    } catch { /* Fixed category only; no exception text. */ }
    stop('scope');
    return false;
  };
  const sample = () => {
    const captured = source;
    if (!captured || queryGate.busy || !current(captured)) return;
    const requestGeneration = ++generation;
    pendingRequest = requestGeneration;
    const query = ++queryGate.request;
    queryGate.busy = true;
    try {
      captured.readRaw(raw => {
        if (pendingRequest !== requestGeneration) return;
        if (queryGate.request === query) queryGate.busy = false;
        pendingRequest = null;
        if (requestGeneration !== generation) return;
        if (!current(captured)) return;
        try {
          const record = sanitize(raw, captured.readSdk(), elapsed());
          if (!current(captured)) return;
          if (samples.length === CAPACITY) { samples.shift(); dropped += 1; }
          samples.push(record);
          // Schedule after receipt, so delayed UI replies cannot form a burst.
          timer = setTimeout(sample, INTERVAL_MS);
        } catch { stop('unavailable'); }
      });
    } catch {
      if (queryGate.request === query) queryGate.busy = false;
      pendingRequest = null; stop('unavailable');
    }
  };
  const api: ChatGeometryQaApi = Object.freeze({
    start: () => {
      if (!enabled) return 'unavailable';
      if (source && current(source)) return 'already_active';
      if (queryGate.busy) return 'unavailable';
      let next: ChatGeometryQaSource | null;
      try { next = open?.() ?? null; } catch { return 'unavailable'; }
      if (!next) return 'unavailable';
      source = next;
      startedAt = now();
      status = 'capturing';
      reason = null;
      dropped = 0;
      samples = [];
      viewport.reset();
      viewportCapture = {};
      generation += 1;
      try { next.enableRaw(true); } catch { stop('unavailable'); return 'unavailable'; }
      deadlineTimer = setTimeout(() => stop('expired'), LIFETIME_MS);
      sample();
      return 'started';
    },
    stop: () => stop('manual'),
    read: () => {
      if (source) current(source);
      return {
        version: 2 as const, status, reason, inFlight: queryGate.busy, elapsedMs: status === 'idle' ? 0 : elapsed(), dropped,
        samples: samples.map(record => ({ ...record, layouts: record.layouts.map(layout => ({ ...layout })) })),
        viewport: viewport.read(),
      };
    },
  });
  return {
    api,
    queryGate,
    isRecording: (binding: () => ChatGeometryQaSource | null) => open === binding && source !== null && current(source),
    observe: (binding: () => ChatGeometryQaSource | null, value: ViewportQaInput, command?: ViewportQaObservation | null) => {
      if (open !== binding || !source || !current(source)) return null;
      try {
        const sequence = viewport.observe(command === undefined ? value : { ...value,
          commandSequence: command?.capture === viewportCapture ? command.sequence : null }, elapsed());
        return sequence === null ? null : { capture: viewportCapture, sequence };
      } catch { return null; }
    },
    attach: (next: () => ChatGeometryQaSource | null) => {
      if (!enabled) return () => undefined;
      if (open !== next) stop('replaced');
      open = next;
      return () => { if (open === next) { stop('scope'); open = null; } };
    },
    background: () => stop('background'),
  };
}
