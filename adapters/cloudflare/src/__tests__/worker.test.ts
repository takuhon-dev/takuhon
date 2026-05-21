import type { Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import worker, { type Env } from '../index.js';
import { KV_KEY, type KvMetadata } from '../kv-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

function makeEnv(): { env: Env; kv: FakeKV } {
  const kv = new FakeKV();
  return { env: { TAKUHON_KV: kv as unknown as KVNamespace }, kv };
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

describe('cloudflare worker — Phase 3.2', () => {
  it('GET / returns a plain-text landing page', async () => {
    const res = await call('https://worker.example/', makeEnv().env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('takuhon');
  });

  it('GET /api/profile falls back to bundled fixture when KV is empty', async () => {
    const res = await call('https://worker.example/api/profile', makeEnv().env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBeTruthy();
    expect(body.meta.locale).toBe('en');
    expect(body.meta.schemaVersion).toBe('0.1.0');
    expect(typeof body.meta.updatedAt).toBe('string');
  });

  it('GET /api/profile?lang=ja resolves Japanese content from the wrapped body', async () => {
    const res = await call('https://worker.example/api/profile?lang=ja', makeEnv().env);
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('GET /api/profile carries ETag and Cache-Control headers', async () => {
    const res = await call('https://worker.example/api/profile', makeEnv().env);
    expect(res.headers.get('etag')).toMatch(/^".+"$/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
  });

  it('GET /api/profile reads from KV when TAKUHON_DATA is populated', async () => {
    const { env, kv } = makeEnv();
    const base = exampleJson as Takuhon;
    const stored: Takuhon = {
      ...base,
      profile: {
        ...base.profile,
        displayName: { en: 'KV Source' },
      },
    };
    const metadata: KvMetadata = { version: 'kv-version-1', updatedAt: '2026-05-15T00:00:00Z' };
    await kv.put(KV_KEY, JSON.stringify(stored), { metadata });

    const res = await call('https://worker.example/api/profile', env);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('KV Source');
    expect(res.headers.get('etag')).toBe('"kv-version-1"');
  });

  it('GET /api/schema returns the JSON Schema document', async () => {
    const res = await call('https://worker.example/api/schema', makeEnv().env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.$schema).toBeTruthy();
  });

  it('GET /takuhon.json returns the raw Takuhon (no wrap, all locales embedded)', async () => {
    const res = await call('https://worker.example/takuhon.json', makeEnv().env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body: any = await res.json();
    expect(body.profile.displayName.en).toBe('Pat Rivera');
    expect(body.profile.displayName.ja).toBe('パット・リベラ');
    expect(body.data).toBeUndefined();
    expect(body.meta.contentLicense).toBeTruthy();
  });

  it('GET /takuhon.json carries ETag and Cache-Control: public, max-age=300', async () => {
    const res = await call('https://worker.example/takuhon.json', makeEnv().env);
    expect(res.headers.get('etag')).toMatch(/^".+"$/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('GET /.well-known/takuhon.json returns the 6-field metadata document', async () => {
    const res = await call('https://worker.example/.well-known/takuhon.json', makeEnv().env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.schemaVersion).toBe('0.1.0');
    expect(body.schemaUrl).toBe('/api/schema');
    expect(body.profile).toBe('/api/profile');
    expect(body.jsonld).toBe('/api/jsonld');
    expect(body.export).toBe('/api/export');
    expect(body.canonical).toBe('/takuhon.json');
  });

  it('GET /.well-known/takuhon.json carries Cache-Control: public, max-age=3600', async () => {
    const res = await call('https://worker.example/.well-known/takuhon.json', makeEnv().env);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('GET /unknown returns 404 with type=https://takuhon.dev/errors/not-found', async () => {
    const res = await call('https://worker.example/does-not-exist', makeEnv().env);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.dev/errors/not-found');
    expect(body.status).toBe(404);
    expect(body.instance).toBe('/does-not-exist');
  });

  it('POST /api/profile returns 405 with type=https://takuhon.dev/errors/method-not-allowed', async () => {
    const res = await call('https://worker.example/api/profile', makeEnv().env, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.dev/errors/method-not-allowed');
  });

  it('GET /api/jsonld returns a JSON-LD document with ProfilePage type', async () => {
    const res = await call('https://worker.example/api/jsonld', makeEnv().env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/ld\+json/);
    const body: any = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]['@type']).toBe('ProfilePage');
  });

  it('every response carries the baseline security headers including CSP', async () => {
    const res = await call('https://worker.example/api/schema', makeEnv().env);
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'self'/);
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});
