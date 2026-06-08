import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConflictError, NotFoundError, type Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BACKUP_DIR_NAME } from '../backup.js';
import { FileStorage } from '../file-storage.js';

// FileStorage does not schema-validate (the admin API validates before saving),
// so a minimal shape is enough to exercise read/write/version/backup behavior.
function doc(name: string): Takuhon {
  return { schemaVersion: '0.4.0', profile: { displayName: { en: name } } } as unknown as Takuhon;
}

const FIXED = (): Date => new Date('2026-06-09T00:00:00.000Z');

describe('FileStorage', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'takuhon-file-storage-'));
    path = join(dir, 'takuhon.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('getProfile throws NotFoundError when the file is absent', async () => {
    await expect(new FileStorage(path).getProfile()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('saveProfile writes the file and getProfile round-trips with a stable version', async () => {
    const storage = new FileStorage(path);
    const { version } = await storage.saveProfile(doc('Ada'));

    const got = await storage.getProfile();
    expect(got.data.profile.displayName?.en).toBe('Ada');
    // The version read back equals the one returned by the write (sha256 of the
    // exact bytes on disk), so the SPA's If-Match round-trip is stable.
    expect(got.version).toBe(version);

    const raw = await readFile(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "schemaVersion"'); // 2-space indent
  });

  it('changes the version when the content changes', async () => {
    const storage = new FileStorage(path);
    const v1 = (await storage.saveProfile(doc('Ada'))).version;
    const v2 = (await storage.saveProfile(doc('Grace'))).version;
    expect(v2).not.toBe(v1);
  });

  it('accepts a matching If-Match and rejects a stale one with currentVersion', async () => {
    const storage = new FileStorage(path);
    const v1 = (await storage.saveProfile(doc('Ada'))).version;
    const v2 = (await storage.saveProfile(doc('Grace'), v1)).version; // matches → ok
    expect(v2).not.toBe(v1);

    // v1 is now stale.
    await expect(storage.saveProfile(doc('Hopper'), v1)).rejects.toMatchObject({
      name: 'ConflictError',
      currentVersion: v2,
    });
  });

  it('treats an If-Match against an absent file as a conflict', async () => {
    await expect(new FileStorage(path).saveProfile(doc('Ada'), 'whatever')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('backs up the previous file before overwriting (none on first write)', async () => {
    const storage = new FileStorage(path, { now: FIXED });
    await storage.saveProfile(doc('Ada')); // first write: nothing to back up
    expect(existsSync(join(dir, BACKUP_DIR_NAME))).toBe(false);

    await storage.saveProfile(doc('Grace')); // overwrite: backs up "Ada"
    const backups = await readdir(join(dir, BACKUP_DIR_NAME));
    expect(backups.some((f) => f.startsWith('pre-admin-'))).toBe(true);
    const backupRaw = await readFile(join(dir, BACKUP_DIR_NAME, backups[0]!), 'utf8');
    expect(backupRaw).toContain('Ada');
  });

  it('deleteProfile is idempotent and removes an existing file', async () => {
    const storage = new FileStorage(path, { now: FIXED });
    await expect(storage.deleteProfile()).resolves.toBeUndefined(); // absent → no-op

    await storage.saveProfile(doc('Ada'));
    await storage.deleteProfile();
    expect(existsSync(path)).toBe(false);
    // The deleted document was backed up first.
    const backups = await readdir(join(dir, BACKUP_DIR_NAME));
    expect(backups.some((f) => f.startsWith('pre-admin-'))).toBe(true);
  });

  it('throws when the stored file is not valid JSON', async () => {
    await writeFile(path, 'not json', 'utf8');
    await expect(new FileStorage(path).getProfile()).rejects.toThrow();
  });
});
