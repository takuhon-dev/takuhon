import { describe, expect, it } from 'vitest';

import worker, { type Env } from '../index.js';

const env = {} as Env;

function call(url: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

describe('cloudflare worker — Phase 3.1', () => {
  it('GET / returns a plain-text landing page', async () => {
    const res = await call('https://worker.example/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('meport');
  });

  it('GET /api/profile returns a LocalizedMeport with resolvedLocale', async () => {
    const res = await call('https://worker.example/api/profile');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body: any = await res.json();
    expect(body.profile.displayName).toBeTruthy();
    expect(body.resolvedLocale).toBe('en');
  });

  it('GET /api/profile?lang=ja resolves Japanese content', async () => {
    const res = await call('https://worker.example/api/profile?lang=ja');
    const body: any = await res.json();
    expect(body.resolvedLocale).toBe('ja');
    expect(body.profile.displayName).toBe('パット・リベラ');
  });

  it('GET /api/schema returns the JSON Schema document', async () => {
    const res = await call('https://worker.example/api/schema');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.$schema).toBeTruthy();
  });

  it('GET /unknown returns 404 with application/problem+json envelope', async () => {
    const res = await call('https://worker.example/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
    const body: any = await res.json();
    expect(body.status).toBe(404);
    expect(body.title).toBe('Not Found');
  });

  it('POST /api/profile returns 405 method not allowed', async () => {
    const res = await call('https://worker.example/api/profile', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
  });

  it('every response carries the baseline security headers', async () => {
    const res = await call('https://worker.example/api/schema');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });
});
