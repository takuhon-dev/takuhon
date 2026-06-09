import { MAX_IMAGE_BYTES } from '@takuhon/core';
import { describe, expect, it, vi } from 'vitest';

import { createAdminApiApp } from '../admin/admin-api-app.js';
import { noopAuditLogger, type AuditLogger } from '../admin/audit-logger.js';
import { noopCachePurger } from '../admin/cache-purger.js';
import { FakeAssetStorage, FakeStorage } from '../test-utils/fake-storage.js';

// --- minimal image fixtures (built by hand, no real files) ------------------

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];

/** A minimal PNG of the given dimensions, optionally carrying a tEXt chunk. */
function png(width: number, height: number, withText = false): Uint8Array {
  const parts: number[] = [
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
  ];
  if (withText) {
    const data = ascii('Comment\x00secret-exif');
    parts.push(...u32(data.length), ...ascii('tEXt'), ...data, ...u32(0));
  }
  parts.push(...u32(2), ...ascii('IDAT'), 0x78, 0x01, ...u32(0));
  parts.push(...u32(0), ...ascii('IEND'), ...u32(0));
  return Uint8Array.from(parts);
}

/** A GIF (32x16) with `frames` image descriptors. */
function gif(frames: number): Uint8Array {
  const parts: number[] = [...ascii('GIF89a'), 0x20, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00];
  for (let i = 0; i < frames; i++) {
    parts.push(
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
    );
  }
  parts.push(0x3b);
  return Uint8Array.from(parts);
}

function bin(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return s;
}

// --- harness ----------------------------------------------------------------

function makeApp(opts: { auditLogger?: AuditLogger; withAssets?: boolean } = {}): {
  app: ReturnType<typeof createAdminApiApp>;
  assetStorage: FakeAssetStorage;
} {
  const assetStorage = new FakeAssetStorage();
  const app = createAdminApiApp({
    storage: new FakeStorage(),
    assetStorage: opts.withAssets === false ? undefined : assetStorage,
    getAdminToken: () => 'test-token',
    getAdminOrigins: () => [],
    cachePurger: noopCachePurger,
    auditLogger: opts.auditLogger ?? noopAuditLogger,
  });
  return { app, assetStorage };
}

function upload(
  app: ReturnType<typeof createAdminApiApp>,
  bytes: Uint8Array,
  opts: { filename?: string; type?: string; token?: string | null } = {},
): Promise<Response> {
  const form = new FormData();
  form.set(
    'file',
    new File([Uint8Array.from(bytes)], opts.filename ?? 'a.png', {
      type: opts.type ?? 'image/png',
    }),
  );
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? 'test-token' : opts.token;
  if (token) headers.authorization = `Bearer ${token}`;
  return Promise.resolve(
    app.fetch(new Request('https://x/assets', { method: 'POST', headers, body: form })),
  );
}

// --- tests ------------------------------------------------------------------

describe('createAdminApiApp POST /assets', () => {
  it('stores a valid image and returns 201 with the AssetRecord', async () => {
    const { app, assetStorage } = makeApp();
    const res = await upload(app, png(32, 16));

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      url: string;
      publicUrl: string;
      mimeType: string;
    };
    expect(body.mimeType).toBe('image/png');
    expect(body.url).toBe(`/assets/${body.id}`);
    expect(assetStorage.stored).toHaveLength(1);
  });

  it('authenticates the type from bytes, not the declared Content-Type', async () => {
    const { app } = makeApp();
    // Declared as octet-stream, but the bytes are a PNG.
    const res = await upload(app, png(32, 16), { type: 'application/octet-stream' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { mimeType: string }).mimeType).toBe('image/png');
  });

  it('strips metadata before handing the bytes to storage', async () => {
    const { app, assetStorage } = makeApp();
    await upload(app, png(32, 16, true));
    const stored = bin(assetStorage.stored[0]!.bytes);
    expect(stored).not.toContain('tEXt');
    expect(stored).not.toContain('secret-exif');
  });

  it('rejects a non-image with 415', async () => {
    const { app } = makeApp();
    const res = await upload(app, Uint8Array.from(ascii('not an image at all')), {
      type: 'image/png',
    });
    expect(res.status).toBe(415);
  });

  it('rejects oversized dimensions with 422', async () => {
    const { app } = makeApp();
    const res = await upload(app, png(5000, 10));
    expect(res.status).toBe(422);
  });

  it('rejects too many animation frames with 422', async () => {
    const { app } = makeApp();
    const res = await upload(app, gif(101), { filename: 'a.gif', type: 'image/gif' });
    expect(res.status).toBe(422);
  });

  it('rejects an oversized file with 413', async () => {
    const { app } = makeApp();
    const res = await upload(app, new Uint8Array(MAX_IMAGE_BYTES + 1));
    expect(res.status).toBe(413);
  });

  it('rejects a request with no file field with 400', async () => {
    const { app } = makeApp();
    const form = new FormData();
    form.set('notfile', 'x');
    const res = await app.fetch(
      new Request('https://x/assets', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token' },
        body: form,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('emits an admin.asset.upload audit event', async () => {
    const auditLogger = vi.fn();
    const { app } = makeApp({ auditLogger });
    await upload(app, png(32, 16));
    expect(auditLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.asset.upload',
        result: expect.objectContaining({ status: 201 }),
        asset: expect.objectContaining({ mimeType: 'image/png' }),
      }),
    );
  });

  it('requires a bearer token (401)', async () => {
    const { app } = makeApp();
    const res = await upload(app, png(32, 16), { token: null });
    expect(res.status).toBe(401);
  });

  it('is not registered when no asset store is configured (404)', async () => {
    const { app } = makeApp({ withAssets: false });
    const res = await upload(app, png(32, 16));
    expect(res.status).toBe(404);
  });
});
