import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_VERSION, migrateTakuhon } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSync } from '../sync-command.js';

const URL_FLAG = 'https://me.example';

const VALID: Takuhon = migrateTakuhon(
  {
    schemaVersion: '0.1.0',
    profile: { displayName: { en: 'Sync Me' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  } as unknown as Takuhon,
  SCHEMA_VERSION,
);

function serialize(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A stub `fetch` that records each call's primitives and returns (or throws) a response. */
function makeFetch(responder: () => Response | Promise<Response>, calls: Call[]): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, method: init?.method ?? '', headers, body });
    return responder();
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status === 200 ? 'application/json' : 'application/problem+json' },
  });
}

const token = () => 'admin-secret';

describe('runSync()', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-sync-'));
    path = join(dir, 'takuhon.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', async () => {
    const out = await runSync(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon sync');
  });

  it('PUTs the validated profile to <url>/api/admin/profile with a bearer token', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, { meta: { version: 'v7' } }), calls);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain('version v7');
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`${URL_FLAG}/api/admin/profile`);
    expect(call.method).toBe('PUT');
    expect(call.headers.authorization).toBe('Bearer admin-secret');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['if-match']).toBeUndefined();
    expect(call.body).toContain('Sync Me');
  });

  it('trims a trailing slash on --url before joining the endpoint', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, { meta: { version: 'v1' } }), calls);

    await runSync([path, '--url', `${URL_FLAG}/`], { fetch, getToken: token });

    expect(calls[0]!.url).toBe(`${URL_FLAG}/api/admin/profile`);
  });

  it('treats a 2xx without meta.version as a failure (exit 2), not a sync', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const fetch = makeFetch(
      () =>
        new Response('<html>login</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      [],
    );

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(2);
    expect(out.stderr).toContain('no meta.version');
  });

  it('sends a quoted If-Match header when --if-match is given', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, { meta: { version: 'v2' } }), calls);

    await runSync([path, '--url', URL_FLAG, '--if-match', 'abc123'], { fetch, getToken: token });

    expect(calls[0]!.headers['if-match']).toBe('"abc123"');
  });

  it('does not double-quote an already-quoted If-Match value', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, { meta: { version: 'v2' } }), calls);

    await runSync([path, '--url', URL_FLAG, '--if-match', '"abc123"'], { fetch, getToken: token });

    expect(calls[0]!.headers['if-match']).toBe('"abc123"');
  });

  it('reports a 409 conflict (exit 1) with the current remote version', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(
      () => jsonResponse(409, { detail: 'mismatch', currentVersion: 'v9' }),
      calls,
    );

    const out = await runSync([path, '--url', URL_FLAG, '--if-match', 'v1'], {
      fetch,
      getToken: token,
    });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('409');
    expect(out.stderr).toContain('v9');
  });

  it('reports a 422 validation failure (exit 1) with field errors', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(
      () =>
        jsonResponse(422, {
          detail: 'Schema validation failed',
          errors: [{ path: '#/profile/displayName', message: 'is required' }],
        }),
      calls,
    );

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('422');
    expect(out.stderr).toContain('#/profile/displayName');
  });

  it('maps 401 to an operational error (exit 2) mentioning the token env var', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const fetch = makeFetch(() => jsonResponse(401, { detail: 'no token' }), []);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(2);
    expect(out.stderr).toContain('TAKUHON_ADMIN_TOKEN');
  });

  it('maps a network failure to exit 2 without leaking the token', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const fetch = makeFetch(() => {
      throw new Error('ECONNREFUSED');
    }, []);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(2);
    expect(out.stderr).toContain('could not reach');
    expect(out.stderr).not.toContain('admin-secret');
  });

  it('redacts the token if it ever appears in a network error message', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const fetch = makeFetch(() => {
      throw new Error('request failed with Authorization: Bearer admin-secret');
    }, []);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(2);
    expect(out.stderr).not.toContain('admin-secret');
    expect(out.stderr).toContain('***');
  });

  it('refuses a locally-invalid profile (exit 1) and never calls fetch', async () => {
    writeFileSync(path, serialize({ schemaVersion: SCHEMA_VERSION }), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, {}), calls);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: token });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('not a valid takuhon profile');
    expect(calls).toHaveLength(0);
  });

  it('exits 2 when the file is missing', async () => {
    const out = await runSync([path, '--url', URL_FLAG], { getToken: token });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read');
  });

  it('exits 2 when --url is absent', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const out = await runSync([path], { getToken: token });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('requires `--url <base-url>`');
  });

  it('exits 2 when --url is not http(s)', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const out = await runSync([path, '--url', 'ftp://me.example'], { getToken: token });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('absolute http(s) URL');
  });

  it('exits 2 when --url carries a path, query, or credentials', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    for (const bad of [`${URL_FLAG}/already/admin`, `${URL_FLAG}?x=1`, 'https://u:p@me.example']) {
      const out = await runSync([path, '--url', bad], { getToken: token });
      expect(out.code).toBe(2);
      expect(out.stderr).toContain("deployment's origin");
    }
  });

  it('exits 2 on an unknown option', async () => {
    const out = await runSync(['--nope'], { getToken: token });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('unknown option');
  });

  it('exits 2 when the token is unset', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => jsonResponse(200, {}), calls);

    const out = await runSync([path, '--url', URL_FLAG], { fetch, getToken: () => undefined });

    expect(out.code).toBe(2);
    expect(out.stderr).toContain('TAKUHON_ADMIN_TOKEN is not set');
    expect(calls).toHaveLength(0);
  });

  it('--dry-run validates and reports without sending', async () => {
    writeFileSync(path, serialize(VALID), 'utf8');
    const calls: Call[] = [];
    const fetch = makeFetch(() => {
      throw new Error('should not be called');
    }, calls);

    const out = await runSync([path, '--url', URL_FLAG, '--dry-run'], { fetch });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain('would sync');
    expect(out.stdout).toContain('/api/admin/profile');
    expect(calls).toHaveLength(0);
  });
});
