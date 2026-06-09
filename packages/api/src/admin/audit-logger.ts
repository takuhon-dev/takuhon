/**
 * Structured audit-log emitter for admin actions (per security.md §5).
 *
 * Covers the auth, profile-write, and asset events. Adapters bind a concrete
 * sink (Cloudflare uses `console.log`, which Workers Tail / Logpush captures);
 * tests inject a `vi.fn()` recorder.
 */
export type AuditEventType =
  | 'admin.auth.success'
  | 'admin.auth.failure'
  | 'admin.profile.update'
  | 'admin.profile.delete'
  | 'admin.profile.export'
  | 'admin.asset.upload'
  | 'admin.asset.delete'
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
  /**
   * Asset details for `admin.asset.upload` / `admin.asset.delete` events
   * (security.md §5: object key, MIME, and size). Absent for other events.
   */
  asset?: {
    key: string;
    mimeType?: string;
    size?: number;
  };
}

export type AuditLogger = (event: AuditEvent) => void;

/** Default sink that discards events; useful for tests and bare runtimes. */
export const noopAuditLogger: AuditLogger = () => {
  /* no-op */
};
