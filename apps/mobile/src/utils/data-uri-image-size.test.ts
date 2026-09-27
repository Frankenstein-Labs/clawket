import { readDataUriImageSize } from './data-uri-image-size';

const dataUri = (mime: string, bytes: number[] | Buffer) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number, orientation?: number): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (orientation !== undefined) {
    // APP1 Exif, little-endian TIFF with one IFD0 entry: Orientation (0x0112, SHORT, 1).
    const tiff = Buffer.alloc(8 + 2 + 12 + 4);
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x0112, 10);
    tiff.writeUInt16LE(3, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt16LE(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    const app1 = Buffer.alloc(4);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(body.length + 2, 2);
    parts.push(app1, body);
  }
  // An unrelated APP0 segment before the frame header.
  parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]));
  const sof = Buffer.alloc(11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(9, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof, Buffer.alloc(8));
  return Buffer.concat(parts);
}

describe('readDataUriImageSize', () => {
  it('reads PNG, GIF and WebP headers', () => {
    expect(readDataUriImageSize(dataUri('image/png', png(1080, 2340)))).toEqual({ width: 1080, height: 2340 });
    const gif = Buffer.alloc(13);
    gif.write('GIF89a', 0, 'ascii');
    gif.writeUInt16LE(320, 6);
    gif.writeUInt16LE(200, 8);
    expect(readDataUriImageSize(dataUri('image/gif', gif))).toEqual({ width: 320, height: 200 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.write('WEBP', 8, 'ascii');
    webp.write('VP8X', 12, 'ascii');
    webp.writeUIntLE(1920 - 1, 24, 3);
    webp.writeUIntLE(1080 - 1, 27, 3);
    expect(readDataUriImageSize(dataUri('image/webp', webp))).toEqual({ width: 1920, height: 1080 });
  });

  it('reads the JPEG frame header after other segments and applies a quarter-turn EXIF orientation', () => {
    expect(readDataUriImageSize(dataUri('image/jpeg', jpeg(4032, 3024)))).toEqual({ width: 4032, height: 3024 });
    expect(readDataUriImageSize(dataUri('image/jpeg', jpeg(4032, 3024, 1)))).toEqual({ width: 4032, height: 3024 });
    expect(readDataUriImageSize(dataUri('image/jpeg', jpeg(4032, 3024, 6)))).toEqual({ width: 3024, height: 4032 });
  });

  it('tolerates wrapped base64 and rejects other URIs or corrupted headers', () => {
    const wrapped = Buffer.from(png(10, 20)).toString('base64').replace(/(.{8})/g, '$1\n');
    expect(readDataUriImageSize(`data:image/png;base64,${wrapped}`)).toEqual({ width: 10, height: 20 });
    expect(readDataUriImageSize('file:///tmp/a.png')).toBeNull();
    expect(readDataUriImageSize('data:image/png;base64,@@@@')).toBeNull();
    expect(readDataUriImageSize(dataUri('image/png', png(0, 20)))).toBeNull();
    expect(readDataUriImageSize(dataUri('image/jpeg', Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])))).toBeNull();
  });
});
