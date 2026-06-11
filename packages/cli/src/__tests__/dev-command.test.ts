import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  contentType,
  createDevServer,
  handleRequest,
  loadSiteState,
  resolveRoute,
  runDev,
  type SiteState,
} from '../dev-command.js';

/** A valid multi-locale (en + ja) 0.4.0 profile. */
function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '0.4.0',
    profile: {
      displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' },
      tagline: { en: 'Maintainer', ja: 'メンテナ' },
    },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
}

/** Capture stdout/stderr so `runDev` can be exercised without a real TTY. */
function capture(): {
  out: string[];
  err: string[];
  deps: { stdout: (s: string) => void; stderr: (s: string) => void };
} {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, deps: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

describe('resolveRoute()', () => {
  it.each([
    ['', '/'],
    ['/', '/'],
    ['/index.html', '/'],
    ['/ja', '/ja/'],
    ['/ja/', '/ja/'],
    ['/ja/index.html', '/ja/'],
    ['/nope', '/nope/'],
  ])('maps %j to %j', (input, expected) => {
    expect(resolveRoute(input)).toBe(expected);
  });
});

describe('contentType()', () => {
  it('is HTML for every route (HTML-only surface)', () => {
    expect(contentType('/')).toBe('text/html; charset=utf-8');
    expect(contentType('/ja/')).toBe('text/html; charset=utf-8');
  });
});

describe('handleRequest()', () => {
  const ok: SiteState = {
    ok: true,
    pages: new Map([
      ['/', '<html>root</html>'],
      ['/ja/', '<html>ja</html>'],
    ]),
  };

  it('serves 200 HTML for a known route', () => {
    const res = handleRequest('GET', '/', ok);
    expect(res.status).toBe(200);
    expect(res.contentType).toBe('text/html; charset=utf-8');
    expect(res.body).toBe('<html>root</html>');
  });

  it('normalizes the request path before lookup', () => {
    expect(handleRequest('GET', '/ja', ok).body).toBe('<html>ja</html>');
    expect(handleRequest('GET', '/ja/index.html', ok).body).toBe('<html>ja</html>');
  });

  it('returns 404 listing available routes for an unknown path', () => {
    const res = handleRequest('GET', '/nope', ok);
    expect(res.status).toBe(404);
    expect(res.body).toContain('No page');
    expect(res.body).toContain('/ja/');
  });

  it('returns 405 for non-GET/HEAD methods', () => {
    expect(handleRequest('POST', '/', ok).status).toBe(405);
  });

  it('returns the error state status + page when the source is invalid', () => {
    const bad: SiteState = { ok: false, status: 500, message: 'boom at /profile/displayName' };
    const res = handleRequest('GET', '/', bad);
    expect(res.status).toBe(500);
    expect(res.body).toContain('could not be rendered');
    expect(res.body).toContain('boom at /profile/displayName');
  });
});

describe('loadSiteState()', () => {
  let dir: string;
  let src: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-dev-'));
    src = join(dir, 'takuhon.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders a valid profile into routes "/" and "/ja/", plus CV routes', () => {
    writeFileSync(src, JSON.stringify(fixture()), 'utf8');
    const state = loadSiteState(src);
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect([...state.pages.keys()].sort()).toEqual(['/', '/cv/', '/ja/', '/ja/cv/']);
      expect(state.pages.get('/')).toContain('Pat Rivera');
      expect(state.pages.get('/cv/')).toContain('— CV');
      expect(state.pages.get('/ja/cv/')).toContain('<html lang="ja">');
    }
  });

  it('serves the activity section when enabled and activity.json is present', () => {
    writeFileSync(
      src,
      JSON.stringify(
        fixture({
          settings: {
            defaultLocale: 'en',
            availableLocales: ['en'],
            activity: { enabled: true, github: { username: 'octocat' } },
          },
        }),
      ),
      'utf8',
    );
    writeFileSync(
      join(dir, 'activity.json'),
      JSON.stringify({
        lastSyncedAt: '2026-06-11T00:00:00.000Z',
        languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
      }),
      'utf8',
    );

    const state = loadSiteState(src);
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.pages.get('/')).toContain('<section class="activity">');
      expect(state.pages.get('/')).toContain('TypeScript 80%');
    }
  });

  it('reports invalid JSON as a 500 state', () => {
    writeFileSync(src, '{not json', 'utf8');
    const state = loadSiteState(src);
    expect(state.ok).toBe(false);
    if (!state.ok) {
      expect(state.status).toBe(500);
      expect(state.message).toContain('not valid JSON');
    }
  });

  it('reports an invalid profile as a 500 state with a JSON Pointer', () => {
    writeFileSync(src, JSON.stringify({ schemaVersion: '0.4.0' }), 'utf8');
    const state = loadSiteState(src);
    expect(state.ok).toBe(false);
    if (!state.ok) {
      expect(state.status).toBe(500);
      expect(state.message).toContain('not a valid takuhon profile');
    }
  });

  it('reports a missing file as a 500 state', () => {
    const state = loadSiteState(join(dir, 'nope.json'));
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.message).toContain('cannot read');
  });
});

describe('createDevServer() over a socket', () => {
  let dir: string;
  let src: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-dev-'));
    src = join(dir, 'takuhon.json');
    writeFileSync(src, JSON.stringify(fixture()), 'utf8');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves each locale, 404s unknown paths, and reflects edits on the next request', async () => {
    const server = createDevServer({ path: src });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://localhost:${port}`;

    try {
      const root = await fetch(`${base}/`);
      expect(root.status).toBe(200);
      expect(root.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await root.text()).toContain('Pat Rivera');

      const ja = await fetch(`${base}/ja/`);
      expect(ja.status).toBe(200);
      expect(await ja.text()).toContain('パット・リベラ');

      const missing = await fetch(`${base}/nope`);
      expect(missing.status).toBe(404);

      // Per-request regeneration: editing the source shows up on reload.
      writeFileSync(
        src,
        JSON.stringify(fixture({ profile: { displayName: { en: 'Sky Tanaka' } } })),
        'utf8',
      );
      expect(await (await fetch(`${base}/`)).text()).toContain('Sky Tanaka');

      // A now-invalid source is served as a live error page, not a crash.
      writeFileSync(src, '{not json', 'utf8');
      const broken = await fetch(`${base}/`);
      expect(broken.status).toBe(500);
      expect(await broken.text()).toContain('could not be rendered');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('runDev() argument handling', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-dev-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', async () => {
    const { out, deps } = capture();
    expect(await runDev(['--help'], deps)).toBe(0);
    expect(out.join('')).toContain('Usage: takuhon dev');
  });

  it('exits 2 on an unknown option', async () => {
    const { err, deps } = capture();
    expect(await runDev(['--nope'], deps)).toBe(2);
    expect(err.join('')).toContain('unknown option');
  });

  it('exits 2 on a non-numeric --port', async () => {
    const { err, deps } = capture();
    expect(await runDev(['--port', 'abc'], deps)).toBe(2);
    expect(err.join('')).toContain('--port');
  });

  it('exits 2 on a malformed --base-url', async () => {
    const { err, deps } = capture();
    expect(await runDev(['--base-url', 'not-a-url'], deps)).toBe(2);
    expect(err.join('')).toContain('absolute http(s) URL');
  });

  it('exits 2 when the source file is missing', async () => {
    const { err, deps } = capture();
    expect(await runDev([join(dir, 'nope.json')], deps)).toBe(2);
    expect(err.join('')).toContain('cannot read');
  });

  it('exits 2 when the chosen port is already in use', async () => {
    // Occupy a loopback port, then point dev at it: listen fails with EADDRINUSE,
    // which resolves to exit code 2 without ever entering the serve loop.
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;

    const src = join(dir, 'takuhon.json');
    writeFileSync(src, JSON.stringify(fixture()), 'utf8');

    const { err, deps } = capture();
    try {
      expect(await runDev([src, '--port', String(port)], deps)).toBe(2);
      expect(err.join('')).toContain('already in use');
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
