/**
 * Image-asset helpers for uploaded media (avatars, project images): magic-byte
 * type detection, header-only dimension / frame reading, and metadata stripping
 * (EXIF / IPTC / XMP / color profile) for the four MIME types takuhon accepts.
 *
 * Every function parses only the container structure — it never decodes pixel
 * data — so the module is tiny, dependency-free, and runs identically on
 * Cloudflare Workers, Node, and in the browser. This is the deliberate
 * "no codec, no re-encode" approach: `security.md` §4 requires metadata removal
 * for privacy (EXIF GPS / device data on avatars) but leaves resizing to the UI
 * (§4.3 "aspect ratio cropped UI-side"), so no image codec is needed.
 *
 * AVIF is intentionally not handled yet — its ISO-BMFF metadata layout is more
 * involved — so {@link detectImageMime} returns `null` for it and uploads of it
 * are rejected until a later phase adds support.
 *
 * The functions assume well-formed input only as far as security requires:
 * {@link detectImageMime} authenticates the type from the leading bytes (so a
 * spoofed `Content-Type` cannot smuggle, say, an SVG), {@link readImageInfo}
 * returns `null` when it cannot find the dimensions, and
 * {@link stripImageMetadata} preserves the pixel data while dropping metadata
 * segments. A truncated or malformed file is the uploader's problem — the bytes
 * are stored and served verbatim, never decoded server-side.
 */

/** MIME types accepted for uploaded images (`security.md` §4.1, minus AVIF). */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/** Maximum accepted upload size, in bytes (`security.md` §4.3). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Maximum accepted width or height, in pixels (`security.md` §4.3). */
export const MAX_IMAGE_DIMENSION = 4096;

/** Maximum accepted animation frame count (`security.md` §4.4). */
export const MAX_IMAGE_FRAMES = 100;

/** Canonical file extension per accepted MIME, used in object keys. */
export const IMAGE_EXTENSIONS: Record<AcceptedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Dimensions and animation frame count read from an image's container header. */
export interface ImageInfo {
  width: number;
  height: number;
  /** 1 for a still image; the frame count for an animated GIF / WebP / APNG. */
  frames: number;
}

// --- byte readers -----------------------------------------------------------

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}

function u32be(b: Uint8Array, o: number): number {
  // `>>> 0` keeps the result an unsigned 32-bit integer.
  return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

function u24le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

/** Read `len` bytes at `o` as ASCII. */
function ascii(b: Uint8Array, o: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[o + i]!);
  return s;
}

function startsWith(b: Uint8Array, sig: readonly number[]): boolean {
  if (b.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
  return true;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// --- magic-byte detection ---------------------------------------------------

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isJpeg(b: Uint8Array): boolean {
  return startsWith(b, JPEG_SIG);
}

function isPng(b: Uint8Array): boolean {
  return startsWith(b, PNG_SIG);
}

function isGif(b: Uint8Array): boolean {
  // "GIF87a" or "GIF89a".
  return (
    b.length >= 6 && ascii(b, 0, 4) === 'GIF8' && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  );
}

function isWebp(b: Uint8Array): boolean {
  return b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP';
}

/**
 * Identify an accepted image type from its leading bytes, independent of any
 * declared `Content-Type` (`security.md` §4.2). Returns `null` for unrecognized
 * or unsupported (e.g. AVIF, SVG) input.
 */
export function detectImageMime(bytes: Uint8Array): AcceptedImageMime | null {
  if (isJpeg(bytes)) return 'image/jpeg';
  if (isPng(bytes)) return 'image/png';
  if (isGif(bytes)) return 'image/gif';
  if (isWebp(bytes)) return 'image/webp';
  return null;
}

// --- dimension / frame reading ----------------------------------------------

/** True for a JPEG Start-Of-Frame marker (SOF0–SOF15, excluding DHT/JPG/DAC). */
function isJpegSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegInfo(b: Uint8Array): ImageInfo | null {
  let i = 2; // skip SOI
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    let marker = b[i + 1]!;
    // Collapse marker fill bytes (a run of 0xFF).
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1]!;
    }
    i += 2;
    // Standalone markers (no length): SOI, EOI, RSTn, TEM.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      continue;
    }
    if (marker === 0xda) break; // SOS — entropy-coded data follows
    if (i + 1 >= b.length) break;
    const len = u16be(b, i);
    if (isJpegSof(marker)) {
      // [length(2)][precision(1)][height(2)][width(2)]
      if (i + 6 >= b.length) return null;
      return { height: u16be(b, i + 3), width: u16be(b, i + 5), frames: 1 };
    }
    i += len;
  }
  return null;
}

function readPngInfo(b: Uint8Array): ImageInfo | null {
  // IHDR is the first chunk: [len(4)]["IHDR"(4)][width(4)][height(4)]…
  if (b.length < 24) return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  let frames = 1;
  // APNG declares its frame count in an acTL chunk before the first IDAT.
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    if (type === 'acTL') {
      frames = u32be(b, o + 8);
      break;
    }
    if (type === 'IDAT' || type === 'IEND') break;
    o += 12 + len;
  }
  return { width, height, frames };
}

/** Skip a run of GIF sub-blocks (each `[len][len bytes]`, terminated by 0x00). */
function skipGifSubBlocks(b: Uint8Array, o: number): number {
  while (o < b.length) {
    const len = b[o]!;
    o += 1;
    if (len === 0) break;
    o += len;
  }
  return o;
}

function readGifInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 13) return null;
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  // Logical Screen Descriptor packed field at offset 10; bit 7 = global color
  // table present, low 3 bits = its size exponent.
  const packed = b[10]!;
  let o = 13;
  if (packed & 0x80) o += 3 * (1 << ((packed & 0x07) + 1)); // skip global color table
  let frames = 0;
  while (o < b.length) {
    const block = b[o]!;
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      // Extension: introducer, label, then sub-blocks.
      o = skipGifSubBlocks(b, o + 2);
    } else if (block === 0x2c) {
      // Image Descriptor: 0x2C + 9 bytes; optional local color table; LZW min
      // code size; image data sub-blocks.
      frames += 1;
      const localPacked = b[o + 9]!;
      o += 10;
      if (localPacked & 0x80) o += 3 * (1 << ((localPacked & 0x07) + 1));
      o += 1; // LZW minimum code size
      o = skipGifSubBlocks(b, o);
    } else {
      break; // unexpected byte — stop defensively
    }
  }
  return { width, height, frames: Math.max(frames, 1) };
}

function readWebpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 16) return null;
  const format = ascii(b, 12, 4); // first chunk's FourCC
  if (format === 'VP8X') {
    // Extended: flags(1) + reserved(3) + canvasW-1(3 LE) + canvasH-1(3 LE).
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    const animated = (b[20]! & 0x02) !== 0; // ANIM flag
    let frames = 1;
    if (animated) {
      frames = 0;
      let o = 12;
      while (o + 8 <= b.length) {
        const fourcc = ascii(b, o, 4);
        const size = u32le(b, o + 4);
        if (fourcc === 'ANMF') frames += 1;
        o += 8 + size + (size & 1); // chunks are padded to even length
      }
      frames = Math.max(frames, 1);
    }
    return { width, height, frames };
  }
  if (format === 'VP8 ') {
    // Lossy: after the chunk header, frame tag(3) + start code 9D 01 2A, then
    // 14-bit width and height (little-endian) at data+6 / data+8.
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return { width, height, frames: 1 };
  }
  if (format === 'VP8L') {
    // Lossless: signature 0x2F at data+0, then 32 bits LE holding
    // (width-1):14, (height-1):14, …
    const bits = u32le(b, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height, frames: 1 };
  }
  return null;
}

/**
 * Read an image's dimensions and animation frame count from its container
 * header alone (no pixel decode). Returns `null` when the structure cannot be
 * parsed. `mime` must come from {@link detectImageMime}.
 */
export function readImageInfo(bytes: Uint8Array, mime: AcceptedImageMime): ImageInfo | null {
  switch (mime) {
    case 'image/jpeg':
      return readJpegInfo(bytes);
    case 'image/png':
      return readPngInfo(bytes);
    case 'image/gif':
      return readGifInfo(bytes);
    case 'image/webp':
      return readWebpInfo(bytes);
  }
}

// --- metadata stripping -----------------------------------------------------

function stripJpegMetadata(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) break;
    let marker = b[i + 1]!;
    let markerStart = i;
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1]!;
    }
    // Preserve any fill bytes that preceded the marker.
    if (i !== markerStart) out.push(b.subarray(markerStart, i));
    markerStart = i;
    i += 2;
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(b.subarray(markerStart, i)); // standalone marker, keep
      continue;
    }
    if (marker === 0xda) {
      // SOS: copy the marker and all remaining entropy-coded data + EOI.
      out.push(b.subarray(markerStart));
      break;
    }
    if (i + 1 >= b.length) {
      out.push(b.subarray(markerStart));
      break;
    }
    const len = u16be(b, i);
    const segmentEnd = i + len;
    // Drop EXIF/XMP (APP1), ICC color profile (APP2), IPTC/Photoshop (APP13),
    // and comments (COM). Keep APP0 (JFIF) and everything else.
    const isMetadata = marker === 0xe1 || marker === 0xe2 || marker === 0xed || marker === 0xfe;
    if (!isMetadata) out.push(b.subarray(markerStart, segmentEnd));
    i = segmentEnd;
  }
  return concat(out);
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

function stripPngMetadata(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)]; // signature
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32be(b, o);
    const type = ascii(b, o + 4, 4);
    const end = o + 12 + len; // len + type(4) + data + CRC(4)
    if (end > b.length) {
      out.push(b.subarray(o)); // truncated — copy the rest verbatim
      break;
    }
    if (!PNG_METADATA_CHUNKS.has(type)) out.push(b.subarray(o, end));
    o = end;
  }
  return concat(out);
}

function stripGifMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 13) return b;
  const packed = b[10]!;
  let headerEnd = 13;
  if (packed & 0x80) headerEnd += 3 * (1 << ((packed & 0x07) + 1));
  const out: Uint8Array[] = [b.subarray(0, headerEnd)];
  let o = headerEnd;
  while (o < b.length) {
    const block = b[o]!;
    if (block === 0x3b) {
      out.push(b.subarray(o, o + 1)); // trailer
      break;
    }
    if (block === 0x21) {
      const label = b[o + 1]!;
      const blockEnd = skipGifSubBlocks(b, o + 2);
      // Drop Comment (0xFE) and Application (0xFF) extensions — the latter
      // carries XMP. Keep Graphic Control (0xF9) and Plain Text (0x01).
      const isMetadata = label === 0xfe || label === 0xff;
      if (!isMetadata) out.push(b.subarray(o, blockEnd));
      o = blockEnd;
    } else if (block === 0x2c) {
      const localPacked = b[o + 9]!;
      let dataStart = o + 10;
      if (localPacked & 0x80) dataStart += 3 * (1 << ((localPacked & 0x07) + 1));
      dataStart += 1; // LZW minimum code size
      const blockEnd = skipGifSubBlocks(b, dataStart);
      out.push(b.subarray(o, blockEnd)); // image data, keep
      o = blockEnd;
    } else {
      out.push(b.subarray(o)); // unexpected — copy the rest verbatim
      break;
    }
  }
  return concat(out);
}

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ', 'ICCP']);

function stripWebpMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 12) return b;
  const chunks: Uint8Array[] = [];
  let o = 12;
  while (o + 8 <= b.length) {
    const fourcc = ascii(b, o, 4);
    const size = u32le(b, o + 4);
    const padded = size + (size & 1);
    const end = o + 8 + padded;
    if (end > b.length) {
      chunks.push(b.subarray(o)); // truncated — copy verbatim
      break;
    }
    if (!WEBP_METADATA_CHUNKS.has(fourcc)) chunks.push(b.subarray(o, end));
    o = end;
  }
  const body = concat(chunks);
  // Rebuild the RIFF header with the new body length, and clear the EXIF/XMP/
  // ICCP flag bits in any VP8X chunk so the header matches the dropped chunks.
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12), 0);
  out.set(body, 12);
  out[4] = (4 + body.length) & 0xff;
  out[5] = ((4 + body.length) >> 8) & 0xff;
  out[6] = ((4 + body.length) >> 16) & 0xff;
  out[7] = ((4 + body.length) >> 24) & 0xff;
  if (ascii(out, 12, 4) === 'VP8X') {
    // VP8X flags byte at offset 20: clear ICCP (bit5), EXIF (bit3), XMP (bit2).
    out[20] = out[20]! & ~0b0010_1100;
  }
  return out;
}

/**
 * Remove metadata (EXIF / IPTC / XMP / embedded color profile / comments) from
 * an image while preserving its pixel data, by editing only the container
 * structure (`security.md` §4.5). `mime` must come from {@link detectImageMime}.
 * Returns the original bytes unchanged when there is no metadata to remove.
 */
export function stripImageMetadata(bytes: Uint8Array, mime: AcceptedImageMime): Uint8Array {
  switch (mime) {
    case 'image/jpeg':
      return stripJpegMetadata(bytes);
    case 'image/png':
      return stripPngMetadata(bytes);
    case 'image/gif':
      return stripGifMetadata(bytes);
    case 'image/webp':
      return stripWebpMetadata(bytes);
  }
}
