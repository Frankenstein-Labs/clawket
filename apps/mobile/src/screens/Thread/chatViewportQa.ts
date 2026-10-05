/** Application observations, never native paint or an atomic viewport snapshot. */
export const VIEWPORT_QA_KINDS = ['layout_begin', 'layout_commit', 'list_load', 'content_size', 'viewport_layout', 'offset_command',
  'end_command', 'index_command', 'follow_glide', 'follow_snap', 'offset_ack', 'older_ack', 'clamp_ack',
  'reader_scroll', 'old_geometry', 'geometry_pending', 'drag_begin', 'cell_mount', 'cell_unmount'] as const;
type Kind = typeof VIEWPORT_QA_KINDS[number];
export const VIEWPORT_QA_NUMBERS = ['offset', 'contentHeight', 'viewportHeight', 'targetOffset',
  'anchorIndex', 'anchorY', 'commandSequence', 'rowCount', 'windowEpoch', 'mountedStart', 'mountedEnd', 'mountedCount',
  'maxOffset', 'drawDistance', 'layoutHeight', 'layoutViewportHeight'] as const;
type Numeric = typeof VIEWPORT_QA_NUMBERS[number];
export type ViewportQaInput = Readonly<{ kind: Kind; geometryPending?: boolean; mountedTruncated?: boolean }>
  & Partial<Record<Numeric, number | null>>;
/** Memory-only capture association; never serialized as an identity. */
export type ViewportQaObservation = Readonly<{ capture: object; sequence: number }>;
export type ViewportQaObserver = (value: ViewportQaInput, command?: ViewportQaObservation | null) => ViewportQaObservation | null;
export type ViewportQaEvent = { sequence: number; elapsedMs: number; kind: Kind; geometryPending: boolean | null;
  mountedTruncated: boolean } & Record<Numeric, number | null>;
export type ViewportQaSnapshot = { sequence: number; dropped: number; throttled: number; rejected: number;
  initialIncomplete: true; events: ViewportQaEvent[] };
const MAX = 100_000_000;
const INTEGER = ['anchorIndex', 'commandSequence', 'rowCount', 'windowEpoch', 'mountedStart', 'mountedEnd', 'mountedCount'];
const SIGNED = ['offset', 'targetOffset', 'anchorY'];

/** Same validator is used for event admission and the versioned disk encoder. */
export function validViewportQaEvent(value: unknown): value is ViewportQaEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = ['sequence', 'elapsedMs', 'kind', 'geometryPending', 'mountedTruncated', ...VIEWPORT_QA_NUMBERS];
  return Object.keys(event).length === keys.length && keys.every(key => Object.hasOwn(event, key))
    && typeof event.sequence === 'number' && Number.isInteger(event.sequence) && event.sequence > 0 && event.sequence <= MAX
    && typeof event.elapsedMs === 'number' && Number.isFinite(event.elapsedMs) && event.elapsedMs >= 0 && event.elapsedMs <= 1_200_000
    && VIEWPORT_QA_KINDS.includes(event.kind as Kind)
    && (event.geometryPending === null || typeof event.geometryPending === 'boolean')
    && typeof event.mountedTruncated === 'boolean'
    && VIEWPORT_QA_NUMBERS.every(key => event[key] === null || (typeof event[key] === 'number'
      && Number.isFinite(event[key]) && (event[key] as number) >= (SIGNED.includes(key) ? -MAX : 0)
      && (event[key] as number) <= MAX && (!INTEGER.includes(key) || Number.isInteger(event[key]))))
    && (event.commandSequence === null || (event.commandSequence as number) < event.sequence)
    && (event.mountedStart === null && event.mountedEnd === null
      || typeof event.mountedStart === 'number' && typeof event.mountedEnd === 'number' && event.mountedStart <= event.mountedEnd);
}

export function createViewportQaRecorder() {
  let sequence = 0, dropped = 0, throttled = 0, rejected = 0, lastScroll = -Infinity, lastElapsed = 0;
  let events: ViewportQaEvent[] = [];
  return {
    reset: () => { sequence = dropped = throttled = rejected = lastElapsed = 0; lastScroll = -Infinity; events = []; },
    observe: (value: ViewportQaInput, elapsedMs: number): number | null => {
      if (sequence === MAX) return null;
      sequence += 1;
      const event = { sequence, elapsedMs, kind: value.kind, geometryPending: value.geometryPending ?? null,
        mountedTruncated: value.mountedTruncated ?? false,
        ...Object.fromEntries(VIEWPORT_QA_NUMBERS.map(key => [key, value[key] ?? null])) } as ViewportQaEvent;
      if (Object.keys(value).some(key => !['kind', 'geometryPending', 'mountedTruncated', ...VIEWPORT_QA_NUMBERS].includes(key))
        || !validViewportQaEvent(event) || elapsedMs < lastElapsed) { rejected += 1; return null; }
      lastElapsed = elapsedMs;
      // Only ordinary scroll traffic is sampled; command/ACK/layout/size stages are never throttled.
      if (event.kind === 'reader_scroll' && elapsedMs - lastScroll < 100) { throttled += 1; return null; }
      if (event.kind === 'reader_scroll') lastScroll = elapsedMs;
      if (events.length === 32) { events.shift(); dropped += 1; }
      events.push(event);
      return sequence;
    },
    read: (): ViewportQaSnapshot => ({ sequence, dropped, throttled, rejected, initialIncomplete: true,
      events: events.map(event => ({ ...event })) }),
  };
}
