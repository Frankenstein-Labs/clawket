const mockMenus = new Map<string, () => void>();
let mockPlatform = 'android';
let mockAppId: string | null = 'com.p697.clawket.qa';
jest.mock('react-native', () => ({
  DevSettings: { addMenuItem: jest.fn((name: string, callback: () => void) => mockMenus.set(name, callback)) },
  Platform: { get OS() { return mockPlatform; } },
}));
jest.mock('expo-application', () => ({ get applicationId() { return mockAppId; } }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///qa-private/cache/', EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => undefined), moveAsync: jest.fn(async () => undefined),
}));
import * as FileSystem from 'expo-file-system/legacy';
import { createChatGeometryQa } from './chatGeometryQa';
import { qaGeometryCacheEnabled, registerChatGeometryQaCache } from './registerChatGeometryQaCache';

const HOST = Symbol.for('clawket.chatGeometryQa.cacheExport');
const host = globalThis as typeof globalThis & { [HOST]?: { binding: { sink: { retire: () => void } } | null } };
const envBefore = process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;
const devBefore = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
function api() {
  const c = createChatGeometryQa(true, () => Date.now());
  c.attach(() => ({ isCurrent: () => true, enableRaw: jest.fn(), readRaw: receive => receive({}), readSdk: () => ({}) }));
  return c.api;
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(0); jest.clearAllMocks();
  mockMenus.clear(); mockPlatform = 'android'; mockAppId = 'com.p697.clawket.qa';
  Object.defineProperty(globalThis, '__DEV__', { configurable: true, writable: true, value: true });
  delete host[HOST]; delete process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;
});
afterEach(() => {
  host[HOST]?.binding?.sink.retire(); delete host[HOST]; jest.clearAllTimers(); jest.useRealTimers();
  if (devBefore) Object.defineProperty(globalThis, '__DEV__', devBefore);
  else Reflect.deleteProperty(globalThis, '__DEV__');
  if (envBefore === undefined) delete process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE;
  else process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = envBefore;
});

test.each([
  [false, 'android', 'com.p697.clawket.qa', '1'], [true, 'ios', 'com.p697.clawket.qa', '1'],
  [true, 'android', 'com.p697.clawket', '1'], [true, 'android', null, '1'],
  [true, 'android', 'com.p697.clawket.qa', undefined], [true, 'android', 'com.p697.clawket.qa', 'true'],
  [true, 'android', 'com.p697.clawket.qa', '0'],
])('four gates reject dev/platform/package/opt-in %s/%s/%s/%s', (dev, platform, id, flag) => {
  expect(qaGeometryCacheEnabled(dev as boolean, platform as string, id as string | null, flag as string | undefined)).toBe(false);
});

test('default registration is inert; explicit QA opt-in registers menus but performs no sampling or IO', () => {
  const current = api(); const start = jest.fn(current.start);
  registerChatGeometryQaCache({ ...current, start }); expect(mockMenus.size).toBe(0);
  process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = '1';
  registerChatGeometryQaCache({ ...current, start });
  expect([...mockMenus.keys()]).toEqual(['QA Geometry Start', 'QA Geometry Stop']);
  expect(start).not.toHaveBeenCalled(); expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});

test('old menu callback reads the replacement API at invocation and uses only fixed cache paths', async () => {
  process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = '1';
  const old = api(); const oldStart = jest.fn(old.start);
  registerChatGeometryQaCache({ ...old, start: oldStart }); const callback = mockMenus.get('QA Geometry Start')!;
  const fresh = api(); const freshStart = jest.fn(fresh.start);
  registerChatGeometryQaCache({ ...fresh, start: freshStart }); callback(); await settle();
  expect(oldStart).not.toHaveBeenCalled(); expect(freshStart).toHaveBeenCalledTimes(1);
  expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith('file:///qa-private/cache/clawket-chat-geometry-qa-v1.tmp', expect.any(String), { encoding: 'utf8' });
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: 'file:///qa-private/cache/clawket-chat-geometry-qa-v1.tmp', to: 'file:///qa-private/cache/clawket-chat-geometry-qa-v1.json' });
});

test('Fast Refresh retirement cannot reopen accepted sampling while an old native file write is pending', async () => {
  process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = '1'; let finish!: () => void;
  (FileSystem.writeAsStringAsync as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  registerChatGeometryQaCache(api()); mockMenus.get('QA Geometry Start')!();
  const next = api(); const nextStart = jest.fn(next.start);
  registerChatGeometryQaCache({ ...next, start: nextStart }); mockMenus.get('QA Geometry Start')!();
  expect(nextStart).not.toHaveBeenCalled(); finish(); await settle();
  mockMenus.get('QA Geometry Start')!(); expect(nextStart).not.toHaveBeenCalled();
  jest.advanceTimersByTime(30_000); await settle(); expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
});

test('disabling the opt-in makes existing native menu callbacks inert rather than keeping a retired binding', async () => {
  process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE = '1'; const current = api(); const start = jest.fn(current.start);
  registerChatGeometryQaCache({ ...current, start }); const callback = mockMenus.get('QA Geometry Start')!;
  delete process.env.EXPO_PUBLIC_CHAT_GEOMETRY_QA_CACHE; registerChatGeometryQaCache(current); callback(); await settle();
  expect(start).not.toHaveBeenCalled(); expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
});
