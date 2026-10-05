/** Pure scalar schema; native events observe Android Views, never paint or command ACKs. */
export const NATIVE_VIEWPORT_PHASES = ['bind_snapshot', 'host_layout', 'child_layout', 'scroll', 'drag_begin',
  'drag_end', 'momentum_begin', 'momentum_end', 'mount_begin', 'mount_end'] as const;
export const NATIVE_VIEWPORT_REASONS = ['manual', 'background', 'activity', 'module', 'expired', 'unavailable', 'detached', 'replaced'] as const;
type Phase = typeof NATIVE_VIEWPORT_PHASES[number];
type Reason = typeof NATIVE_VIEWPORT_REASONS[number];
export type NativeViewportQaEvent = { sequence: number; elapsedMs: number; phase: Phase; batchSequence: number;
  inMountBatch: boolean; offsetPx: number; childWidthPx: number; childHeightPx: number;
  viewportWidthPx: number; viewportHeightPx: number; attached: boolean };
export type NativeViewportQaSnapshot = { clockBasis: 'android_uptime_capture_elapsed';
  status: 'capturing' | 'stopped' | 'unavailable'; reason: Reason | null; generation: number; density: number | null;
  elapsedMs: number; sequence: number; dropped: number; rejected: number; events: NativeViewportQaEvent[] };
const MAX = 100_000_000;
const EVENT_KEYS = ['sequence', 'elapsedMs', 'phase', 'batchSequence', 'inMountBatch', 'offsetPx', 'childWidthPx',
  'childHeightPx', 'viewportWidthPx', 'viewportHeightPx', 'attached'];
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function number(value: unknown, max = MAX, integer = true): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isInteger(value));
}
/** Reconstruct, rather than forwarding a native dictionary with arbitrary extra fields. */
export function sanitizeNativeViewportQa(value: unknown): NativeViewportQaSnapshot | null {
  try { return reconstructNativeViewportQa(value); } catch { return null; }
}

function reconstructNativeViewportQa(value: unknown): NativeViewportQaSnapshot | null {
  if (!keys(value, ['clockBasis', 'status', 'reason', 'generation', 'density', 'elapsedMs', 'sequence', 'dropped', 'rejected', 'events'])
    || value.clockBasis !== 'android_uptime_capture_elapsed'
    || !['capturing', 'stopped', 'unavailable'].includes(value.status as string)
    || !(value.reason === null || NATIVE_VIEWPORT_REASONS.includes(value.reason as Reason))
    || !number(value.generation) || value.generation === 0 || !number(value.elapsedMs, 1_200_000, false)
    || !(value.density === null && value.status === 'unavailable'
      || typeof value.density === 'number' && Number.isFinite(value.density) && value.density >= 0.1 && value.density <= 10)
    || !['sequence', 'dropped', 'rejected'].every(key => number(value[key]))
    || !Array.isArray(value.events) || value.events.length > 64
    || value.sequence !== (value.dropped as number) + (value.rejected as number) + value.events.length
    || (value.status === 'capturing' ? value.reason !== null : value.reason === null)
    || (value.status === 'unavailable' && (value.sequence !== 0 || value.events.length !== 0))) return null;
  const events: NativeViewportQaEvent[] = [];
  let lastSequence = 0, lastElapsed = 0, lastBatch = 0;
  for (const event of value.events) {
    if (!keys(event, EVENT_KEYS) || !number(event.sequence) || event.sequence <= lastSequence || event.sequence > (value.sequence as number)
      || !number(event.elapsedMs, value.elapsedMs as number, false) || event.elapsedMs < lastElapsed
      || !number(event.batchSequence) || event.batchSequence < lastBatch
      || !NATIVE_VIEWPORT_PHASES.includes(event.phase as Phase)
      || !(typeof event.offsetPx === 'number' && Number.isInteger(event.offsetPx) && Math.abs(event.offsetPx) <= MAX)
      || !['childWidthPx', 'childHeightPx', 'viewportWidthPx', 'viewportHeightPx'].every(key => number(event[key]))
      || typeof event.inMountBatch !== 'boolean' || typeof event.attached !== 'boolean') return null;
    lastSequence = event.sequence; lastElapsed = event.elapsedMs; lastBatch = event.batchSequence;
    events.push(Object.fromEntries(EVENT_KEYS.map(key => [key, event[key]])) as NativeViewportQaEvent);
  }
  return { clockBasis: value.clockBasis, status: value.status as NativeViewportQaSnapshot['status'], reason: value.reason as Reason | null,
    generation: value.generation, density: value.density as number | null, elapsedMs: value.elapsedMs, sequence: value.sequence as number,
    dropped: value.dropped as number, rejected: value.rejected as number, events };
}

export function unavailableNativeViewportQa(generation: number): NativeViewportQaSnapshot {
  return { clockBasis: 'android_uptime_capture_elapsed', status: 'unavailable', reason: 'unavailable',
    generation, density: null, elapsedMs: 0, sequence: 0, dropped: 0, rejected: 0, events: [] };
}
