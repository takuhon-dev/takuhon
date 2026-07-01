import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import worker, { type Env } from '../index.js';
import { KV_KEY, type KvMetadata } from '../kv-storage.js';
import { FakeCache } from '../test-utils/fake-cache.js';
import { FakeKV } from '../test-utils/fake-kv.js';

function makeEnv(extra: Partial<Env> = {}): { env: Env; kv: FakeKV } {
  const kv = new FakeKV();
  return {
    env: {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_ADMIN_TOKEN: 'integration-token',
      ...extra,
    },
    kv,
  };
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

let fakeCache: FakeCache;

beforeEach(() => {
  fakeCache = new FakeCache();
  // The Worker reads `caches.default` from the runtime global; stub it for
  // Vitest's Node environment.
  (globalThis as unknown as { caches: { default: unknown } }).caches = {
    default: fakeCache,
  };
  vi.spyOn(console, 'log').mockImplementation(() => {
    /* swallow audit-log noise */
  });
});

afterEach(() => {
  (globalThis as unknown as { caches?: unknown }).caches = undefined;
  vi.restoreAllMocks();
});

describe('cloudflare worker — Phase 3.4 admin integration', () => {
  it('PUT /api/admin/profile writes to KV and returns the new version', async () => {
    const { env, kv } = makeEnv();
    const res = await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(exampleJson),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(typeof body.meta.version).toBe('string');
    expect(body.meta.version.length).toBeGreaterThan(0);
    expect(body.meta.schemaVersion).toBe('1.3.0');
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const stored = await kv.getWithMetadata<KvMetadata>(KV_KEY, 'json');
    expect(stored.value).not.toBeNull();
    expect((stored.value as Takuhon).profile.displayName.en).toBe('Pat Rivera');
    expect(stored.metadata?.version).toBe(body.meta.version);
  });

  it('PUT /api/admin/profile invokes caches.default.delete for the public read paths', async () => {
    const { env } = makeEnv();
    await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(exampleJson),
    });
    const urls = fakeCache.deletes;
    expect(urls).toContain('https://worker.example/');
    expect(urls).toContain('https://worker.example/api/profile');
    expect(urls).toContain('https://worker.example/api/jsonld');
    expect(urls).toContain('https://worker.example/takuhon.json');
    expect(urls).toContain('https://worker.example/api/profile?lang=en');
    expect(urls).toContain('https://worker.example/api/profile?lang=ja');
  });

  it('PUT /api/admin/profile returns 401 when TAKUHON_ADMIN_TOKEN is unset', async () => {
    const { env } = makeEnv({ TAKUHON_ADMIN_TOKEN: undefined });
    const res = await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(exampleJson),
    });
    expect(res.status).toBe(401);
  });

  it('PUT /api/admin/profile returns 403 when Origin is not in TAKUHON_ADMIN_ORIGIN', async () => {
    const { env } = makeEnv({ TAKUHON_ADMIN_ORIGIN: 'https://admin.example.com' });
    const res = await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify(exampleJson),
    });
    expect(res.status).toBe(403);
  });

  it('PUT /api/admin/profile returns 409 when If-Match does not match KV version', async () => {
    const { env, kv } = makeEnv();
    const metadata: KvMetadata = { version: 'kv-version-1', updatedAt: '2026-05-15T00:00:00Z' };
    await kv.put(KV_KEY, JSON.stringify(exampleJson), { metadata });

    const res = await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
        'if-match': '"stale"',
      },
      body: JSON.stringify(exampleJson),
    });
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.currentVersion).toBe('kv-version-1');
  });

  it('DELETE /api/admin/profile clears KV and returns 204', async () => {
    const { env, kv } = makeEnv();
    const metadata: KvMetadata = { version: 'kv-version-1', updatedAt: '2026-05-15T00:00:00Z' };
    await kv.put(KV_KEY, JSON.stringify(exampleJson), { metadata });
    expect(kv.has(KV_KEY)).toBe(true);

    const res = await call('https://worker.example/api/admin/profile', env, {
      method: 'DELETE',
      headers: { authorization: 'Bearer integration-token' },
    });
    expect(res.status).toBe(204);
    expect(kv.has(KV_KEY)).toBe(false);
  });

  it('GET /admin returns the inline HTML editor with nonce-pinned CSP', async () => {
    const { env } = makeEnv();
    const res = await call('https://worker.example/admin', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it('admin write emits structured JSON audit events to console.log', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const { env } = makeEnv();
    await call('https://worker.example/api/admin/profile', env, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer integration-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(exampleJson),
    });
    const events: { type: string }[] = [];
    for (const args of logSpy.mock.calls) {
      const first = args[0];
      if (typeof first === 'string') {
        events.push(JSON.parse(first) as { type: string });
      }
    }
    expect(events.some((e) => e.type === 'admin.auth.success')).toBe(true);
    expect(events.some((e) => e.type === 'admin.profile.update')).toBe(true);
  });

  it('public GET routes still work after admin app is mounted', async () => {
    const { env } = makeEnv();
    const res = await call('https://worker.example/api/profile', env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.meta.schemaVersion).toBe('1.3.0');
  });
});
