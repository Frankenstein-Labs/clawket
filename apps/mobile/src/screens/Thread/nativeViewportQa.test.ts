jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock('react-native', () => ({ findNodeHandle: jest.fn(() => 421) }));
import { findNodeHandle } from 'react-native';
import { createNativeViewportQaSession } from './nativeViewportQa';
import { createChatGeometryQa } from './chatGeometryQa';
import { createQaGeometryCache, encodeQaGeometryCache } from './chatGeometryQaCache';
import { sanitizeNativeViewportQa, unavailableNativeViewportQa } from './chatNativeViewportQa';

const SHARED = Symbol.for('clawket.nativeViewportQa.generation');
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
function snapshot(generation = 1) {
  return { clockBasis: 'android_uptime_capture_elapsed', status: 'capturing', reason: null, generation, density: 2.75,
    elapsedMs: 20, sequence: 1, dropped: 0, rejected: 0, events: [{ sequence: 1, elapsedMs: 10,
      phase: 'child_layout', batchSequence: 2, inMountBatch: true, offsetPx: 116,
      childWidthPx: 1080, childHeightPx: 17000, viewportWidthPx: 1080, viewportHeightPx: 1800, attached: true }] };
}
function fixture() {
  let current = true, enabled = true;
  const native = { startAsync: jest.fn(async () => 'started'), stopAsync: jest.fn(async (_generation: number) => undefined),
    readAsync: jest.fn(async (generation: number): Promise<unknown> => snapshot(generation)) };
  const load = jest.fn(() => native);
  const ref = jest.fn(() => ({} as Parameters<typeof findNodeHandle>[0]));
  const session = createNativeViewportQaSession({ current: () => current, enabled: () => enabled, nativeRef: ref }, load);
  return { session, native, load, ref, retire: () => { current = false; }, disable: () => { enabled = false; } };
}
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); Reflect.deleteProperty(globalThis, SHARED); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); Reflect.deleteProperty(globalThis, SHARED); });

test('registration is inert; missing native module preserves exact V2 acceptance and cache', async () => {
  const load = jest.fn(() => null);
  const nativeViewport = createNativeViewportQaSession({ current: () => true, enabled: () => true, nativeRef: () => null }, load);
  const c = createChatGeometryQa(true, () => 0);
  c.attach(() => ({ isCurrent: () => true, enableRaw: jest.fn(), readRaw: reply => reply({}), readSdk: () => ({}), nativeViewport }));
  expect(load).not.toHaveBeenCalled();
  expect(c.api.start()).toBe('started');
  expect(load).toHaveBeenCalledTimes(1);
  expect(c.api.readForCache).toBeUndefined();
  expect(JSON.parse(encodeQaGeometryCache(c.api.read())!)).toMatchObject({ version: 2, status: 'capturing' });
  expect(findNodeHandle).not.toHaveBeenCalled();
  c.api.stop();
});

test('actual collector waits for accepted native binding then writes V3 through the existing cache one-flight gate', async () => {
  const f = fixture(); let accept!: (value: string) => void;
  f.native.startAsync.mockImplementationOnce(() => new Promise(resolve => { accept = resolve; }));
  const c = createChatGeometryQa(true, () => 0);
  c.attach(() => ({ isCurrent: () => true, enableRaw: jest.fn(), readRaw: reply => reply({}), readSdk: () => ({}), nativeViewport: f.session }));
  const replace = jest.fn(async (_json: string) => undefined);
  const gate = { used: false, busy: false, starting: false, blocked: false };
  const sink = createQaGeometryCache({ api: c.api, gate, replace, now: () => 0 });
  expect(sink.start()).toBe('started'); expect(gate.busy).toBe(true);
  expect(replace).not.toHaveBeenCalled(); expect(f.native.readAsync).not.toHaveBeenCalled();
  expect(sink.start()).toBe('unavailable');
  accept('started'); await settle();
  expect(f.native.startAsync).toHaveBeenCalledWith(421, 1, true);
  expect(f.native.readAsync).toHaveBeenCalledTimes(1);
  expect(JSON.parse(replace.mock.calls[0]![0])).toMatchObject({ version: 3,
    nativeViewport: { clockBasis: 'android_uptime_capture_elapsed', density: 2.75, events: [{ offsetPx: 116 }] } });
  c.api.stop(); sink.retire();
});

test('scope retirement during deferred bind stops that generation and never rearms', async () => {
  const f = fixture(); let accept!: (value: string) => void; let nativeCapturing = false;
  f.native.startAsync.mockImplementationOnce(() => new Promise(resolve => { accept = resolve; }));
  f.native.stopAsync.mockImplementation(async () => { nativeCapturing = false; });
  f.session.start(); f.retire(); f.session.stop();
  expect(f.native.stopAsync).toHaveBeenCalledTimes(1);
  nativeCapturing = true; accept('started'); await settle();
  expect(nativeCapturing).toBe(false);
  expect(f.native.stopAsync).toHaveBeenCalledTimes(2);
  expect(f.native.stopAsync.mock.calls.every(([generation]) => generation === 1)).toBe(true);
  f.session.start(); expect(f.native.startAsync).toHaveBeenCalledTimes(1);
  expect(await f.session.read()).toMatchObject({ status: 'unavailable', events: [] });
});

test('old stop uses its own generation, even after a new bridge session has started', async () => {
  const first = fixture(), next = fixture(); first.session.start(); await settle(); next.session.start(); await settle();
  first.session.stop(); await settle();
  expect(first.native.stopAsync).toHaveBeenLastCalledWith(1);
  expect(next.native.startAsync).toHaveBeenLastCalledWith(421, 2, true);
  expect(next.native.stopAsync).not.toHaveBeenCalled();
});

test.each(['refusal', 'bind_throw', 'read_throw', 'bad_generation', 'extra_field', 'late_read'] as const)(
  'unknown/refused native %s never claims a capture or forwards its error', async reason => {
    const f = fixture();
    if (reason === 'refusal') f.native.startAsync.mockResolvedValueOnce('unavailable');
    if (reason === 'bind_throw') f.native.startAsync.mockRejectedValueOnce(new Error('PRIVATE'));
    if (reason === 'read_throw') f.native.readAsync.mockRejectedValueOnce(new Error('PRIVATE'));
    if (reason === 'bad_generation') f.native.readAsync.mockResolvedValueOnce(snapshot(99));
    if (reason === 'extra_field') f.native.readAsync.mockResolvedValueOnce({ ...snapshot(), PRIVATE: 'PRIVATE' });
    let reply!: (value: ReturnType<typeof snapshot>) => void;
    if (reason === 'late_read') f.native.readAsync.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    f.session.start(); await settle();
    const result = f.session.read(); await settle();
    if (reason === 'late_read') { f.retire(); f.session.stop(); reply(snapshot()); }
    const output = await result;
    expect(output).toMatchObject({ status: 'unavailable', reason: 'unavailable', sequence: 0, events: [] });
    expect(JSON.stringify(output)).not.toContain('PRIVATE');
  });

test('parallel ring-copy callers share one native request; Stop does not launch a second read', async () => {
  const f = fixture(); let reply!: (value: ReturnType<typeof snapshot>) => void;
  f.native.readAsync.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  f.session.start(); await settle();
  const one = f.session.read(), two = f.session.read(); expect(one).toBe(two); await settle();
  f.session.stop(); reply(snapshot()); await one;
  expect(f.native.readAsync).toHaveBeenCalledTimes(1);
});

test('a stopped native ring remains readable without resolving or querying the host again', async () => {
  const f = fixture(); f.session.start(); await settle();
  f.native.readAsync.mockResolvedValueOnce({ ...snapshot(), status: 'stopped', reason: 'manual' });
  f.session.stop();
  expect(await f.session.read()).toMatchObject({ status: 'stopped', reason: 'manual', events: [{ childHeightPx: 17000 }] });
  expect(f.ref).toHaveBeenCalledTimes(1);
  expect(findNodeHandle).toHaveBeenCalledTimes(1);
  expect(f.native.startAsync).toHaveBeenCalledTimes(1);
});

test('strict reconstruction rejects a throwing dictionary without exposing its exception', () => {
  const corrupt = { ...snapshot(), get events() { throw new Error('PRIVATE'); } };
  expect(sanitizeNativeViewportQa(corrupt)).toBeNull();
});

test('retained native loss is explicit; unordered or over-capacity tails fail closed', () => {
  const value = { ...snapshot(), elapsedMs: 100, sequence: 80, dropped: 16,
    events: Array.from({ length: 64 }, (_, index) => ({ ...snapshot().events[0]!, sequence: index + 17, elapsedMs: index + 17 })) };
  expect(sanitizeNativeViewportQa(value)).toMatchObject({ sequence: 80, dropped: 16, events: expect.any(Array) });
  expect(sanitizeNativeViewportQa({ ...value, events: [...value.events].reverse() })).toBeNull();
  expect(sanitizeNativeViewportQa({ ...value, sequence: 81, events: [...value.events, { ...value.events[63]!, sequence: 81 }] })).toBeNull();
});

test.each(['clock', 'density', 'sequence', 'count', 'phase', 'tag', 'time', 'units'] as const)('V3 rejects corrupt %s and keeps V1/V2 compatibility', reason => {
  const c = createChatGeometryQa(true); const v2 = c.api.read();
  const native = snapshot();
  if (reason === 'clock') native.clockBasis = 'js_performance_now';
  if (reason === 'density') native.density = NaN;
  if (reason === 'sequence') native.events[0]!.sequence = 2;
  if (reason === 'count') native.dropped = 1;
  if (reason === 'phase') native.events[0]!.phase = 'paint';
  if (reason === 'tag') Object.assign(native.events[0]!, { tag: 421 });
  if (reason === 'time') native.events[0]!.elapsedMs = 21;
  if (reason === 'units') Object.assign(native.events[0]!, { offset: 116 });
  expect(sanitizeNativeViewportQa(native)).toBeNull();
  expect(encodeQaGeometryCache({ ...v2, version: 3, nativeViewport: native })).toBeNull();
  expect(encodeQaGeometryCache(v2)).not.toBeNull();
  const { viewport: _viewport, ...v1 } = v2 as Extract<typeof v2, { version: 2 }>;
  expect(encodeQaGeometryCache({ ...v1, version: 1 })).not.toBeNull();
  expect(encodeQaGeometryCache({ ...v2, version: 3, nativeViewport: unavailableNativeViewportQa(1) })).not.toBeNull();
});
