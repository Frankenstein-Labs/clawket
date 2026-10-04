import { createChatGeometryQa } from './chatGeometryQa';
import { createQaGeometryCache, encodeQaGeometryCache, type QaCacheGate } from './chatGeometryQaCache';

const gate = (): QaCacheGate => ({ used: false, busy: false, starting: false, blocked: false });
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
function fixture() {
  let current = true;
  const collector = createChatGeometryQa(true, () => Date.now());
  const readRaw = jest.fn((receive: (value: unknown) => void) => receive({ available: true, sequence: 1, event: 'scroll', offset: 12 }));
  const readSdk = jest.fn(() => ({ available: true, rowCount: 3, offset: 12 }));
  const enableRaw = jest.fn();
  const source = { isCurrent: () => current, enableRaw, readRaw, readSdk };
  collector.attach(() => source);
  const shared = gate();
  const replace = jest.fn(async (_json: string): Promise<void> => undefined);
  const sink = createQaGeometryCache({ api: collector.api, gate: shared, replace, now: () => Date.now() });
  return { collector, sink, shared, replace, readRaw, readSdk, enableRaw, setCurrent: (value: boolean) => { current = value; } };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('known Start refusal consumes no arm; actual collector starts after a current source is attached', async () => {
  const collector = createChatGeometryQa(true, () => Date.now());
  const shared = gate(), replace = jest.fn(async (_json: string): Promise<void> => undefined);
  const sink = createQaGeometryCache({ api: collector.api, gate: shared, replace, now: () => Date.now() });
  expect(sink.start()).toBe('unavailable');
  expect(shared.used).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  collector.attach(() => ({ isCurrent: () => true, enableRaw: jest.fn(), readRaw: receive => receive({}), readSdk: () => ({}) }));
  expect(sink.start()).toBe('started');
  await settle();
  expect(shared.used).toBe(true);
  expect(JSON.parse(replace.mock.calls[0][0]).samples).toHaveLength(1);
  sink.retire();
});

test('file snapshots do not cause additional raw/SDK queries and occur only every ten seconds', async () => {
  const f = fixture();
  expect(f.sink.start()).toBe('started'); await settle();
  expect(f.readRaw).toHaveBeenCalledTimes(1);
  expect(f.readSdk).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(9999); await settle();
  expect(f.replace).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1); await settle();
  expect(f.replace).toHaveBeenCalledTimes(2);
  expect(f.readRaw).toHaveBeenCalledTimes(11);
  expect(f.readSdk).toHaveBeenCalledTimes(11);
  f.sink.retire();
});

test('deferred file write stays single-flight; a new scope cannot restart capture or read new geometry', async () => {
  const f = fixture(); let finish!: () => void;
  f.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  f.sink.start(); jest.advanceTimersByTime(20_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(1);
  f.setCurrent(false); jest.advanceTimersByTime(1000); await settle();
  const newRaw = jest.fn();
  f.collector.attach(() => ({ isCurrent: () => true, enableRaw: jest.fn(), readRaw: newRaw, readSdk: () => ({}) }));
  expect(f.sink.start()).toBe('unavailable');
  finish(); await settle(); jest.advanceTimersByTime(10_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(2);
  expect(JSON.parse(f.replace.mock.calls[1][0]).status).toBe('stopped');
  expect(newRaw).not.toHaveBeenCalled();
});

test('background saves only the retired memory ring, with no further geometry query', async () => {
  const f = fixture(); f.sink.start(); await settle();
  f.collector.background(); const count = f.readRaw.mock.calls.length;
  jest.advanceTimersByTime(10_000); await settle();
  expect(JSON.parse(f.replace.mock.calls[1][0]).reason).toBe('background');
  expect(f.readRaw).toHaveBeenCalledTimes(count);
  jest.advanceTimersByTime(30_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(2);
});

test('Stop waits for an in-flight write then saves the stopped ring once, without overlapping or rearming', async () => {
  const f = fixture(); let finish!: () => void;
  f.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  f.sink.start(); f.sink.stop(); f.sink.stop();
  expect(f.replace).toHaveBeenCalledTimes(1);
  finish(); await settle();
  expect(f.replace).toHaveBeenCalledTimes(2);
  expect(JSON.parse(f.replace.mock.calls[1][0]).reason).toBe('manual');
  expect(f.sink.start()).toBe('unavailable');
});

test('retired module and replacement share one pending write gate and never restart an accepted capture', async () => {
  const f = fixture(); let finish!: () => void;
  f.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  f.sink.start(); f.sink.retire();
  const next = createChatGeometryQa(true, () => Date.now()); const start = jest.fn(next.api.start);
  const replacement = createQaGeometryCache({ api: { ...next.api, start }, gate: f.shared, replace: f.replace, now: () => Date.now() });
  expect(replacement.start()).toBe('unavailable');
  finish(); await settle();
  expect(f.shared.busy).toBe(false);
  expect(replacement.start()).toBe('unavailable');
  expect(start).not.toHaveBeenCalled();
  jest.advanceTimersByTime(30_000); await settle(); expect(f.replace).toHaveBeenCalledTimes(1);
});

test('a failed write retires sampling and does not retry or permit another Start', async () => {
  const f = fixture(); f.replace.mockRejectedValueOnce(new Error('private data must not be logged'));
  f.sink.start(); await settle();
  jest.advanceTimersByTime(30_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(1);
  expect(f.collector.api.read().status).toBe('stopped');
  expect(f.sink.start()).toBe('unavailable');
});

test('twenty-minute lifetime and write cap remain finite even with an active source', async () => {
  const f = fixture(); f.sink.start(); await settle();
  for (let i = 0; i < 121; i += 1) { jest.advanceTimersByTime(10_000); await settle(); }
  const count = f.replace.mock.calls.length;
  expect(count).toBeLessThanOrEqual(122);
  expect(count).toBeGreaterThan(100);
  expect(f.collector.api.read().status).toBe('stopped');
  jest.advanceTimersByTime(60_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(count);
});

test('unknown Start outcome is separately blocked while a reported already-active refusal does not consume the arm', () => {
  const f = fixture(); const api = { ...f.collector.api, start: jest.fn(() => { throw new Error('unknown'); }) };
  const sink = createQaGeometryCache({ api, gate: f.shared, replace: f.replace, now: () => Date.now() });
  expect(sink.start()).toBe('unavailable'); expect(f.shared.used).toBe(false); expect(f.shared.blocked).toBe(true);
  sink.start(); expect(api.start).toHaveBeenCalledTimes(1);
  const reported = { ...f.collector.api, start: jest.fn(() => 'already_active' as const) };
  const shared = gate(); const other = createQaGeometryCache({ api: reported, gate: shared, replace: f.replace });
  expect(other.start()).toBe('unavailable'); expect(shared.used).toBe(false);
});

test('a reentrant Start cannot accept a second capture before the first acceptance consumes its arm', async () => {
  const f = fixture(); let reenter!: () => string;
  const start = jest.fn(() => { expect(reenter()).toBe('unavailable'); return f.collector.api.start(); });
  const sink = createQaGeometryCache({ api: { ...f.collector.api, start }, gate: f.shared, replace: f.replace, now: () => Date.now() });
  reenter = sink.start;
  expect(sink.start()).toBe('started'); await settle();
  expect(start).toHaveBeenCalledTimes(1); expect(f.shared.used).toBe(true);
  expect(f.replace).toHaveBeenCalledTimes(1); sink.retire();
});

test('an unknown Start exception after partial acceptance stops the actual collector and never writes or retries', async () => {
  const f = fixture(); const start = jest.fn(() => { f.collector.api.start(); throw new Error('unknown partial outcome'); });
  const sink = createQaGeometryCache({ api: { ...f.collector.api, start }, gate: f.shared, replace: f.replace, now: () => Date.now() });
  expect(sink.start()).toBe('unavailable'); expect(f.shared.blocked).toBe(true); expect(f.shared.used).toBe(false);
  expect(f.collector.api.read().status).toBe('stopped');
  const count = f.readRaw.mock.calls.length; jest.advanceTimersByTime(30_000); await settle();
  expect(f.readRaw).toHaveBeenCalledTimes(count); expect(f.replace).not.toHaveBeenCalled();
  sink.start(); expect(start).toHaveBeenCalledTimes(1);
});

test('a backwards file clock retires the actual collector without another write or automatic rearm', async () => {
  const f = fixture(); let fileClock = 100;
  const sink = createQaGeometryCache({ api: f.collector.api, gate: f.shared, replace: f.replace, now: () => fileClock });
  expect(sink.start()).toBe('started'); await settle();
  fileClock = 99; jest.advanceTimersByTime(10_000); await settle();
  expect(f.replace).toHaveBeenCalledTimes(1); expect(f.collector.api.read().status).toBe('stopped');
  expect(sink.start()).toBe('unavailable');
});

test.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])('invalid initial clock %s cannot start the collector or create a timer/write', time => {
  const f = fixture(); const api = { ...f.collector.api, start: jest.fn(f.collector.api.start) };
  const sink = createQaGeometryCache({ api, gate: f.shared, replace: f.replace, now: () => time });
  expect(sink.start()).toBe('unavailable'); expect(api.start).not.toHaveBeenCalled(); expect(f.shared.used).toBe(false);
  expect(f.replace).not.toHaveBeenCalled();
});

test('encoder keeps useful negative offsets/unreported values while rejecting payload fields and malformed metadata', () => {
  const f = fixture(); f.collector.api.start();
  const snapshot = f.collector.api.read();
  const valid = JSON.parse(JSON.stringify(snapshot)); valid.samples[0].rawOffset = -15;
  expect(JSON.parse(encodeQaGeometryCache(valid)!).samples[0].rawOffset).toBe(-15);
  const invalid = [
    { ...snapshot, token: 'never-save' }, { ...snapshot, status: 'message body' }, { ...snapshot, elapsedMs: Infinity },
    { ...snapshot, samples: Array(257).fill(snapshot.samples[0]) },
    { ...snapshot, samples: [{ ...snapshot.samples[0], body: 'never-save' }] },
    { ...snapshot, samples: [{ ...snapshot.samples[0], rawSequence: true }] },
    { ...snapshot, samples: [{ ...snapshot.samples[0], layouts: [{ index: 0, y: 1, height: 10, path: 'never-save' }] }] },
  ];
  for (const value of invalid) expect(encodeQaGeometryCache(value)).toBeNull();
  f.collector.api.stop();
});
