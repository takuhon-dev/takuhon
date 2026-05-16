import { ConflictError, NotFoundError, type Meport, type MeportStorage } from '@meport/core';

export const KV_KEY = 'MEPORT_DATA';

export interface KvMetadata {
  version: string;
  updatedAt: string;
}

/**
 * Cloudflare KV implementation of the `MeportStorage` contract. Stores the
 * profile document as JSON under a single key (`MEPORT_DATA`) and tracks the
 * optimistic-locking token inside KV value metadata.
 *
 * `version` is a fresh UUIDv4 on every successful write. Callers compare it
 * verbatim against the `If-Match` precondition; mismatches raise
 * `ConflictError` with `currentVersion` so the API layer can build the RFC
 * 7807 envelope without an extra round trip.
 */
export class KvMeportStorage implements MeportStorage {
  constructor(private readonly kv: KVNamespace) {}

  async getProfile(): Promise<{ data: Meport; version: string }> {
    const result = await this.kv.getWithMetadata<Meport, KvMetadata>(KV_KEY, 'json');
    if (result.value === null || !result.metadata?.version) {
      throw new NotFoundError(`No profile is stored at KV key "${KV_KEY}".`);
    }
    return { data: result.value, version: result.metadata.version };
  }

  async saveProfile(data: Meport, ifMatch?: string): Promise<{ version: string }> {
    if (ifMatch !== undefined) {
      const current = await this.kv.getWithMetadata<Meport, KvMetadata>(KV_KEY, 'json');
      const currentVersion = current.metadata?.version;
      if (currentVersion !== ifMatch) {
        throw new ConflictError(
          `If-Match preconditioned on version "${ifMatch}" but current is "${currentVersion ?? 'absent'}".`,
          { currentVersion },
        );
      }
    }
    const version = crypto.randomUUID();
    const updatedAt = new Date().toISOString();
    await this.kv.put(KV_KEY, JSON.stringify(data), {
      metadata: { version, updatedAt } satisfies KvMetadata,
    });
    return { version };
  }

  async deleteProfile(): Promise<void> {
    await this.kv.delete(KV_KEY);
  }
}
