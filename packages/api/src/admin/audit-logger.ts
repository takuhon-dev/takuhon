/**
 * Structured audit-log emitter for admin actions (per security.md §5).
 *
 * Phase 3.4 covers the auth + profile-write events. Asset events
 * (`admin.asset.upload`, `admin.asset.delete`) join the union when Phase 3.5
 * lands. Adapters bind a concrete sink (Cloudflare uses `console.log`, which
 * Workers Tail / Logpush captures); tests inject a `vi.fn()` recorder.
 */
export type AuditEventType =
  | 'admin.auth.success'
  | 'admin.auth.failure'
  | 'admin.profile.update'
  | 'admin.profile.delete'
  | 'admin.cache.purge';

export interface AuditEvent {
  type: AuditEventType;
  /** ISO-8601 UTC timestamp generated at the call site. */
  timestamp: string;
  /**
   * Actor identity. `tokenHash` is `sha256:<hex>` over the presented Bearer
   * token, or `sha256:absent` when no token was supplied. The raw token is
   * never logged.
   */
  actor?: { tokenHash: string };
  request: {
    method: string;
    path: string;
    /** Originating client IP from `cf-connecting-ip`; undefined off-Cloudflare. */
    ip?: string;
  };
  result: {
    status: number;
    /** Opaque storage version emitted by `TakuhonStorage.saveProfile`. */
    version?: string;
  };
}

export type AuditLogger = (event: AuditEvent) => void;

/** Default sink that discards events; useful for tests and bare runtimes. */
export const noopAuditLogger: AuditLogger = () => {
  /* no-op */
};
