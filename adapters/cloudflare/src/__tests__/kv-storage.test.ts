import { ConflictError, NotFoundError, type Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { KV_KEY, KvTakuhonStorage, type KvMetadata } from '../kv-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

function makeStorage(): { storage: KvTakuhonStorage; kv: FakeKV } {
  const kv = new FakeKV();
  const storage = new KvTakuhonStorage(kv as unknown as KVNamespace);
  return { storage, kv };
}

const sample = exampleJson as unknown as Takuhon;

describe('KvTakuhonStorage', () => {
  it('getProfile() throws NotFoundError when KV is empty', async () => {
    const { storage } = makeStorage();
    await expect(storage.getProfile()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getProfile() returns the stored profile and version after saveProfile', async () => {
    const { storage } = makeStorage();
    const { version } = await storage.saveProfile(sample);
    const read = await storage.getProfile();
    expect(read.version).toBe(version);
    expect(read.data.schemaVersion).toBe(sample.schemaVersion);
  });

  it('saveProfile() without ifMatch overwrites unconditionally and returns a new UUID', async () => {
    const { storage, kv } = makeStorage();
    const first = await storage.saveProfile(sample);
    const second = await storage.saveProfile(sample);
    expect(second.version).not.toBe(first.version);
    const md = (await kv.getWithMetadata<KvMetadata>(KV_KEY, 'json')).metadata;
    expect(md?.version).toBe(second.version);
    expect(typeof md?.updatedAt).toBe('string');
  });

  it('saveProfile() with matching ifMatch succeeds and rotates the version', async () => {
    const { storage } = makeStorage();
    const initial = await storage.saveProfile(sample);
    const next = await storage.saveProfile(sample, initial.version);
    expect(next.version).not.toBe(initial.version);
  });

  it('saveProfile() with mismatched ifMatch throws ConflictError carrying currentVersion', async () => {
    const { storage } = makeStorage();
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
    const { storage, kv } = makeStorage();
    await storage.saveProfile(sample);
    await storage.deleteProfile();
    expect(kv.has(KV_KEY)).toBe(false);
    await expect(storage.getProfile()).rejects.toBeInstanceOf(NotFoundError);
  });
});
