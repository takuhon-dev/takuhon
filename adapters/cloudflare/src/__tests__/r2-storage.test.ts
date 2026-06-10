import { NotFoundError } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { R2TakuhonAssetStorage } from '../r2-storage.js';
import { FakeR2 } from '../test-utils/fake-r2.js';

// --- minimal image fixtures (built by hand, no real files) ------------------

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

/** A minimal PNG of the given dimensions. */
function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // signature
    ...u32(13),
    ...ascii('IHDR'),
    ...u32(width),
    ...u32(height),
    0x08,
    0x02,
    0x00,
    0x00,
    0x00,
    ...u32(0), // IHDR CRC
    ...u32(2),
    ...ascii('IDAT'),
    0x78,
    0x01,
    ...u32(0),
    ...u32(0),
    ...ascii('IEND'),
    ...u32(0),
  ]);
}

/** A still GIF (32x16) with a single image descriptor. */
function gif(): Uint8Array {
  return Uint8Array.from([
    ...ascii('GIF89a'),
    0x20,
    0x00,
    0x10,
    0x00,
    0x00,
    0x00,
    0x00,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x20,
    0x00,
    0x10,
    0x00,
    0x00,
    0x02,
    0x02,
    0xaa,
    0xbb,
    0x00,
    0x3b,
  ]);
}

function makeStorage(opts: { publicBaseUrl?: string } = {}): {
  storage: R2TakuhonAssetStorage;
  r2: FakeR2;
} {
  const r2 = new FakeR2();
  const storage = new R2TakuhonAssetStorage(r2 as unknown as R2Bucket, opts);
  return { storage, r2 };
}

function blobOf(bytes: Uint8Array, type?: string): Blob {
  return new Blob([Uint8Array.from(bytes)], type !== undefined ? { type } : undefined);
}

// --- tests ------------------------------------------------------------------

describe('R2TakuhonAssetStorage', () => {
  it('stores a PNG under an assets/{timestamp}-{hash}.{ext} key and returns the record', async () => {
    const { storage, r2 } = makeStorage();
    const bytes = png(32, 16);

    const record = await storage.putAsset(blobOf(bytes), { contentType: 'image/png' });

    expect(record.id).toMatch(/^assets\/\d+-[0-9a-f]{4}\.png$/);
    expect(record.url).toBe(`/${record.id}`);
    expect(record.mimeType).toBe('image/png');
    expect(record.size).toBe(bytes.length);
    expect(record.width).toBe(32);
    expect(record.height).toBe(16);
    expect(typeof record.createdAt).toBe('string');

    expect(r2.has(record.id)).toBe(true);
    expect(Array.from(r2.bytesAt(record.id)!)).toEqual(Array.from(bytes));
  });

  it('records the content-type on the stored object so delivery can echo it', async () => {
    const { storage, r2 } = makeStorage();
    const record = await storage.putAsset(blobOf(gif(), 'image/gif'), { contentType: 'image/gif' });
    expect(record.id).toMatch(/\.gif$/);
    expect(record.mimeType).toBe('image/gif');
    // listAssets reads the stored httpMetadata back out.
    const [listed] = await storage.listAssets();
    expect(listed?.mimeType).toBe('image/gif');
    expect(r2.has(record.id)).toBe(true);
  });

  it('authenticates the type from the bytes when no contentType option is given', async () => {
    const { storage } = makeStorage();
    // A bare Blob with no declared type: the adapter falls back to magic-byte
    // detection, so a PNG still yields a `.png` key and `image/png` MIME.
    const record = await storage.putAsset(blobOf(png(8, 8)));
    expect(record.id).toMatch(/\.png$/);
    expect(record.mimeType).toBe('image/png');
  });

  it('builds an absolute publicUrl from publicBaseUrl while url stays relative', async () => {
    const { storage } = makeStorage({ publicBaseUrl: 'https://worker.example' });
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    expect(record.url).toBe(`/${record.id}`);
    expect(record.publicUrl).toBe(`https://worker.example/${record.id}`);
  });

  it('falls back to a relative publicUrl when no base URL is configured', async () => {
    const { storage } = makeStorage();
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    expect(record.publicUrl).toBe(record.url);
  });

  it('getPublicUrl resolves for a stored asset and rejects for a missing one', async () => {
    const { storage } = makeStorage({ publicBaseUrl: 'https://worker.example' });
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });

    await expect(storage.getPublicUrl(record.id)).resolves.toBe(
      `https://worker.example/${record.id}`,
    );
    await expect(storage.getPublicUrl('assets/does-not-exist.png')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('deleteAsset removes a stored asset and is idempotent for a missing key', async () => {
    const { storage, r2 } = makeStorage();
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    expect(r2.has(record.id)).toBe(true);

    await storage.deleteAsset(record.id);
    expect(r2.has(record.id)).toBe(false);

    // Deleting an absent key must not throw.
    await expect(storage.deleteAsset('assets/gone.png')).resolves.toBeUndefined();
  });

  it('listAssets returns every stored asset under the assets/ prefix', async () => {
    const { storage } = makeStorage({ publicBaseUrl: 'https://worker.example' });
    await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    await storage.putAsset(blobOf(gif(), 'image/gif'), { contentType: 'image/gif' });

    const listed = await storage.listAssets();
    expect(listed).toHaveLength(2);
    for (const record of listed) {
      expect(record.id).toMatch(/^assets\//);
      expect(record.url).toBe(`/${record.id}`);
      expect(record.publicUrl).toBe(`https://worker.example/${record.id}`);
      expect(record.size).toBeGreaterThan(0);
    }
  });
});
