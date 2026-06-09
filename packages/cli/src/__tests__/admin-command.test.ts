import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAdminApp, runAdmin } from '../admin-command.js';
import { renderTakuhonJson } from '../scaffold/takuhon-json.js';

const TOKEN = 'test-admin-token';

function capture(): {
  out: string[];
  err: string[];
  deps: { stdout: (s: string) => void; stderr: (s: string) => void };
} {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

describe('createAdminApp() request handling', () => {
  let dir: string;
  let path: string;
  let bundleDir: string;
  let app: Hono;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'takuhon-admin-'));
    path = join(dir, 'takuhon.json');
    await writeFile(path, renderTakuhonJson({ spdxId: 'CC0-1.0' }), 'utf8');

    // Stand-in admin bundle so /admin serving is hermetic (no real build needed).
    bundleDir = join(dir, 'bundle');
    await mkdir(join(bundleDir, 'assets'), { recursive: true });
    await writeFile(join(bundleDir, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');
    await writeFile(join(bundleDir, 'assets', 'app.js'), 'console.log("admin");', 'utf8');

    app = createAdminApp({ path, token: TOKEN, bundleDir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const req = (p: string, init?: RequestInit): Promise<Response> =>
    Promise.resolve(app.fetch(new Request(`http://127.0.0.1${p}`, init)));
  const auth = { authorization: `Bearer ${TOKEN}` };

  it('GET /api/admin/export → 401 without a token', async () => {
    expect((await req('/api/admin/export')).status).toBe(401);
  });

  it('GET /api/admin/export → 200 with an ETag and the stored document', async () => {
    const res = await req('/api/admin/export', { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    const body = (await res.json()) as { profile?: unknown };
    expect(body.profile).toBeDefined();
  });

  it('PUT /api/admin/profile → 422 on an invalid body', async () => {
    const res = await req('/api/admin/profile', {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(422);
  });

  it('PUT /api/admin/profile → 200 writes the file', async () => {
    const exported = await req('/api/admin/export', { headers: auth });
    const etag = exported.headers.get('etag')!;
    const body = (await exported.json()) as { profile: { displayName: Record<string, string> } };
    body.profile.displayName.en = 'Edited Name';

    const res = await req('/api/admin/profile', {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'application/json', 'if-match': etag },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await readFile(path, 'utf8')).toContain('Edited Name');
  });

  it('PUT /api/admin/profile → 409 on a stale If-Match', async () => {
    const exported = await req('/api/admin/export', { headers: auth });
    const body = await exported.json();
    const res = await req('/api/admin/profile', {
      method: 'PUT',
      headers: { ...auth, 'content-type': 'application/json', 'if-match': '"stale"' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(409);
  });

  it('serves the admin SPA at /admin under a strict, loopback-appropriate CSP', async () => {
    const res = await req('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers.get('strict-transport-security')).toBeNull();
    expect(res.headers.get('etag')).toBeNull();
    expect(await res.text()).toContain('id="root"');
  });

  it('serves admin assets and 404s a missing asset', async () => {
    expect((await req('/admin/assets/app.js')).status).toBe(200);
    expect((await req('/admin/assets/missing.js')).status).toBe(404);
  });

  it('injects the per-run token into the /admin document for loopback auto-auth', async () => {
    const html = await (await req('/admin')).text();
    expect(html).toContain(`<meta name="takuhon-local-token" content="${TOKEN}" />`);
  });

  it('does not inject the token into non-HTML assets', async () => {
    const js = await (await req('/admin/assets/app.js')).text();
    expect(js).not.toContain('takuhon-local-token');
  });

  it('never writes the token into the bundle files (public deployment stays gated)', async () => {
    // The injection is response-time on the local server only. The shipped
    // bundle — which the Cloudflare adapter serves verbatim — must not carry the
    // token meta, so the public /admin still shows the sign-in gate.
    const onDisk = await readFile(join(bundleDir, 'index.html'), 'utf8');
    expect(onDisk).not.toContain('takuhon-local-token');
  });

  it('refuses path traversal out of the bundle', async () => {
    // A traversal attempt must never return out-of-bundle content. Hono
    // normalizes dot segments and the bundle handler's own resolve()-prefix
    // guard backstops it, so the response is refused (403/404), never 200.
    const res = await req('/admin/%2e%2e/%2e%2e/%2e%2e/etc/hosts');
    expect([403, 404]).toContain(res.status);
  });

  it('keeps unknown admin API paths behind auth (401, not a preview fall-through)', async () => {
    // An unmatched /api/admin/* path stays inside the mounted admin app, so its
    // bearer gate still applies — it must never leak to the public HTML preview.
    expect((await req('/api/admin/nope')).status).toBe(401);
  });

  it('serves the HTML preview at /', async () => {
    const res = await req('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});

describe('runAdmin() argument handling', () => {
  it('prints usage and exits 0 for --help', async () => {
    const { out, deps } = capture();
    expect(await runAdmin(['--help'], deps)).toBe(0);
    expect(out.join('')).toContain('takuhon admin');
  });

  it('exits 2 on an unknown option', async () => {
    const { deps } = capture();
    expect(await runAdmin(['--nope'], deps)).toBe(2);
  });

  it('exits 2 on a non-numeric --port', async () => {
    const { err, deps } = capture();
    expect(await runAdmin(['--port', 'abc'], deps)).toBe(2);
    expect(err.join('')).toContain('--port');
  });

  it('exits 2 on an invalid --base-url', async () => {
    const { deps } = capture();
    expect(await runAdmin(['--base-url', 'not-a-url'], deps)).toBe(2);
  });

  it('exits 2 when the chosen port is already in use', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;
    try {
      const { deps } = capture();
      expect(await runAdmin(['--port', String(port)], { ...deps, token: TOKEN })).toBe(2);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
