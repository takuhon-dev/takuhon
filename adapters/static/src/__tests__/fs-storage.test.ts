import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ConflictError, NotFoundError, StorageError, type Ownport } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { StaticOwnportStorage } from '../fs-storage.js';
import { resolveStoragePaths } from '../paths.js';

const sample = exampleJson as unknown as Ownport;

describe('StaticOwnportStorage', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ownport-static-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  function makeStorage(dir: string = baseDir): StaticOwnportStorage {
    return new StaticOwnportStorage({ baseDir: dir });
  }

  it('getProfile() throws NotFoundError when baseDir is empty', async () => {
    const storage = makeStorage();
    await expect(storage.getProfile()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getProfile() returns the stored profile and version after saveProfile', async () => {
    const storage = makeStorage();
    const { version } = await storage.saveProfile(sample);
    const read = await storage.getProfile();
    expect(read.version).toBe(version);
    expect(read.data.schemaVersion).toBe(sample.schemaVersion);
  });

  it('saveProfile() without ifMatch overwrites unconditionally and returns a new UUID', async () => {
    const storage = makeStorage();
    const first = await storage.saveProfile(sample);
    const second = await storage.saveProfile(sample);
    expect(second.version).not.toBe(first.version);

    const { versionPath } = resolveStoragePaths(baseDir);
    const persisted = JSON.parse(await fs.readFile(versionPath, 'utf8')) as {
      version: string;
      updatedAt: string;
    };
    expect(persisted.version).toBe(second.version);
    expect(typeof persisted.updatedAt).toBe('string');
  });

  it('saveProfile() with matching ifMatch succeeds and rotates the version', async () => {
    const storage = makeStorage();
    const initial = await storage.saveProfile(sample);
    const next = await storage.saveProfile(sample, initial.version);
    expect(next.version).not.toBe(initial.version);
  });

  it('saveProfile() with mismatched ifMatch throws ConflictError carrying currentVersion', async () => {
    const storage = makeStorage();
    const initial = await storage.saveProfile(sample);
    try {
      await storage.saveProfile(sample, 'stale-token');
      throw new Error('expected ConflictError');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as ConflictError).currentVersion).toBe(initial.version);
    }
  });

  it('deleteProfile() removes the stored profile so getProfile throws NotFoundError again', async () => {
    const storage = makeStorage();
    await storage.saveProfile(sample);
    await storage.deleteProfile();
    await expect(storage.getProfile()).rejects.toBeInstanceOf(NotFoundError);
    // idempotent: a second delete must not throw
    await expect(storage.deleteProfile()).resolves.toBeUndefined();
  });

  it('saveProfile() creates baseDir recursively when missing', async () => {
    const nested = path.join(baseDir, 'nested', 'deeper');
    const storage = makeStorage(nested);
    const { version } = await storage.saveProfile(sample);
    const read = await storage.getProfile();
    expect(read.version).toBe(version);
  });

  it('getProfile() throws NotFoundError when profile.json exists but version.json is missing', async () => {
    const storage = makeStorage();
    await storage.saveProfile(sample);
    const { versionPath } = resolveStoragePaths(baseDir);
    await fs.unlink(versionPath);
    await expect(storage.getProfile()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getProfile() throws StorageError when version metadata is corrupt', async () => {
    const storage = makeStorage();
    await storage.saveProfile(sample);
    const { versionPath } = resolveStoragePaths(baseDir);
    await fs.writeFile(versionPath, JSON.stringify({ version: '' }));
    let caught: unknown;
    try {
      await storage.getProfile();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StorageError);
    expect(caught).not.toBeInstanceOf(NotFoundError);
  });
});
