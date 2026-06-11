import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ActivitySnapshot } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StaticActivityStorage } from '../fs-activity-storage.js';
import { resolveStoragePaths } from '../paths.js';

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
  rank: { tier: 'A', score: 62 },
};

describe('StaticActivityStorage', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'takuhon-static-activity-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('round-trips the snapshot through activity.json under the base directory', async () => {
    const storage = new StaticActivityStorage({ baseDir });
    await storage.saveActivitySnapshot(SNAPSHOT);

    await expect(storage.getActivitySnapshot()).resolves.toEqual(SNAPSHOT);
    const raw = await readFile(resolveStoragePaths(baseDir).activityPath, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('creates the base directory on first write', async () => {
    const nested = join(baseDir, 'data');
    const storage = new StaticActivityStorage({ baseDir: nested });
    await storage.saveActivitySnapshot(SNAPSHOT);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(SNAPSHOT);
  });

  it('returns null when no snapshot has been synced yet', async () => {
    await expect(new StaticActivityStorage({ baseDir }).getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null for an unparseable snapshot file', async () => {
    await writeFile(resolveStoragePaths(baseDir).activityPath, '{ not json', 'utf8');
    await expect(new StaticActivityStorage({ baseDir }).getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null when the file parses but fails the snapshot type-guard', async () => {
    await writeFile(
      resolveStoragePaths(baseDir).activityPath,
      JSON.stringify({ lastSyncedAt: 42 }),
      'utf8',
    );
    await expect(new StaticActivityStorage({ baseDir }).getActivitySnapshot()).resolves.toBeNull();
  });

  it('overwrites the previous snapshot (last-writer-wins)', async () => {
    const storage = new StaticActivityStorage({ baseDir });
    await storage.saveActivitySnapshot(SNAPSHOT);
    const next: ActivitySnapshot = { lastSyncedAt: '2026-06-12T00:00:00.000Z' };
    await storage.saveActivitySnapshot(next);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(next);
  });
});
