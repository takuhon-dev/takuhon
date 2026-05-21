import type { CachePurger } from '@takuhon/api';

export interface CloudflareCachePurgerOptions {
  /**
   * Absolute origin (e.g. `https://example.com`) used to build the URLs
   * passed to `Cache.delete`. The Worker derives this from the incoming
   * request's URL so the same code works under any production hostname.
   */
  origin: string;
  /**
   * Locale codes to include when purging language-keyed cache entries.
   * Cloudflare caches `?lang=` query variants as distinct keys; we purge
   * a representative set on every write. Adapters can extend the list to
   * cover other locales the deploy serves.
   */
  langs?: string[];
}

/**
 * `CachePurger` backed by Cloudflare's colo-local `caches.default`.
 *
 * Limitations (documented in the adapter README):
 *  - Cloudflare's `Cache.delete` clears the current colo only, not the
 *    entire edge. Other colos honour the response's `Cache-Control`
 *    `s-maxage` (5 minutes today) before refreshing.
 *  - Truly global invalidation requires the REST `/purge_cache` API,
 *    which needs a zone-scoped token; that's deferred to a later phase.
 */
export class CloudflareCachePurger implements CachePurger {
  private readonly origin: string;
  private readonly langs: string[];

  /**
   * `getCache` is a thunk so the Workers-only `caches` global is touched
   * lazily — public-only requests on this Worker never run admin handlers
   * and must not pay (or fail under Node tests) for the lookup.
   */
  constructor(
    private readonly getCache: () => Cache,
    opts: CloudflareCachePurgerOptions,
  ) {
    this.origin = opts.origin.replace(/\/$/, '');
    this.langs = opts.langs ?? ['en', 'ja'];
  }

  async profileUpdated(): Promise<void> {
    await this.purge();
  }

  async profileDeleted(): Promise<void> {
    await this.purge();
  }

  private async purge(): Promise<void> {
    const cache = this.getCache();
    const targets = ['/', '/api/profile', '/api/jsonld', '/ownport.json'];
    for (const lang of this.langs) {
      const q = `?lang=${encodeURIComponent(lang)}`;
      targets.push(`/api/profile${q}`, `/api/jsonld${q}`);
    }
    for (const path of targets) {
      await cache.delete(new Request(this.origin + path), { ignoreMethod: true });
    }
  }
}
