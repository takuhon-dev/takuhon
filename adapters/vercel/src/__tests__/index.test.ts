import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { createTakuhonVercelApp, BundledTakuhonStorage } from '../index.js';

function makeApp(profile: unknown = exampleJson): ReturnType<typeof createTakuhonVercelApp> {
  return createTakuhonVercelApp({ storage: new BundledTakuhonStorage(profile) });
}

function fetchPath(
  app: ReturnType<typeof createTakuhonVercelApp>,
  path: string,
): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://app.example${path}`)));
}

describe('createTakuhonVercelApp', () => {
  it('GET / server-renders the profile page with embedded JSON-LD', async () => {
    const res = await fetchPath(makeApp(), '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(body).toContain('Pat Rivera');
    expect(body).toContain('<script type="application/ld+json">');
    expect(body).toContain('"ProfilePage"');
  });

  it('serves the public read API as JSON', async () => {
    const res = await fetchPath(makeApp(), '/api/profile');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
  });

  it('serves standalone JSON-LD and the raw document', async () => {
    const jsonld: any = await (await fetchPath(makeApp(), '/api/jsonld')).json();
    expect(Array.isArray(jsonld)).toBe(true);
    expect(jsonld[0]['@type']).toBe('ProfilePage');

    const raw: any = await (await fetchPath(makeApp(), '/takuhon.json')).json();
    expect(raw.schemaVersion).toBe(exampleJson.schemaVersion);
    expect(raw.profile.displayName.ja).toBe('パット・リベラ');
  });

  it('dispatches locale-prefixed routes through the mounted public app', async () => {
    // Proves the top-level getPath is wired: a bare createPublicApp mounted via
    // route() would not match `/ja/...` without the parent router's getPath.
    const res = await fetchPath(makeApp(), '/ja/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('applies the public privacy filter (section parity with every surface)', async () => {
    const visible: any = await (await fetchPath(makeApp(), '/api/profile')).json();
    expect(Array.isArray(visible.data.education)).toBe(true);
    expect(visible.data.education.length).toBeGreaterThan(0);

    const hidden = {
      ...exampleJson,
      settings: { ...exampleJson.settings, publicVisibility: { education: false } },
    };
    const filtered: any = await (await fetchPath(makeApp(hidden), '/api/profile')).json();
    expect(filtered.data.education).toEqual([]);
  });

  it('answers 404 for GET /api/activity (no activity surface on Vercel)', async () => {
    const res = await fetchPath(makeApp(), '/api/activity');
    expect(res.status).toBe(404);
  });

  it('omits mcp from the discovery document (no MCP endpoint on Vercel)', async () => {
    const res = await fetchPath(makeApp(), '/.well-known/takuhon.json');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.mcp).toBeUndefined();
  });

  it('answers 404 for unknown routes', async () => {
    const res = await fetchPath(makeApp(), '/nope');
    expect(res.status).toBe(404);
  });
});
