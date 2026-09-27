import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { voiceCapture } from './voiceCapture';

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => ({
    prepare: jest.fn(async () => {}),
    start: jest.fn(async () => ({ startMs: 10 })),
    stop: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
  })),
}));

const native = (requireOptionalNativeModule as jest.Mock).mock.results[0]!.value;
const originalOS = Platform.OS;
afterEach(() => { Platform.OS = originalOS; jest.clearAllMocks(); });

it('iOS navigation, overlapping chat focus and foreground return never prepare or start audio', () => {
  Platform.OS = 'ios';
  const first = voiceCapture.hold();
  const second = voiceCapture.hold();
  first(); first();
  expect(native.release).not.toHaveBeenCalled();
  second();
  const foreground = voiceCapture.hold();
  foreground();
  expect(native.prepare).not.toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
  expect(native.stop).not.toHaveBeenCalled();
  expect(native.release).toHaveBeenCalledTimes(2);
});

it('iOS starts and stops only the explicitly requested capture', async () => {
  Platform.OS = 'ios';
  const release = voiceCapture.hold();
  expect(native.start).not.toHaveBeenCalled();
  await voiceCapture.start('voice-explicit', 123);
  await voiceCapture.stop('voice-explicit');
  release();
  expect(native.prepare).not.toHaveBeenCalled();
  expect(native.start).toHaveBeenCalledWith('voice-explicit', 123);
  expect(native.stop).toHaveBeenCalledWith('voice-explicit');
  expect(native.release).toHaveBeenCalledTimes(1);
});

it('Android retains recorder preparation and releases only after the last chat leaves', () => {
  Platform.OS = 'android';
  const first = voiceCapture.hold();
  const second = voiceCapture.hold();
  expect(native.prepare).toHaveBeenCalledTimes(2);
  expect(native.start).not.toHaveBeenCalled();
  first();
  expect(native.release).not.toHaveBeenCalled();
  second(); second();
  expect(native.release).toHaveBeenCalledTimes(1);
});
