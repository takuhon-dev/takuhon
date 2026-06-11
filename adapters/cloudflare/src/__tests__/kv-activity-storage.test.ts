import type { ActivitySnapshot } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { ACTIVITY_KV_KEY, KvActivityStorage } from '../kv-activity-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
  contributions: { total: 1234, days: [{ date: '2026-06-10', count: 3 }] },
  codingTime: { totalSeconds: 451800, hours: 125, minutes: 30, seconds: 0 },
  rank: { tier: 'A', score: 62 },
};

function makeStorage(): { storage: KvActivityStorage; kv: FakeKV } {
  const kv = new FakeKV();
  return { storage: new KvActivityStorage(kv as unknown as KVNamespace), kv };
}

describe('KvActivityStorage', () => {
  it('round-trips the snapshot through the TAKUHON_ACTIVITY key', async () => {
    const { storage, kv } = makeStorage();
    await storage.saveActivitySnapshot(SNAPSHOT);

    expect(kv.has(ACTIVITY_KV_KEY)).toBe(true);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(SNAPSHOT);
  });

  it('returns null when no snapshot has been synced yet', async () => {
    const { storage } = makeStorage();
    await expect(storage.getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null for an unparseable stored value', async () => {
    const { storage, kv } = makeStorage();
    await kv.put(ACTIVITY_KV_KEY, '{ not json');
    await expect(storage.getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null when the value parses but fails the snapshot type-guard', async () => {
    const { storage, kv } = makeStorage();
    await kv.put(ACTIVITY_KV_KEY, JSON.stringify({ lastSyncedAt: 42 }));
    await expect(storage.getActivitySnapshot()).resolves.toBeNull();
  });

  it('overwrites the previous snapshot (last-writer-wins)', async () => {
    const { storage } = makeStorage();
    await storage.saveActivitySnapshot(SNAPSHOT);
    const next: ActivitySnapshot = { lastSyncedAt: '2026-06-12T00:00:00.000Z' };
    await storage.saveActivitySnapshot(next);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(next);
  });
});
