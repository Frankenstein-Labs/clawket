/**
 * Pixel size of a base64 `data:` image, read from its header.
 *
 * Android's `Image.getSize` fetches the encoded image through Fresco, which rejects `data:` URIs,
 * so history images (backends return them inline) lost their dimensions and every screenshot
 * collapsed into a square crop after a reload (device review 2026-09-27). PNG, GIF, WebP and JPEG
 * (with EXIF orientation) cover what the pickers and the Agents send.
 *
 * Pure function with no React Native dependency.
 */

export type ImageSize = { width: number; height: number };

const DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,/i;
/** JPEG metadata before the frame header (EXIF thumbnails, ICC profiles) stays well below this. */
const MAX_HEADER_BYTES = 256 * 1024;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = (() => {
  const values = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64.length; index += 1) values[BASE64.charCodeAt(index)] = index;
  return values;
})();

function decodeBase64Prefix(payload: string, maxBytes: number): Uint8Array | null {
  const chars = Math.min(payload.length, Math.ceil(maxBytes / 3) * 4);
  const bytes = new Uint8Array(Math.floor((chars * 3) / 4));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < chars; index += 1) {
    const code = payload.charCodeAt(index);
    if (code === 61) break; // '=' padding
    if (code === 10 || code === 13 || code === 32) continue;
    const value = code < 128 ? BASE64_VALUES[code]! : -1;
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[length] = (buffer >> bits) & 0xff;
      length += 1;
    }
  }
  return bytes.subarray(0, length);
}

function valid(width: number, height: number): ImageSize | null {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const read = (offset: number) => ((bytes[offset]! << 24) >>> 0) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
  return valid(read(16), read(20));
}

function gifSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 10) return null;
  return valid(bytes[6]! | (bytes[7]! << 8), bytes[8]! | (bytes[9]! << 8));
}

function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return valid(1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)), 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)));
  }
  if (chunk === 'VP8 ') {
    return valid((bytes[26]! | (bytes[27]! << 8)) & 0x3fff, (bytes[28]! | (bytes[29]! << 8)) & 0x3fff);
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const width = 1 + (((bytes[22]! & 0x3f) << 8) | bytes[21]!);
    const height = 1 + (((bytes[24]! & 0x0f) << 10) | (bytes[23]! << 2) | ((bytes[22]! & 0xc0) >> 6));
    return valid(width, height);
  }
  return null;
}

/** EXIF orientation 5–8 turns the stored frame a quarter turn when displayed. */
function exifSwapsAxes(bytes: Uint8Array, start: number, end: number): boolean {
  if (end - start < 14 || ascii(bytes, start, 6) !== 'Exif\0\0') return false;
  const tiff = start + 6;
  const little = ascii(bytes, tiff, 2) === 'II';
  const u16 = (offset: number) => (little ? bytes[offset]! | (bytes[offset + 1]! << 8) : (bytes[offset]! << 8) | bytes[offset + 1]!);
  const u32 = (offset: number) => (little
    ? (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
    : ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return false;
  const entries = u16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return false;
    if (u16(entry) === 0x0112) {
      const orientation = u16(entry + 8);
      return orientation >= 5 && orientation <= 8;
    }
  }
  return false;
}

function jpegSize(bytes: Uint8Array): ImageSize | null {
  let offset = 2;
  let swap = false;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) { offset += 1; continue; }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (marker === 0xe1) swap = exifSwapsAxes(bytes, offset + 4, Math.min(bytes.length, offset + 2 + length));
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return swap ? valid(height, width) : valid(width, height);
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export function readDataUriImageSize(uri: string): ImageSize | null {
  const prefix = DATA_URI.exec(uri);
  if (!prefix) return null;
  const bytes = decodeBase64Prefix(uri.slice(prefix[0].length), MAX_HEADER_BYTES);
  if (!bytes || bytes.length < 10) return null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return pngSize(bytes);
  if (ascii(bytes, 0, 4) === 'GIF8') return gifSize(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return webpSize(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  return null;
}
