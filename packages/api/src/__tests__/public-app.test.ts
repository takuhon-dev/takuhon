import { normalize, validate, type Ownport } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { createPublicApp } from '../public-app.js';
import { FakeStorage } from '../test-utils/fake-storage.js';

function makeSample(): Ownport {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('fixture invalid');
  return normalize(r.data);
}

function makeApp(): { app: ReturnType<typeof createPublicApp>; storage: FakeStorage } {
  const storage = new FakeStorage();
  const app = createPublicApp({ storage, fallback: () => makeSample() });
  return { app, storage };
}

function fetchPath(
  app: ReturnType<typeof createPublicApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://app.example${path}`, init)));
}

describe('createPublicApp', () => {
  it('GET / returns a plain-text landing page', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('ownport');
  });

  it('GET /api/profile uses storage data when present', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
    expect(body.meta.locale).toBe('en');
    expect(body.meta.schemaVersion).toBe('0.1.0');
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
  });

  it('GET /api/profile?lang=ja resolves Japanese content', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile?lang=ja');
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('GET /api/profile falls back to bundled fixture when storage is empty', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile');
    expect(res.headers.get('etag')).toBe('"bundled-fixture"');
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
  });

  it('GET /api/schema returns the JSON Schema document', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/schema');
    const body: any = await res.json();
    expect(body.$schema).toBeTruthy();
  });

  it('GET /api/jsonld returns a ProfilePage with Person mainEntity', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/ld\+json/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    const body: any = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]['@type']).toBe('ProfilePage');
    expect(body[0].mainEntity['@type']).toBe('Person');
  });

  it('GET /api/jsonld?lang=ja localizes inLanguage to ja', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld?lang=ja');
    const body: any = await res.json();
    expect(body[0].inLanguage).toBe('ja');
  });

  it('GET /ownport.json returns the raw Ownport document', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ownport.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body: any = await res.json();
    expect(body.profile.displayName.en).toBe('Pat Rivera');
    expect(body.profile.displayName.ja).toBe('パット・リベラ');
    expect(body.data).toBeUndefined();
  });

  it('GET /.well-known/ownport.json returns the 6-field metadata', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/.well-known/ownport.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    const body: any = await res.json();
    expect(body.schemaVersion).toBe('0.1.0');
    expect(body.canonical).toBe('/ownport.json');
  });

  it('GET /unknown returns RFC 7807 with type=https://ownport.dev/errors/not-found', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
    const body: any = await res.json();
    expect(body.type).toBe('https://ownport.dev/errors/not-found');
    expect(body.instance).toBe('/does-not-exist');
  });

  it('POST /api/profile returns 405 with type=https://ownport.dev/errors/method-not-allowed', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile', { method: 'POST' });
    expect(res.status).toBe(405);
    const body: any = await res.json();
    expect(body.type).toBe('https://ownport.dev/errors/method-not-allowed');
    expect(body.instance).toBe('/api/profile');
  });

  it('every response carries the six baseline security headers', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/schema');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'self'/);
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});
