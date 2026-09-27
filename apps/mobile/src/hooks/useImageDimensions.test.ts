import { renderHook, waitFor } from '@testing-library/react-native';
import { useImageDimensions } from './useImageDimensions';

const mockGetSize = jest.fn();
jest.mock('react-native', () => ({ Image: { getSize: (...args: unknown[]) => mockGetSize(...args) } }));

function pngDataUri(width: number, height: number): string {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

describe('useImageDimensions', () => {
  beforeEach(() => mockGetSize.mockReset());

  it('sizes inline history images from their header, without Image.getSize', async () => {
    // Android's getSize rejects data: URIs; the screenshot must keep its portrait frame.
    mockGetSize.mockImplementation((_uri: string, _success: unknown, failure?: (error: Error) => void) => failure?.(new Error('Unsupported uri scheme')));
    const uri = pngDataUri(1080, 2340);
    // Stable props, as a message row passes them.
    const uris = [uri];
    const metas = [{ uri, width: 0, height: 0 }];
    const { result } = renderHook(() => useImageDimensions(uris, metas));
    await waitFor(() => expect(result.current).toEqual([{ uri, width: 1080, height: 2340 }]));
    expect(mockGetSize).not.toHaveBeenCalled();
  });

  it('still asks Image.getSize for file and remote images', async () => {
    mockGetSize.mockImplementation((_uri: string, success: (width: number, height: number) => void) => success(640, 480));
    const uris = ['file:///cache/photo.jpg'];
    const { result } = renderHook(() => useImageDimensions(uris, undefined));
    await waitFor(() => expect(result.current).toEqual([{ uri: 'file:///cache/photo.jpg', width: 640, height: 480 }]));
    expect(mockGetSize).toHaveBeenCalledTimes(1);
  });
});
