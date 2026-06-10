import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker, { type Env } from '../index.js';
import { FakeKV } from '../test-utils/fake-kv.js';
import { FakeR2 } from '../test-utils/fake-r2.js';

// --- minimal PNG fixture (built by hand, no real file) ----------------------

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

function makeEnv(extra: Partial<Env> = {}): { env: Env; r2: FakeR2 } {
  const r2 = new FakeR2();
  return {
    env: {
      TAKUHON_KV: new FakeKV() as unknown as KVNamespace,
      TAKUHON_ADMIN_TOKEN: 'integration-token',
      TAKUHON_R2: r2 as unknown as R2Bucket,
      ...extra,
    },
    r2,
  };
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

function uploadPng(env: Env, bytes: Uint8Array): Promise<Response> {
  const form = new FormData();
  form.set('file', new File([Uint8Array.from(bytes)], 'avatar.png', { type: 'image/png' }));
  return call('https://worker.example/api/admin/assets', env, {
    method: 'POST',
    headers: { authorization: 'Bearer integration-token' },
    body: form,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {
    /* swallow audit-log noise */
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cloudflare worker — R2 asset upload + delivery', () => {
  it('POST /api/admin/assets stores the image in R2 and returns 201 with the record', async () => {
    const { env, r2 } = makeEnv();
    const res = await uploadPng(env, png(48, 24));

    expect(res.status).toBe(201);
    const body = await res.json<{
      id: string;
      url: string;
      publicUrl: string;
      mimeType: string;
      width?: number;
      height?: number;
    }>();
    expect(body.id).toMatch(/^assets\/\d+-[0-9a-f]{4}\.png$/);
    expect(body.url).toBe(`/${body.id}`);
    expect(body.publicUrl).toBe(`https://worker.example/${body.id}`);
    expect(body.mimeType).toBe('image/png');
    expect(body.width).toBe(48);
    expect(body.height).toBe(24);
    expect(r2.has(body.id)).toBe(true);
  });

  it('GET /assets/{key} serves the bytes with nosniff and an immutable cache policy', async () => {
    const { env } = makeEnv();
    const upload = await uploadPng(env, png(48, 24));
    const { id } = await upload.json<{ id: string }>();

    const res = await call(`https://worker.example/${id}`, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('etag')).toBe(`"${id}"`);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('HEAD /assets/{key} returns the headers without a body', async () => {
    const { env } = makeEnv();
    const upload = await uploadPng(env, png(8, 8));
    const { id } = await upload.json<{ id: string }>();

    const res = await call(`https://worker.example/${id}`, env, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('');
  });

  it('GET /assets/{missing} returns 404', async () => {
    const { env } = makeEnv();
    const res = await call('https://worker.example/assets/1700000000-dead.png', env);
    expect(res.status).toBe(404);
  });

  it('keeps asset delivery locale-agnostic: /ja/assets/* is not served (404)', async () => {
    const { env } = makeEnv();
    const upload = await uploadPng(env, png(8, 8));
    const { id } = await upload.json<{ id: string }>();

    // The locale-prefixed path is left to the router, which has no matching
    // route, so it 404s rather than reaching the R2 delivery proxy.
    const res = await call(`https://worker.example/ja/${id}`, env);
    expect(res.status).toBe(404);
  });

  it('does not register the upload route when no R2 bucket is bound', async () => {
    const { env } = makeEnv({ TAKUHON_R2: undefined });
    const res = await uploadPng(env, png(8, 8));
    // With no asset store, the admin app never registers POST /assets, so the
    // request falls through to the public app's non-GET catch-all → 405 (the
    // same composition the locale-prefixed admin test documents). A valid token
    // is sent, so this is not a 401 — the upload path is simply inactive.
    expect(res.status).toBe(405);
    const body = await res.json<{ type: string }>();
    expect(body.type).toBe('https://takuhon.org/errors/method-not-allowed');
  });

  it('falls through to a JSON 404 for /assets/* when no R2 bucket is bound', async () => {
    const { env } = makeEnv({ TAKUHON_R2: undefined });
    const res = await call('https://worker.example/assets/anything.png', env);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
  });
});
