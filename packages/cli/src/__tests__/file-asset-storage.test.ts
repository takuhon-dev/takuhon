import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NotFoundError } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileTakuhonAssetStorage } from '../file-asset-storage.js';

// --- minimal image fixtures (built by hand, no real files) ------------------

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...ascii('IHDR'),
    ...u32(width),
    ...u32(height),
    0x08,
    0x02,
    0x00,
    0x00,
    0x00,
    ...u32(0),
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

function blobOf(bytes: Uint8Array, type?: string): Blob {
  return new Blob([Uint8Array.from(bytes)], type !== undefined ? { type } : undefined);
}

describe('FileTakuhonAssetStorage', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'takuhon-asset-'));
    path = join(dir, 'takuhon.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function make(opts: { publicBaseUrl?: string } = {}): FileTakuhonAssetStorage {
    return new FileTakuhonAssetStorage(path, opts);
  }

  it('writes a PNG into assets/ beside takuhon.json and returns the record', async () => {
    const storage = make();
    const bytes = png(32, 16);

    const record = await storage.putAsset(blobOf(bytes), { contentType: 'image/png' });

    expect(record.id).toMatch(/^assets\/\d+-[0-9a-f]{4}\.png$/);
    expect(record.url).toBe(`/${record.id}`);
    expect(record.mimeType).toBe('image/png');
    expect(record.size).toBe(bytes.length);
    expect(record.width).toBe(32);
    expect(record.height).toBe(16);
    expect(typeof record.createdAt).toBe('string');

    // The bytes are on disk at <dir>/assets/<filename>.
    const onDisk = await readFile(join(dir, record.id));
    expect(Array.from(onDisk)).toEqual(Array.from(bytes));
  });

  it('derives the key extension from the content-type (gif)', async () => {
    const storage = make();
    const record = await storage.putAsset(blobOf(gif(), 'image/gif'), { contentType: 'image/gif' });
    expect(record.id).toMatch(/\.gif$/);
    expect(record.mimeType).toBe('image/gif');
  });

  it('authenticates the type from the bytes when no content-type is given', async () => {
    const storage = make();
    const record = await storage.putAsset(blobOf(png(8, 8)));
    expect(record.id).toMatch(/\.png$/);
    expect(record.mimeType).toBe('image/png');
  });

  it('builds an absolute publicUrl from publicBaseUrl while url stays relative', async () => {
    const storage = make({ publicBaseUrl: 'http://127.0.0.1:4322' });
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    expect(record.url).toBe(`/${record.id}`);
    expect(record.publicUrl).toBe(`http://127.0.0.1:4322/${record.id}`);
  });

  it('falls back to a relative publicUrl when no base URL is configured', async () => {
    const storage = make();
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    expect(record.publicUrl).toBe(record.url);
  });

  it('getPublicUrl resolves for a stored asset and rejects for a missing one', async () => {
    const storage = make({ publicBaseUrl: 'http://127.0.0.1:4322' });
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });

    await expect(storage.getPublicUrl(record.id)).resolves.toBe(
      `http://127.0.0.1:4322/${record.id}`,
    );
    await expect(storage.getPublicUrl('assets/does-not-exist.png')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('deleteAsset removes a stored asset and is idempotent for a missing key', async () => {
    const storage = make();
    const record = await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });

    await storage.deleteAsset(record.id);
    await expect(storage.getPublicUrl(record.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(storage.deleteAsset('assets/gone.png')).resolves.toBeUndefined();
  });

  it('listAssets returns every stored asset with a MIME derived from the extension', async () => {
    const storage = make({ publicBaseUrl: 'http://127.0.0.1:4322' });
    await storage.putAsset(blobOf(png(4, 4)), { contentType: 'image/png' });
    await storage.putAsset(blobOf(gif(), 'image/gif'), { contentType: 'image/gif' });

    const listed = await storage.listAssets();
    expect(listed).toHaveLength(2);
    expect(listed.map((r) => r.mimeType).sort()).toEqual(['image/gif', 'image/png']);
    for (const record of listed) {
      expect(record.id).toMatch(/^assets\//);
      expect(record.publicUrl).toBe(`http://127.0.0.1:4322/${record.id}`);
      expect(record.size).toBeGreaterThan(0);
    }
  });

  it('listAssets returns an empty list when no assets directory exists', async () => {
    const storage = make();
    await expect(storage.listAssets()).resolves.toEqual([]);
  });

  it('readForServing returns the bytes and content-type, or null when absent', async () => {
    const storage = make();
    const bytes = png(8, 8);
    const record = await storage.putAsset(blobOf(bytes), { contentType: 'image/png' });

    const served = storage.readForServing(record.id);
    expect(served?.contentType).toBe('image/png');
    expect(served && Array.from(served.bytes)).toEqual(Array.from(bytes));
    expect(storage.readForServing('assets/missing.png')).toBeNull();
  });

  it('refuses path traversal out of the assets directory', async () => {
    // A secret beside takuhon.json must never be reachable through an asset key.
    await writeFile(join(dir, 'secret.txt'), 'top secret', 'utf8');
    const storage = make();
    expect(storage.readForServing('assets/../secret.txt')).toBeNull();
    await expect(storage.getPublicUrl('assets/../secret.txt')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
