import type { ActivitySettings, ActivitySnapshot, Takuhon } from '@takuhon/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { syncActivity } from '../activity-sync.js';
import worker, { type Env } from '../index.js';
import { ACTIVITY_KV_KEY, KvActivityStorage } from '../kv-activity-storage.js';
import { KV_KEY, KvTakuhonStorage, type KvMetadata } from '../kv-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

const NOW = (): Date => new Date('2026-06-11T00:00:00.000Z');

const ENABLED: ActivitySettings = {
  enabled: true,
  github: { username: 'octocat' },
  wakatime: { username: 'waka' },
};

const SECRETS = { githubToken: 'gh-token', wakatimeKey: 'waka-key' };

function profileWith(activity?: ActivitySettings): Takuhon {
  const base = exampleJson as Takuhon;
  return { ...base, settings: { ...base.settings, activity } };
}

async function seedProfile(kv: FakeKV, doc: Takuhon): Promise<void> {
  const metadata: KvMetadata = { version: 'v1', updatedAt: '2026-06-10T00:00:00Z' };
  await kv.put(KV_KEY, JSON.stringify(doc), { metadata });
}

function storages(kv: FakeKV): {
  profileStorage: KvTakuhonStorage;
  activityStorage: KvActivityStorage;
} {
  return {
    profileStorage: new KvTakuhonStorage(kv as unknown as KVNamespace),
    activityStorage: new KvActivityStorage(kv as unknown as KVNamespace),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A stub `fetch` that routes by URL substring; an unrouted URL throws. */
function makeFetch(handler: (url: string) => Response): typeof fetch {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url));
  };
}

/** Responds to all four upstream calls of a fully-configured sync. */
const happyFetch = makeFetch((url) => {
  if (url.includes('/users/octocat/repos')) return json([{ name: 'repo1', fork: false }]);
  if (url.includes('/repos/octocat/repo1/languages')) return json({ TypeScript: 800, CSS: 200 });
  if (url.endsWith('/graphql')) {
    return json({
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 1234,
              weeks: [{ contributionDays: [{ date: '2026-06-10', contributionCount: 3 }] }],
            },
          },
        },
      },
    });
  }
  if (url.includes('wakatime.com')) return json({ data: { total_seconds: 451800 } });
  throw new Error(`unexpected fetch: ${url}`);
});

const failingFetch = makeFetch(() => json({ message: 'boom' }, 500));

describe('syncActivity()', () => {
  it('fetches the configured sources and stores the snapshot under TAKUHON_ACTIVITY', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith(ENABLED));

    const result = await syncActivity({
      ...storages(kv),
      secrets: SECRETS,
      fetch: happyFetch,
      now: NOW,
    });

    expect(result.status).toBe('synced');
    expect(result.failures).toEqual([]);
    const stored = (await kv.get<ActivitySnapshot>(ACTIVITY_KV_KEY, 'json'))!;
    expect(stored.lastSyncedAt).toBe('2026-06-11T00:00:00.000Z');
    expect(stored.languages?.[0]).toEqual({ name: 'TypeScript', bytes: 800, percent: 80 });
    expect(stored.contributions?.total).toBe(1234);
    expect(stored.codingTime?.totalSeconds).toBe(451800);
    expect(stored.rank).toBeDefined();
  });

  it('skips when no profile is stored and no fallback is given', async () => {
    const kv = new FakeKV();
    const result = await syncActivity({ ...storages(kv), secrets: SECRETS, fetch: happyFetch });
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('no stored profile');
    expect(kv.has(ACTIVITY_KV_KEY)).toBe(false);
  });

  it('uses the fallback profile when storage is empty', async () => {
    const kv = new FakeKV();
    const result = await syncActivity({
      ...storages(kv),
      secrets: SECRETS,
      fallback: () => profileWith(ENABLED),
      fetch: happyFetch,
      now: NOW,
    });
    expect(result.status).toBe('synced');
    expect(kv.has(ACTIVITY_KV_KEY)).toBe(true);
  });

  it('skips (and fetches nothing) when activity is not enabled', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith(undefined));

    // An unrouted fake throws on any call, so a skipped status with no
    // failures proves no fetch was attempted.
    const result = await syncActivity({
      ...storages(kv),
      secrets: SECRETS,
      fetch: makeFetch(() => {
        throw new Error('unexpected fetch');
      }),
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('not enabled');
    expect(result.failures).toEqual([]);
    expect(kv.has(ACTIVITY_KV_KEY)).toBe(false);
  });

  it('skips when enabled but no github or wakatime username is configured', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith({ enabled: true }));
    const result = await syncActivity({ ...storages(kv), secrets: SECRETS, fetch: happyFetch });
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('no github or wakatime username');
  });

  it('keeps the last-known snapshot when the sync gathers nothing', async () => {
    const kv = new FakeKV();
    await seedProfile(
      kv,
      profileWith({ enabled: true, github: { username: 'octocat', showContributions: false } }),
    );
    const existing: ActivitySnapshot = { lastSyncedAt: '2026-06-01T00:00:00.000Z' };
    await kv.put(ACTIVITY_KV_KEY, JSON.stringify(existing));

    const result = await syncActivity({ ...storages(kv), secrets: {}, fetch: failingFetch });

    expect(result.status).toBe('empty');
    expect(result.failures.map((f) => f.source)).toContain('github-languages');
    await expect(kv.get(ACTIVITY_KV_KEY, 'json')).resolves.toEqual(existing);
  });

  it('writes nothing when the sync gathers nothing and no snapshot exists', async () => {
    const kv = new FakeKV();
    await seedProfile(
      kv,
      profileWith({ enabled: true, github: { username: 'octocat', showContributions: false } }),
    );
    const result = await syncActivity({ ...storages(kv), secrets: {}, fetch: failingFetch });
    expect(result.status).toBe('empty');
    expect(kv.has(ACTIVITY_KV_KEY)).toBe(false);
  });
});

describe('worker.scheduled — cron activity sync', () => {
  const controller = { scheduledTime: 0, cron: '', noRetry: () => undefined };
  const ctx = {
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
  };

  function runScheduled(env: Env): Promise<void> {
    return worker.scheduled(controller, env, ctx as unknown as ExecutionContext);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('syncs via the global fetch and logs a structured success line', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith(ENABLED));
    const env: Env = {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_GITHUB_TOKEN: 'gh-token',
      TAKUHON_WAKATIME_KEY: 'waka-key',
    };
    vi.stubGlobal('fetch', happyFetch);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runScheduled(env);

    expect(kv.has(ACTIVITY_KV_KEY)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('activity.sync.success'));
  });

  it('logs a failure and keeps the last-known snapshot when every source fails', async () => {
    const kv = new FakeKV();
    await seedProfile(
      kv,
      profileWith({ enabled: true, github: { username: 'octocat', showContributions: false } }),
    );
    const existing: ActivitySnapshot = { lastSyncedAt: '2026-06-01T00:00:00.000Z' };
    await kv.put(ACTIVITY_KV_KEY, JSON.stringify(existing));
    const env: Env = { TAKUHON_KV: kv as unknown as KVNamespace };
    vi.stubGlobal('fetch', failingFetch);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runScheduled(env);

    await expect(kv.get(ACTIVITY_KV_KEY, 'json')).resolves.toEqual(existing);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('activity.sync.failure'));
  });

  it('never throws, even when the storage layer itself fails', async () => {
    const kv = new FakeKV();
    kv.getWithMetadata = () => Promise.reject(new Error('kv down'));
    const env: Env = { TAKUHON_KV: kv as unknown as KVNamespace };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runScheduled(env)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('activity.sync.failure'));
  });
});

describe('worker fetch — GET /api/activity', () => {
  function call(url: string, env: Env): Promise<Response> {
    return Promise.resolve(worker.fetch(new Request(url), env));
  }

  it('serves the synced snapshot when activity is enabled', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith(ENABLED));
    const snapshot: ActivitySnapshot = { lastSyncedAt: '2026-06-11T00:00:00.000Z' };
    await kv.put(ACTIVITY_KV_KEY, JSON.stringify(snapshot));
    const env: Env = { TAKUHON_KV: kv as unknown as KVNamespace };

    const res = await call('https://worker.example/api/activity', env);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    await expect(res.json()).resolves.toEqual(snapshot);
  });

  it('is 404 while activity is not enabled, even with a stored snapshot', async () => {
    const kv = new FakeKV();
    await seedProfile(kv, profileWith(undefined));
    await kv.put(ACTIVITY_KV_KEY, JSON.stringify({ lastSyncedAt: '2026-06-11T00:00:00.000Z' }));
    const env: Env = { TAKUHON_KV: kv as unknown as KVNamespace };

    const res = await call('https://worker.example/api/activity', env);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
  });
});
