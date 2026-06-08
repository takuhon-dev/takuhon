import { describe, expect, it } from 'vitest';

import worker, { type Env } from '../index.js';
import { FakeKV } from '../test-utils/fake-kv.js';

interface AssetFile {
  body: string;
  contentType: string;
}

/** Fake Workers Assets binding that records the paths it is asked for. */
function fakeAssets(files: Record<string, AssetFile>): { assets: Fetcher; requested: string[] } {
  const requested: string[] = [];
  const assets = {
    fetch: (input: RequestInfo | URL): Promise<Response> => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pathname = new URL(href).pathname;
      requested.push(pathname);
      // Mirror Workers Assets: `/` resolves to the bundle's index.html.
      const file = files[pathname] ?? (pathname === '/' ? files['/index.html'] : undefined);
      if (!file) return Promise.resolve(new Response('not found', { status: 404 }));
      return Promise.resolve(
        new Response(file.body, {
          status: 200,
          headers: {
            'content-type': file.contentType,
            'cache-control': 'public, max-age=3600',
            etag: '"asset-hash"',
          },
        }),
      );
    },
  } as Fetcher;
  return { assets, requested };
}

const BUNDLE: Record<string, AssetFile> = {
  '/index.html': { body: '<!doctype html><title>takuhon admin</title>', contentType: 'text/html' },
  '/assets/app.js': { body: 'console.log(1)', contentType: 'application/javascript' },
};

function envWith(assets?: Fetcher): Env {
  return { TAKUHON_KV: new FakeKV() as unknown as KVNamespace, ASSETS: assets };
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

describe('cloudflare worker — admin SPA serving (ASSETS bound)', () => {
  it('serves index.html for /admin and /admin/ under the strict admin CSP', async () => {
    for (const path of ['/admin', '/admin/']) {
      const { assets, requested } = fakeAssets(BUNDLE);
      const res = await call(`https://worker.example${path}`, envWith(assets));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('takuhon admin');
      expect(requested).toEqual(['/']);

      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("require-trusted-types-for 'script'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('nonce-');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      // The binding's ETag is dropped — meaningless alongside no-store.
      expect(res.headers.get('etag')).toBeNull();
    }
  });

  it('strips the /admin prefix when resolving nested assets', async () => {
    const { assets, requested } = fakeAssets(BUNDLE);
    const res = await call('https://worker.example/admin/assets/app.js', envWith(assets));
    expect(res.status).toBe(200);
    expect(requested).toEqual(['/assets/app.js']);
    // The strict CSP is applied to every admin response, not just the HTML.
    expect(res.headers.get('content-security-policy')).toContain(
      "require-trusted-types-for 'script'",
    );
  });

  it('does not shadow the public "/" route', async () => {
    const { assets } = fakeAssets(BUNDLE);
    const res = await call('https://worker.example/', envWith(assets));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('takuhon');
  });

  it('still routes /api/admin/* to the admin API (not the SPA)', async () => {
    const { assets, requested } = fakeAssets(BUNDLE);
    const res = await call('https://worker.example/api/admin/export', envWith(assets), {
      headers: { authorization: 'Bearer nope' },
    });
    // No token configured → admin API answers 401; the SPA was never consulted.
    expect(res.status).toBe(401);
    expect(requested).toEqual([]);
  });

  it('returns 405 for a non-GET request to an admin UI path', async () => {
    const { assets } = fakeAssets(BUNDLE);
    const res = await call('https://worker.example/admin', envWith(assets), { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('cloudflare worker — admin UI fallback (ASSETS absent)', () => {
  it('serves the inline editor at /admin when no assets binding is configured', async () => {
    const res = await call('https://worker.example/admin', envWith(undefined));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    // The inline editor uses a per-request nonce; both CSP variants keep
    // Trusted Types enforced.
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain('nonce-');
  });
});
