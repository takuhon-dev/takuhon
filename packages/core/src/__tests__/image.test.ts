import { describe, expect, it } from 'vitest';

import {
  detectImageMime,
  readImageInfo,
  stripImageMetadata,
  type AcceptedImageMime,
} from '../image.js';

/** Build a byte array from numbers and/or nested byte arrays. */
function bytes(...parts: (number | readonly number[] | Uint8Array)[]): Uint8Array {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') flat.push(p);
    else for (const n of p) flat.push(n);
  }
  return Uint8Array.from(flat);
}

/** ASCII string → byte array. */
function a(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

/** Latin1 decode, for substring assertions on binary output. */
function bin(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return s;
}

// --- fixtures ---------------------------------------------------------------

// JPEG: SOI, APP0 (JFIF, kept), APP1 (EXIF "GPS", dropped), SOF0 (200x100),
// SOS + entropy + EOI.
const JPEG = bytes(
  [0xff, 0xd8], // SOI
  [0xff, 0xe0, 0x00, 0x06],
  a('JFIF'), // APP0, len 6 (4 data bytes)
  [0xff, 0xe1, 0x00, 0x0b],
  a('Exif'),
  [0x00, 0x00],
  a('GPS'), // APP1, len 11
  [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x01, 0x11, 0x00, 0x00], // SOF0 h=100 w=200, len 11 = 9 data bytes
  [0xff, 0xda, 0x00, 0x04, 0x01, 0x00], // SOS header
  [0x12, 0x34], // entropy data
  [0xff, 0xd9], // EOI
);

// PNG: signature, IHDR (32x16), tEXt ("Author/Bob!", dropped), IDAT, IEND.
const PNG = bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // signature
  [0x00, 0x00, 0x00, 0x0d],
  a('IHDR'),
  [0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x10, 0x08, 0x02, 0x00, 0x00, 0x00], // 32x16…
  [0x00, 0x00, 0x00, 0x00], // IHDR CRC (not validated)
  [0x00, 0x00, 0x00, 0x0b],
  a('tEXt'),
  a('Author'),
  [0x00],
  a('Bob!'),
  [0x00, 0x00, 0x00, 0x00],
  [0x00, 0x00, 0x00, 0x02],
  a('IDAT'),
  [0x78, 0x01],
  [0x00, 0x00, 0x00, 0x00],
  [0x00, 0x00, 0x00, 0x00],
  a('IEND'),
  [0x00, 0x00, 0x00, 0x00],
);

// GIF89a: 32x16, comment ("HELLO", dropped), one image descriptor, trailer.
const GIF = bytes(
  a('GIF89a'),
  [0x20, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00], // LSD: 32x16, no GCT
  [0x21, 0xfe, 0x05],
  a('HELLO'),
  [0x00], // comment extension
  [0x2c, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x10, 0x00, 0x00], // image descriptor
  [0x02], // LZW min code size
  [0x02, 0xaa, 0xbb, 0x00], // image data sub-blocks
  [0x3b], // trailer
);

// Animated GIF: two image descriptors (frames = 2).
const GIF_ANIMATED = bytes(
  a('GIF89a'),
  [0x20, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00],
  [0x2c, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x10, 0x00, 0x00],
  [0x02],
  [0x02, 0xaa, 0xbb, 0x00],
  [0x2c, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x10, 0x00, 0x00],
  [0x02],
  [0x02, 0xcc, 0xdd, 0x00],
  [0x3b],
);

// WebP (VP8X extended, 200x100) with EXIF chunk ("SECRET", dropped) + VP8 chunk.
const WEBP = bytes(
  a('RIFF'),
  [0x36, 0x00, 0x00, 0x00],
  a('WEBP'), // RIFF size 54
  a('VP8X'),
  [0x0a, 0x00, 0x00, 0x00], // VP8X chunk, size 10
  [0x08, 0x00, 0x00, 0x00, 0xc7, 0x00, 0x00, 0x63, 0x00, 0x00], // EXIF flag, canvas 200x100
  a('VP8 '),
  [0x0a, 0x00, 0x00, 0x00],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // VP8 chunk (placeholder)
  a('EXIF'),
  [0x06, 0x00, 0x00, 0x00],
  a('SECRET'), // EXIF metadata chunk
);

// --- detectImageMime --------------------------------------------------------

describe('detectImageMime', () => {
  it('identifies the four accepted formats from magic bytes', () => {
    expect(detectImageMime(JPEG)).toBe('image/jpeg');
    expect(detectImageMime(PNG)).toBe('image/png');
    expect(detectImageMime(GIF)).toBe('image/gif');
    expect(detectImageMime(WEBP)).toBe('image/webp');
  });

  it('returns null for unsupported or unrecognized input', () => {
    expect(detectImageMime(bytes(a('<svg xmlns')))).toBeNull(); // SVG is not accepted
    expect(detectImageMime(bytes([0x00, 0x00, 0x00, 0x20], a('ftypavif')))).toBeNull(); // AVIF
    expect(detectImageMime(bytes([0x01, 0x02, 0x03, 0x04]))).toBeNull();
    expect(detectImageMime(bytes([]))).toBeNull();
  });
});

// --- readImageInfo ----------------------------------------------------------

describe('readImageInfo', () => {
  it('reads dimensions from each format header', () => {
    expect(readImageInfo(JPEG, 'image/jpeg')).toEqual({ width: 200, height: 100, frames: 1 });
    expect(readImageInfo(PNG, 'image/png')).toEqual({ width: 32, height: 16, frames: 1 });
    expect(readImageInfo(GIF, 'image/gif')).toEqual({ width: 32, height: 16, frames: 1 });
    expect(readImageInfo(WEBP, 'image/webp')).toEqual({ width: 200, height: 100, frames: 1 });
  });

  it('counts animation frames in an animated GIF', () => {
    expect(readImageInfo(GIF_ANIMATED, 'image/gif')).toEqual({ width: 32, height: 16, frames: 2 });
  });

  it('returns null when the header cannot be parsed', () => {
    expect(readImageInfo(bytes([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeNull();
  });
});

// --- stripImageMetadata -----------------------------------------------------

/** Strip, then assert the result is still the same valid image of the same size. */
function expectStillValid(
  stripped: Uint8Array,
  mime: AcceptedImageMime,
  original: Uint8Array,
): void {
  expect(detectImageMime(stripped)).toBe(mime);
  expect(readImageInfo(stripped, mime)).toEqual(readImageInfo(original, mime));
  expect(stripped.length).toBeLessThan(original.length);
}

describe('stripImageMetadata', () => {
  it('drops the JPEG APP1 (EXIF/XMP) segment but keeps APP0 and pixel data', () => {
    const out = stripImageMetadata(JPEG, 'image/jpeg');
    expect(bin(out)).not.toContain('Exif');
    expect(bin(out)).not.toContain('GPS');
    expect(bin(out)).toContain('JFIF'); // APP0 kept
    expect([...out.subarray(out.length - 2)]).toEqual([0xff, 0xd9]); // EOI preserved
    expectStillValid(out, 'image/jpeg', JPEG);
  });

  it('drops PNG text chunks but keeps IHDR/IDAT/IEND', () => {
    const out = stripImageMetadata(PNG, 'image/png');
    expect(bin(out)).not.toContain('tEXt');
    expect(bin(out)).not.toContain('Author');
    expect(bin(out)).toContain('IHDR');
    expect(bin(out)).toContain('IDAT');
    expect(bin(out)).toContain('IEND');
    expectStillValid(out, 'image/png', PNG);
  });

  it('drops GIF comment/application extensions but keeps frames', () => {
    const out = stripImageMetadata(GIF, 'image/gif');
    expect(bin(out)).not.toContain('HELLO');
    expect([...out.subarray(out.length - 1)]).toEqual([0x3b]); // trailer preserved
    expectStillValid(out, 'image/gif', GIF);
  });

  it('drops the WebP EXIF chunk and clears the VP8X EXIF flag', () => {
    const out = stripImageMetadata(WEBP, 'image/webp');
    expect(bin(out)).not.toContain('SECRET');
    expect(out[20]! & 0x08).toBe(0); // VP8X EXIF flag cleared
    expectStillValid(out, 'image/webp', WEBP);
  });

  it('preserves a clean image with no metadata (still parses, no corruption)', () => {
    const clean = stripImageMetadata(PNG, 'image/png'); // already stripped
    const again = stripImageMetadata(clean, 'image/png');
    expect(detectImageMime(again)).toBe('image/png');
    expect(readImageInfo(again, 'image/png')).toEqual({ width: 32, height: 16, frames: 1 });
    expect(again.length).toBe(clean.length); // nothing left to remove
  });
});
