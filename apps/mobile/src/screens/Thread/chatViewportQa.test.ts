import { createViewportQaRecorder, type ViewportQaInput } from './chatViewportQa';
import { createChatGeometryQa } from './chatGeometryQa';
import { encodeQaGeometryCache } from './chatGeometryQaCache';

test('retains every command/ACK/layout/size stage while making sampled scroll gaps and eviction explicit', () => {
  const ring = createViewportQaRecorder();
  const command = ring.observe({ kind: 'offset_command', targetOffset: 3240 }, 0);
  ring.observe({ kind: 'reader_scroll', offset: 40 }, 0);
  ring.observe({ kind: 'reader_scroll', offset: 41 }, 16);
  for (const kind of ['layout_begin', 'layout_commit', 'content_size', 'offset_ack'] as const) {
    ring.observe({ kind, commandSequence: kind === 'offset_ack' ? command : null }, 17);
  }
  expect(ring.read()).toMatchObject({ sequence: 7, throttled: 1, dropped: 0, rejected: 0, initialIncomplete: true });
  expect(ring.read().events.map(event => event.sequence)).toEqual([1, 2, 4, 5, 6, 7]);
  for (let i = 0; i < 40; i += 1) ring.observe({ kind: 'content_size', contentHeight: i }, 18);
  expect(ring.read()).toMatchObject({ sequence: 47, dropped: 14, throttled: 1 });
  expect(ring.read().events).toHaveLength(32);
  const copy = ring.read(); copy.events[0]!.offset = 999; copy.events.length = 0;
  expect(ring.read().events).toHaveLength(32); expect(ring.read().events[0]!.offset).toBeNull();
});

test('rejects unknown fields, enum/number types and backwards clocks without saving their payload', () => {
  const ring = createViewportQaRecorder();
  ring.observe({ kind: 'layout_commit' }, 10);
  for (const value of [
    { kind: 'message', body: 'PRIVATE' }, { kind: 'offset_command', targetOffset: Infinity },
    { kind: 'offset_ack', commandSequence: true }, { kind: 'cell_mount', mountedStart: 4, mountedEnd: 2 },
    { kind: 'layout_commit', path: 'PRIVATE' },
  ]) ring.observe(value as ViewportQaInput, 10);
  ring.observe({ kind: 'content_size' }, 9);
  expect(ring.read()).toMatchObject({ sequence: 7, rejected: 6, events: [{ sequence: 1 }] });
  expect(JSON.stringify(ring.read())).not.toContain('PRIVATE');
});

function snapshot() {
  const collector = createChatGeometryQa(true, () => 100);
  const open = () => ({ isCurrent: () => true, enableRaw: () => undefined,
    readRaw: (receive: (value: unknown) => void) => receive({}), readSdk: () => ({}) });
  collector.attach(open); collector.api.start();
  const command = collector.observe(open, { kind: 'offset_command', targetOffset: 3240 });
  collector.observe(open, { kind: 'offset_ack', offset: 3240 }, command);
  collector.api.stop();
  return collector.api.read();
}

test('strict v2 encoding preserves stage lineage and still accurately reads an exact old v1 snapshot', () => {
  const current = snapshot();
  expect(JSON.parse(encodeQaGeometryCache(current)!)).toEqual(current);
  const { viewport: _viewport, ...legacy } = current as ReturnType<typeof snapshot> & { viewport: unknown };
  const v1 = { ...legacy, version: 1 };
  expect(JSON.parse(encodeQaGeometryCache(v1)!)).toEqual(v1);
  expect(encodeQaGeometryCache({ ...v1, viewport: {} })).toBeNull();
});

test('v2 corruption cannot bypass sequence, counts, lifetime, capacity or scalar schema checks', () => {
  const current = snapshot() as ReturnType<typeof snapshot> & { viewport: { events: Array<Record<string, unknown>> } };
  const corrupt = (change: (value: any) => void) => { const copy = JSON.parse(JSON.stringify(current)); change(copy); return copy; };
  const invalid = [
    corrupt(v => { v.viewport.events[0].token = 'PRIVATE'; }), corrupt(v => { v.viewport.events[0].kind = 'PRIVATE'; }),
    corrupt(v => { v.viewport.events[1].sequence = 1; }), corrupt(v => { v.viewport.events[1].commandSequence = 2; }),
    corrupt(v => { v.viewport.events[1].elapsedMs = 1_200_001; }), corrupt(v => { v.viewport.sequence = 3; }),
    corrupt(v => { v.viewport.initialIncomplete = false; }), corrupt(v => { v.viewport.events[0].mountedCount = true; }),
    corrupt(v => { v.viewport.events = Array(33).fill(v.viewport.events[0]); }), { ...current, version: 3 },
  ];
  invalid.forEach(value => expect(encodeQaGeometryCache(value)).toBeNull());
});
