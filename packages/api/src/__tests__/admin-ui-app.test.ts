import { describe, expect, it } from 'vitest';

import { createAdminUiApp } from '../admin/admin-ui-app.js';

function fetchPath(app: ReturnType<typeof createAdminUiApp>, path: string): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://x${path}`)));
}

function extractScriptNonce(csp: string): string | undefined {
  const m = /script-src 'self' 'nonce-([^']+)'/.exec(csp);
  return m?.[1];
}

describe('createAdminUiApp', () => {
  it('GET / returns 200 with text/html body', async () => {
    const app = createAdminUiApp();
    const res = await fetchPath(app, '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('<title>meport admin</title>');
  });

  it('attaches an admin CSP with matching nonces on script-src and style-src', async () => {
    const app = createAdminUiApp();
    const res = await fetchPath(app, '/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
    const nonce = extractScriptNonce(csp);
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce!}'`);
    const html = await res.text();
    expect(html).toContain(`<style nonce="${nonce!}">`);
    expect(html).toContain(`<script nonce="${nonce!}">`);
  });

  it('does not include unsafe-inline in style-src or script-src', async () => {
    const app = createAdminUiApp();
    const res = await fetchPath(app, '/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it('sets Cache-Control: private, no-store', async () => {
    const app = createAdminUiApp();
    const res = await fetchPath(app, '/');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('generates a fresh nonce per request', async () => {
    const app = createAdminUiApp();
    const r1 = await fetchPath(app, '/');
    const r2 = await fetchPath(app, '/');
    const n1 = extractScriptNonce(r1.headers.get('content-security-policy') ?? '');
    const n2 = extractScriptNonce(r2.headers.get('content-security-policy') ?? '');
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1).not.toBe(n2);
  });
});
