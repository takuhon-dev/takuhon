import { DARK_PALETTE, LIGHT_PALETTE, type ActivitySnapshot, type Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import worker, { type Env } from '../index.js';
import { ACTIVITY_KV_KEY } from '../kv-activity-storage.js';
import { KV_KEY, type KvMetadata } from '../kv-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

function makeEnv(): { env: Env; kv: FakeKV } {
  const kv = new FakeKV();
  return { env: { TAKUHON_KV: kv as unknown as KVNamespace }, kv };
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-12T00:00:00.000Z',
  languages: [
    { name: 'TypeScript', bytes: 800, percent: 80 },
    { name: 'CSS', bytes: 200, percent: 20 },
  ],
  contributions: { total: 1234, days: [{ date: '2026-06-10', count: 3 }] },
  codingTime: { totalSeconds: 3600, hours: 1, minutes: 0, seconds: 0 },
  rank: { tier: 'A', score: 60 },
};

/** Seed KV with an activity-enabled profile and, optionally, a snapshot. */
async function seed(
  kv: FakeKV,
  opts: { enabled: boolean; snapshot?: ActivitySnapshot },
): Promise<void> {
  const base = exampleJson as Takuhon;
  const profile: Takuhon = {
    ...base,
    settings: { ...base.settings, activity: { enabled: opts.enabled } },
  };
  const metadata: KvMetadata = { version: 'v1', updatedAt: '2026-06-12T00:00:00Z' };
  await kv.put(KV_KEY, JSON.stringify(profile), { metadata });
  if (opts.snapshot) await kv.put(ACTIVITY_KV_KEY, JSON.stringify(opts.snapshot));
}

describe('cloudflare worker — GET /activity.svg', () => {
  it('renders the snapshot as a self-contained light SVG with badge cache headers', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=14400');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const body = await res.text();
    expect(body.startsWith('<svg')).toBe(true);
    expect(body).toContain('Developer activity');
    expect(body).toContain(`fill="${LIGHT_PALETTE.background}"`);
    expect(body).not.toContain(DARK_PALETTE.background);
    // Self-contained: no external reference of any kind (CSP unchanged).
    expect(body).not.toMatch(/href|xlink|http:\/\/(?!www\.w3\.org)/);
  });

  it('renders the dark variant for ?theme=dark', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg?theme=dark', env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`fill="${DARK_PALETTE.background}"`);
  });

  it('treats an unknown ?theme value as the default light card', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg?theme=neon', env);
    const body = await res.text();
    expect(body).toContain(`fill="${LIGHT_PALETTE.background}"`);
    expect(body).not.toContain(DARK_PALETTE.background);
  });

  it('answers 404 when activity is opted in but no snapshot is stored', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true });

    const res = await call('https://worker.example/activity.svg', env);
    expect(res.status).toBe(404);
  });

  it('answers 404 when activity is not enabled (re-checked per request)', async () => {
    const { env, kv } = makeEnv();
    // A stored snapshot must not leak once the owner disables the feature.
    await seed(kv, { enabled: false, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg', env);
    expect(res.status).toBe(404);
  });

  it('answers 404 for an opted-in but metric-less snapshot (empty render)', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: { lastSyncedAt: '2026-06-12T00:00:00.000Z' } });

    const res = await call('https://worker.example/activity.svg', env);
    expect(res.status).toBe(404);
  });

  it('falls back to the bundled profile (no activity block) and 404s when KV is empty', async () => {
    const res = await call('https://worker.example/activity.svg', makeEnv().env);
    expect(res.status).toBe(404);
  });

  it('serves HEAD with the same headers and an empty body', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg', env, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=14400');
    expect(await res.text()).toBe('');
  });

  it('rejects non-GET/HEAD methods with 405', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/activity.svg', env, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('is locale-agnostic: /{locale}/activity.svg is not the badge route (404 via router)', async () => {
    const { env, kv } = makeEnv();
    await seed(kv, { enabled: true, snapshot: SNAPSHOT });

    const res = await call('https://worker.example/ja/activity.svg', env);
    expect(res.status).toBe(404);
    // The router's problem+json 404, not the badge handler's plain-text 404.
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
  });
});
