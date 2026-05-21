/**
 * Cache invalidation contract for admin write paths.
 *
 * `@takuhon/api` stays adapter-neutral, so the actual edge-cache calls live
 * in each adapter (Cloudflare's `caches.default.delete`, future runtimes'
 * equivalents). Tests inject a recording implementation to assert that the
 * admin handlers fire the right purge after a successful write.
 */
export interface CachePurger {
  /** Called after a successful `PUT /api/admin/profile`. */
  profileUpdated(): Promise<void>;
  /** Called after a successful `DELETE /api/admin/profile`. */
  profileDeleted(): Promise<void>;
}

/**
 * No-op default: callers that don't run on an edge cache (Node dev server,
 * unit tests that don't care about purge calls) can pass this in.
 */
export const noopCachePurger: CachePurger = {
  profileUpdated: () => Promise.resolve(),
  profileDeleted: () => Promise.resolve(),
};
