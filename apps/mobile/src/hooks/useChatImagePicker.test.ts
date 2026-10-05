import { act, renderHook } from '@testing-library/react-native';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

import { useChatImagePicker } from './useChatImagePicker';
import { preparePendingImagesForSend } from '../chat/preparePendingImagesForSend';
import { buildPromptAttachments } from '../chat/chatControllerUtils';
import { CodexAdapter } from '../connection/adapters/codex';
import type { WebSocketLike } from '../connection/transports/types';

// Complete synthetic 1×1 image files, independent of a device's gallery.
const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDNooor5c+5P//Z';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ESAHAAMaATfUxYq4AAAAAElFTkSuQmCC';
const gif = 'R0lGODdhAQABAIEAAMhQHgAAAAAAAAAAACwAAAAAAQABAAAIBAABBAQAOw==';
const webp = 'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+6Wkf+dg2Jdrxz/+wd/OA/OA/ooAA';

class Socket implements WebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  onclose = null;
  sent: string[] = [];
  send(data: unknown) { this.sent.push(String(data)); }
  close() { this.readyState = 3; }
  reply(payload: unknown) {
    const request = JSON.parse(this.sent.at(-1)!);
    this.onmessage?.({ data: JSON.stringify({ type: 'res', id: request.id, ok: true, payload }) });
  }
}

describe('useChatImagePicker.pickImage payloads', () => {
  const picker = jest.requireMock('expo-image-picker').launchImageLibraryAsync as jest.Mock;
  const manipulateAsync = jest.requireMock('expo-image-manipulator').manipulateAsync as jest.Mock;

  beforeEach(() => {
    picker.mockReset();
    manipulateAsync.mockReset();
    // A failed local re-encode must not send a stale provider MIME with the original bytes.
    manipulateAsync.mockRejectedValue(new Error('codec unavailable'));
  });

  it.each(['image/gif', 'image/png'])('sends actual JPEG bytes as JPEG when the gallery reports %s', async declared => {
    const uri = `file:///exported.${declared.split('/')[1]}`;
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri, base64: jpeg, mimeType: declared, width: 1, height: 1 }] });
    const view = renderHook(() => useChatImagePicker());
    await act(async () => { await view.result.current.pickImage(); });
    expect(picker).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsMultipleSelection: true,
      selectionLimit: 6, quality: 0.8, base64: true, exif: false });
    const prepared = await preparePendingImagesForSend(view.result.current.pendingImages);
    expect(prepared.images[0].uri).toBe(uri);
    const attachments = buildPromptAttachments(prepared.images);
    const socket = new Socket();
    const adapter = new CodexAdapter({ id: 'fixture', backendKind: 'codex', transportKind: 'relay',
      label: 'Fixture', url: 'wss://example.com/ws', createdAt: 1,
      relay: { gatewayId: 'fixture', clientToken: 'fixture', serverUrl: 'https://example.com' } },
    { webSocketFactory: () => socket });
    try {
      const connected = adapter.connect();
      socket.readyState = 1; socket.onopen?.();
      socket.reply({ backend: 'codex', models: [] }); await connected;
      const sent = adapter.prompt('fixture-session', { text: 'Inspect this image', idempotencyKey: 'fixture-send', attachments });
      const wire = JSON.parse(socket.sent.at(-1)!);
      socket.reply({ runId: 'fixture-run' }); await sent;
      expect(wire).toMatchObject({ method: 'chat.send', params: {
        attachments: [{ type: 'image', mimeType: 'image/jpeg', content: jpeg }],
      } });
    } finally {
      adapter.disconnect();
      view.unmount();
    }
  });

  it.each([
    ['JPEG', jpeg, 'image/jpeg'], ['PNG', png, 'image/png'],
    ['GIF87a', gif, 'image/gif'],
    ['GIF89a', Buffer.from(Buffer.from(gif, 'base64').toString('binary').replace('GIF87a', 'GIF89a'), 'binary').toString('base64'), 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ])('uses the %s payload format without changing its URI or bytes', async (_name, base64, mimeType) => {
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///provider-name.heic', base64, mimeType: 'image/heic', width: 1, height: 1 }] });
    const view = renderHook(() => useChatImagePicker());
    await act(async () => { await view.result.current.pickImage(); });
    const prepared = await preparePendingImagesForSend(view.result.current.pendingImages);
    expect(prepared.images[0]).toMatchObject({ uri: 'file:///provider-name.heic', base64, mimeType });
    expect(buildPromptAttachments(prepared.images)).toEqual([{ type: 'image', mimeType, content: base64 }]);
    if (mimeType === 'image/gif') expect(manipulateAsync).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each([
    ['unknown-format', 'image/avif', 'image/avif'],
    ['@@@@', 'image/png', 'image/png'],
    [Buffer.from('\x89PNG', 'binary').toString('base64'), 'image/png', 'image/png'],
    [Buffer.from('\xff\xd8', 'binary').toString('base64'), 'image/avif', 'image/avif'],
    [Buffer.from('GIF90a-not-a-known-GIF').toString('base64'), 'image/avif', 'image/avif'],
    [Buffer.from('RIFFxxxxWAVE').toString('base64'), 'image/avif', 'image/avif'],
    ['unknown-format', undefined, 'image/jpeg'],
  ])('retains the existing declared/default MIME for an unknown payload (%s)', async (base64, declared, expected) => {
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///unknown', base64, mimeType: declared }] });
    const view = renderHook(() => useChatImagePicker());
    await act(async () => { await view.result.current.pickImage(); });
    expect(view.result.current.pendingImages[0]).toMatchObject({ base64, mimeType: expected });
    view.unmount();
  });

  it('keeps existing picks on cancellation and retains the six-image capacity', async () => {
    picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///first', base64: png, mimeType: 'image/png' }] })
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockResolvedValueOnce({ canceled: false, assets: Array.from({ length: 6 }, (_, index) => ({ uri: `file:///extra-${index}`, base64: jpeg, mimeType: 'image/jpeg' })) });
    const view = renderHook(() => useChatImagePicker());
    await act(async () => { await view.result.current.pickImage(); });
    const first = view.result.current.pendingImages;
    await act(async () => { await view.result.current.pickImage(); });
    expect(view.result.current.pendingImages).toBe(first);
    await act(async () => { await view.result.current.pickImage(); });
    expect(picker.mock.calls[2][0].selectionLimit).toBe(5);
    expect(view.result.current.pendingImages).toHaveLength(6);
    expect(view.result.current.canAddMoreImages).toBe(false);
    await act(async () => { await view.result.current.pickImage(); });
    expect(picker).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('drops a completed gallery result after unmount', async () => {
    let resolve!: (value: unknown) => void;
    picker.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = renderHook(() => useChatImagePicker());
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.pickImage(); });
    view.unmount();
    await act(async () => { resolve({ canceled: false, assets: [{ uri: 'file:///late', base64: jpeg, mimeType: 'image/gif' }] }); await pending; });
    expect(view.result.current.pendingImages).toEqual([]);
  });

  it('recognizes a picked payload without a browser base64 global', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'atob');
    Object.defineProperty(globalThis, 'atob', { configurable: true, value: undefined });
    const view = renderHook(() => useChatImagePicker());
    try {
      picker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///export.gif', base64: jpeg, mimeType: 'image/gif' }] });
      await act(async () => { await view.result.current.pickImage(); });
      expect(buildPromptAttachments(view.result.current.pendingImages)).toEqual([{ type: 'image', mimeType: 'image/jpeg', content: jpeg }]);
    } finally {
      view.unmount();
      if (descriptor) Object.defineProperty(globalThis, 'atob', descriptor);
      else Reflect.deleteProperty(globalThis, 'atob');
    }
  });
});

describe('useChatImagePicker.attachLocalImages', () => {
  const manipulateAsync = jest.requireMock('expo-image-manipulator').manipulateAsync as jest.Mock;

  beforeEach(() => {
    manipulateAsync.mockReset();
  });

  it('re-encodes local photos as JPEG with base64 in pick order and respects the slot limit', async () => {
    manipulateAsync.mockImplementation(async (uri: string, _actions: unknown, options: { compress: number; format: string; base64: boolean }) => {
      expect(options).toEqual({ base64: true, compress: 0.8, format: 'jpeg' });
      return { uri: uri.replace('.heic', '.jpg'), width: 1200, height: 1600, base64: `b64:${uri}` };
    });
    const { result } = renderHook(() => useChatImagePicker(2));

    await act(async () => {
      await result.current.attachLocalImages(['file:///a.heic', 'file:///b.heic', 'file:///c.heic']);
    });

    expect(manipulateAsync).toHaveBeenCalledTimes(2);
    expect(result.current.pendingImages).toEqual([
      { uri: 'file:///a.jpg', base64: 'b64:file:///a.heic', mimeType: 'image/jpeg', width: 1200, height: 1600 },
      { uri: 'file:///b.jpg', base64: 'b64:file:///b.heic', mimeType: 'image/jpeg', width: 1200, height: 1600 },
    ]);
    expect(result.current.canAddMoreImages).toBe(false);

    await act(async () => {
      await result.current.attachLocalImages(['file:///d.heic']);
    });
    expect(manipulateAsync).toHaveBeenCalledTimes(2);
  });

  it('skips photos that cannot be encoded without dropping the rest', async () => {
    manipulateAsync
      .mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({ uri: 'file:///b.jpg', width: 10, height: 10, base64: undefined })
      .mockResolvedValueOnce({ uri: 'file:///c.jpg', width: 10, height: 10, base64: 'ok' });
    const { result } = renderHook(() => useChatImagePicker(6));

    await act(async () => {
      await result.current.attachLocalImages(['file:///a.heic', 'file:///b.heic', 'file:///c.heic']);
    });

    expect(result.current.pendingImages.map((image) => image.uri)).toEqual(['file:///c.jpg']);
  });
});

 it('discards a photo library result returned after switching conversations', async () => {
   const picker = jest.requireMock('expo-image-picker').launchImageLibraryAsync as jest.Mock;
   let resolve!: (result: unknown) => void;
   picker.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
   const view = renderHook(({ scope }: { scope: string }) => useChatImagePicker(6, scope), { initialProps: { scope: 'openclaw:main' } });
   let pending!: Promise<void>;
   act(() => { pending = view.result.current.pickImage(); });
   view.rerender({ scope: 'hermes:main' });
   await act(async () => { resolve({ canceled: false, assets: [{ uri: 'private-old-photo', base64: 'old' }] }); await pending; });
   expect(view.result.current.pendingImages).toEqual([]);
 });
