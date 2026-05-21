import { ConflictError, NotFoundError, type Ownport, type OwnportStorage } from '@takuhon/core';

export const KV_KEY = 'OWNPORT_DATA';

export interface KvMetadata {
  version: string;
  updatedAt: string;
}

/**
 * Cloudflare KV implementation of the `OwnportStorage` contract. Stores the
 * profile document as JSON under a single key (`OWNPORT_DATA`) and tracks the
 * optimistic-locking token inside KV value metadata.
 *
 * `version` is a fresh UUIDv4 on every successful write. Callers compare it
 * verbatim against the `If-Match` precondition; mismatches raise
 * `ConflictError` with `currentVersion` so the API layer can build the RFC
 * 7807 envelope without an extra round trip.
 */
export class KvOwnportStorage implements OwnportStorage {
  constructor(private readonly kv: KVNamespace) {}

  async getProfile(): Promise<{ data: Ownport; version: string }> {
    const result = await this.kv.getWithMetadata<Ownport, KvMetadata>(KV_KEY, 'json');
    if (result.value === null || !result.metadata?.version) {
      throw new NotFoundError(`No profile is stored at KV key "${KV_KEY}".`);
    }
    return { data: result.value, version: result.metadata.version };
  }

  async saveProfile(data: Ownport, ifMatch?: string): Promise<{ version: string }> {
    if (ifMatch !== undefined) {
      const current = await this.kv.getWithMetadata<Ownport, KvMetadata>(KV_KEY, 'json');
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
