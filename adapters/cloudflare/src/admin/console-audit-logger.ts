import type { AuditEvent, AuditLogger } from '@takuhon/api';

/**
 * `AuditLogger` that writes a single line of JSON per event to `console.log`.
 *
 * Cloudflare captures these via Workers Tail / Logpush, where they can be
 * routed to R2, S3, or any downstream SIEM. Token bodies never reach this
 * sink — the upstream middleware only emits `sha256:<hex>` digests in
 * `actor.tokenHash`.
 */
export const consoleAuditLogger: AuditLogger = (event: AuditEvent): void => {
  console.log(JSON.stringify(event));
};
