import {
  normalize,
  validate,
  type ActivitySettings,
  type ActivitySnapshot,
  type Takuhon,
} from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { createPublicApp } from '../public-app.js';
import { FakeActivityStorage, FakeStorage } from '../test-utils/fake-storage.js';

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
  rank: { tier: 'A', score: 62 },
};

function makeSample(activity?: ActivitySettings): Takuhon {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('fixture invalid');
  const data = normalize(r.data);
  return { ...data, settings: { ...data.settings, activity } };
}

async function makeApp(opts: {
  activity?: ActivitySettings;
  activityStorage?: FakeActivityStorage;
}): Promise<ReturnType<typeof createPublicApp>> {
  const storage = new FakeStorage();
  await storage.saveProfile(makeSample(opts.activity));
  return createPublicApp({ storage, activityStorage: opts.activityStorage });
}

function fetchActivity(app: ReturnType<typeof createPublicApp>): Promise<Response> {
  return Promise.resolve(app.fetch(new Request('https://app.example/api/activity')));
}

describe('GET /api/activity', () => {
  it('serves the stored snapshot when activity is enabled', async () => {
    const activityStorage = new FakeActivityStorage();
    activityStorage.snapshot = SNAPSHOT;
    const app = await makeApp({
      activity: { enabled: true, github: { username: 'octocat' } },
      activityStorage,
    });

    const res = await fetchActivity(app);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    await expect(res.json()).resolves.toEqual(SNAPSHOT);
  });

  it('is 404 when no activity storage is configured', async () => {
    const app = await makeApp({ activity: { enabled: true, github: { username: 'octocat' } } });
    const res = await fetchActivity(app);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe('https://takuhon.org/errors/not-found');
  });

  it('is 404 when no snapshot has been synced yet', async () => {
    const app = await makeApp({
      activity: { enabled: true, github: { username: 'octocat' } },
      activityStorage: new FakeActivityStorage(),
    });
    const res = await fetchActivity(app);
    expect(res.status).toBe(404);
  });

  it('is 404 while settings.activity is not enabled, even with a stored snapshot', async () => {
    const activityStorage = new FakeActivityStorage();
    activityStorage.snapshot = SNAPSHOT;
    const app = await makeApp({ activity: undefined, activityStorage });

    const res = await fetchActivity(app);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe('https://takuhon.org/errors/not-found');
  });
});
