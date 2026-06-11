import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ActivitySnapshot } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_FILENAME, FileActivityStorage } from '../file-activity-storage.js';

const SNAPSHOT: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
  contributions: { total: 1234, days: [{ date: '2026-06-10', count: 3 }] },
  codingTime: { totalSeconds: 451800, hours: 125, minutes: 30, seconds: 0 },
  rank: { tier: 'A', score: 62 },
};

describe('FileActivityStorage', () => {
  let dir: string;
  let profilePath: string;
  let activityPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'takuhon-activity-storage-'));
    profilePath = join(dir, 'takuhon.json');
    activityPath = join(dir, ACTIVITY_FILENAME);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes activity.json beside the profile and round-trips the snapshot', async () => {
    const storage = new FileActivityStorage(profilePath);
    await storage.saveActivitySnapshot(SNAPSHOT);

    expect(existsSync(activityPath)).toBe(true);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(SNAPSHOT);

    const raw = await readFile(activityPath, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "lastSyncedAt"'); // 2-space indent
  });

  it('resolves a relative profile path against the working directory', () => {
    const storage = new FileActivityStorage('takuhon.json');
    expect(storage.path).toBe(join(process.cwd(), ACTIVITY_FILENAME));
  });

  it('returns null when no snapshot has been synced yet', async () => {
    await expect(new FileActivityStorage(profilePath).getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null for an unparseable snapshot file', async () => {
    await writeFile(activityPath, '{ not json', 'utf8');
    await expect(new FileActivityStorage(profilePath).getActivitySnapshot()).resolves.toBeNull();
  });

  it('returns null when the file parses but fails the snapshot type-guard', async () => {
    await writeFile(activityPath, JSON.stringify({ lastSyncedAt: 42 }), 'utf8');
    await expect(new FileActivityStorage(profilePath).getActivitySnapshot()).resolves.toBeNull();
  });

  it('overwrites the previous snapshot (last-writer-wins)', async () => {
    const storage = new FileActivityStorage(profilePath);
    await storage.saveActivitySnapshot(SNAPSHOT);
    const next: ActivitySnapshot = { lastSyncedAt: '2026-06-12T00:00:00.000Z' };
    await storage.saveActivitySnapshot(next);
    await expect(storage.getActivitySnapshot()).resolves.toEqual(next);
  });

  it('leaves no temp file behind after an atomic write', async () => {
    await new FileActivityStorage(profilePath).saveActivitySnapshot(SNAPSHOT);
    await expect(readdir(dir)).resolves.toEqual([ACTIVITY_FILENAME]);
  });
});
