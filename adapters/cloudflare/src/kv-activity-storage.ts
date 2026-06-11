import { isActivitySnapshot, type ActivitySnapshot, type ActivityStorage } from '@takuhon/core';

/**
 * KV key holding the synced developer-activity snapshot. A second key in the
 * same namespace as the profile (`TAKUHON_DATA`): the snapshot is a sibling
 * document, machine-written by the scheduled sync and deliberately kept out of
 * the canonical profile document.
 */
export const ACTIVITY_KV_KEY = 'TAKUHON_ACTIVITY';

/**
 * Cloudflare KV implementation of the `ActivityStorage` contract.
 *
 * Reads are forgiving: an absent, unparseable, or malformed value resolves to
 * `null` (never throws), because a missing snapshot is the normal pre-sync /
 * opt-out state and the renderer simply omits the activity section. Writes are
 * last-writer-wins with no version metadata — the snapshot carries its own
 * `lastSyncedAt`, and the only writer is the scheduled sync.
 */
export class KvActivityStorage implements ActivityStorage {
  constructor(private readonly kv: KVNamespace) {}

  async getActivitySnapshot(): Promise<ActivitySnapshot | null> {
    const raw = await this.kv.get(ACTIVITY_KV_KEY, 'text');
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A corrupt snapshot is treated as absent, not fatal: the next sync
      // rewrites it whole, and the renderer omits the section meanwhile.
      return null;
    }
    return isActivitySnapshot(parsed) ? parsed : null;
  }

  async saveActivitySnapshot(snapshot: ActivitySnapshot): Promise<void> {
    await this.kv.put(ACTIVITY_KV_KEY, JSON.stringify(snapshot));
  }
}
