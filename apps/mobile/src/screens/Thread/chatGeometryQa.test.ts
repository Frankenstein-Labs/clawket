import { createChatGeometryQa, type ChatGeometryQaSource } from './chatGeometryQa';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

function fixture(enabled = true) {
  let current = true;
  const replies: ((value: unknown) => void)[] = [];
  const source: ChatGeometryQaSource = {
    isCurrent: () => current,
    enableRaw: jest.fn(),
    readRaw: jest.fn(receive => { replies.push(receive); }),
    readSdk: jest.fn(() => ({ available: true, offset: 10, rowCount: 80, layouts: [] })),
  };
  const collector = createChatGeometryQa(enabled, Date.now);
  const detach = collector.attach(() => source);
  return { collector, source, replies, detach, retire: () => { current = false; } };
}

it('does nothing until explicitly started, and its static release gate refuses capture', () => {
  const f = fixture();
  jest.advanceTimersByTime(60_000);
  expect(f.source.enableRaw).not.toHaveBeenCalled();
  expect(f.source.readRaw).not.toHaveBeenCalled();
  expect(f.collector.api.read()).toMatchObject({ status: 'idle', samples: [] });
  const release = fixture(false);
  expect(release.collector.api.start()).toBe('unavailable');
  expect(release.source.enableRaw).not.toHaveBeenCalled();
});

it('allows one delayed UI query and schedules the next at least one second after receipt', () => {
  const f = fixture();
  expect(f.collector.api.start()).toBe('started');
  expect(f.collector.api.start()).toBe('already_active');
  jest.advanceTimersByTime(10_000);
  expect(f.source.readRaw).toHaveBeenCalledTimes(1);
  expect(f.source.readSdk).not.toHaveBeenCalled();
  f.replies[0]!({ available: true, offset: 12 });
  jest.advanceTimersByTime(999);
  expect(f.source.readRaw).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  expect(f.source.readRaw).toHaveBeenCalledTimes(2);
  // Duplicate old replies cannot consume the new in-flight query.
  f.replies[0]!({ available: true, offset: 999 });
  expect(f.collector.api.read()).toMatchObject({ inFlight: true, samples: [{ rawOffset: 12 }] });
  f.replies[1]!({ available: true, offset: 20 });
  expect(f.collector.api.read().samples.map(row => row.rawOffset)).toEqual([12, 20]);
});

it('retires an in-flight scope without querying its successor until the old query returns', () => {
  const f = fixture();
  f.collector.api.start();
  f.detach();
  const replacement = { ...f.source, readRaw: jest.fn() };
  f.collector.attach(() => replacement);
  expect(f.collector.api.start()).toBe('unavailable');
  f.replies[0]!({ offset: 123 });
  expect(f.source.readSdk).not.toHaveBeenCalled();
  expect(f.collector.api.read()).toMatchObject({ status: 'stopped', reason: 'scope', samples: [], inFlight: false });
  expect(f.collector.api.start()).toBe('started');
  expect(replacement.readRaw).toHaveBeenCalledTimes(1);
  f.replies[0]!({ offset: 456 });
  expect(f.collector.api.read().inFlight).toBe(true);
});

it('shares only an outstanding query gate across module replacement, never old rings or scopes', () => {
  const old = fixture();
  old.collector.api.start();
  old.collector.api.stop();
  const next = createChatGeometryQa(true, Date.now, old.collector.queryGate);
  const nextRead = jest.fn();
  next.attach(() => ({ ...old.source, readRaw: nextRead }));
  expect(next.api.start()).toBe('unavailable');
  expect(next.api.read()).toMatchObject({ status: 'idle', inFlight: true, samples: [] });
  old.replies[0]!({ offset: 5 });
  expect(next.api.start()).toBe('started');
  expect(nextRead).toHaveBeenCalledTimes(1);
  old.replies[0]!({ offset: 7 });
  expect(next.api.read().inFlight).toBe(true);
});

it.each(['retire', 'background', 'manual'] as const)('rejects late evidence after %s and disables raw recording', why => {
  const f = fixture();
  f.collector.api.start();
  if (why === 'retire') f.retire();
  else if (why === 'background') f.collector.background();
  else f.collector.api.stop();
  f.replies[0]!({ offset: 500 });
  expect(f.source.readSdk).not.toHaveBeenCalled();
  expect(f.source.enableRaw).toHaveBeenLastCalledWith(false);
  expect(f.collector.api.read()).toMatchObject({ status: 'stopped', samples: [] });
});

it('ends after twenty minutes even with a permanently stalled UI query', () => {
  const f = fixture();
  f.collector.api.start();
  jest.advanceTimersByTime(20 * 60_000);
  expect(f.source.readRaw).toHaveBeenCalledTimes(1);
  expect(f.collector.api.read()).toMatchObject({ status: 'stopped', reason: 'expired', elapsedMs: 1_200_000, inFlight: true });
  expect(f.collector.api.start()).toBe('unavailable');
  f.replies[0]!({ offset: 500 });
  expect(f.collector.api.read().samples).toEqual([]);
});

it('keeps only 256 records and copies them without exposing mutable ring storage', () => {
  const f = fixture();
  f.collector.api.start();
  for (let index = 0; index < 258; index += 1) {
    f.replies[index]!({ offset: index });
    if (index < 257) jest.advanceTimersByTime(1_000);
  }
  const result = f.collector.api.read();
  expect(result.samples).toHaveLength(256);
  expect(result.dropped).toBe(2);
  expect(result.samples[0]!.rawOffset).toBe(2);
  result.samples[0]!.rawOffset = 999;
  result.samples.length = 0;
  expect(f.collector.api.read().samples[0]!.rawOffset).toBe(2);
});

it('allowlists scalars and four bounded layout indices without retaining payloads or identifiers', () => {
  const f = fixture();
  const secret = 'SECRET_BODY_ID_TOKEN_URL_PATH';
  (f.source.readSdk as jest.Mock).mockReturnValue({
    available: true, offset: Infinity, rowCount: -1, visibleStart: 0.5, visibleEnd: true,
    readerScrolling: 'true', bottomFollowing: true,
    body: secret, key: secret, token: secret, url: secret, path: secret,
    layouts: Array.from({ length: 10 }, (_, index) => ({ index, y: NaN, height: 40, id: secret, text: secret })),
  });
  f.collector.api.start();
  f.replies[0]!({ available: true, sequence: false, ageMs: -1, event: secret, offset: NaN, prompt: secret });
  const result = f.collector.api.read();
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.samples[0]).toMatchObject({ rawSequence: null, rawAgeMs: null, rawEvent: 'none',
    rawOffset: null, sdkOffset: null, rowCount: null, visibleStart: null, visibleEnd: null,
    readerScrolling: false, bottomFollowing: true });
  expect(result.samples[0]!.layouts).toEqual([0, 1, 2, 3].map(index => ({ index, y: null, height: 40 })));
});

it('contains throwing samplers and getters without logging or leaking exception text', () => {
  const f = fixture();
  (f.source.readSdk as jest.Mock).mockImplementation(() => { throw new Error('PRIVATE_NATIVE_ERROR'); });
  f.collector.api.start();
  f.replies[0]!({ offset: 2 });
  expect(f.collector.api.read()).toMatchObject({ status: 'stopped', reason: 'unavailable', samples: [] });
  expect(JSON.stringify(f.collector.api.read())).not.toContain('PRIVATE_NATIVE_ERROR');
});
