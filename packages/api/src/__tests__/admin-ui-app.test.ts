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
    expect(html).toContain('<title>takuhon admin</title>');
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

  it('loads the editor from the authenticated full export, not the public profile', async () => {
    // The editor must edit the true source. /api/admin/export returns the full
    // unfiltered document (token-gated); the public /takuhon.json is privacy-
    // filtered and would drop non-public data on Save, so it must not be the
    // editor source.
    const app = createAdminUiApp();
    const html = await (await fetchPath(app, '/')).text();
    expect(html).toContain("fetch('/api/admin/export'");
    expect(html).not.toContain("fetch('/takuhon.json'");
  });

  it('does not auto-load profile data before the admin token is entered', async () => {
    // Token-first: nothing about the profile is fetched on page open. The only
    // call to loadCurrent() is the Load button listener, never a bare top-level
    // invocation.
    const app = createAdminUiApp();
    const html = await (await fetchPath(app, '/')).text();
    expect(html).toContain("addEventListener('click', loadCurrent)");
    expect(html).not.toMatch(/\n\s*loadCurrent\(\);/);
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
