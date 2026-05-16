import type { Context, Next } from 'hono';

import { ERROR_SLUGS, problemResponse } from '../error-envelope.js';

import type { AuditLogger } from './audit-logger.js';

/**
 * Constant-time byte comparison.
 *
 * Iterates over `max(len(a), len(b))` bytes so wall-clock cost is independent
 * of *where* a mismatch occurs and of length differences (within the same
 * length class). Length-mismatch is folded into the accumulator so the
 * boolean result still discriminates correctly.
 *
 * This is intentionally a from-scratch implementation rather than
 * `crypto.subtle.timingSafeEqual`, which Cloudflare Workers exposes but
 * Node lacks — `@meport/api` is adapter-neutral.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = a.length > b.length ? a.length : b.length;
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    diff |= ai ^ bi;
  }
  return diff === 0;
}

/** SHA-256 hex digest (lowercase) over a UTF-8 string. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Extracts the Bearer token from the request and returns a stable
 * `sha256:<hex>` digest used as the actor identity in audit logs. Returns
 * `sha256:absent` when no token is present.
 */
export async function getActorTokenHash(c: Context): Promise<string> {
  const header = c.req.header('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const token = m?.[1] ?? '';
  if (token === '') return 'sha256:absent';
  return `sha256:${await sha256Hex(token)}`;
}

export interface BearerMiddlewareOptions {
  /**
   * Source of the expected admin token. Returns `undefined` when the deploy
   * has not provisioned a secret — in that case every request is rejected,
   * mirroring "no admin access" semantics.
   */
  getAdminToken: () => string | undefined;
  auditLogger: AuditLogger;
}

/**
 * Hono middleware that gates downstream handlers on a constant-time Bearer
 * token check. Emits an audit event for both success and failure.
 */
export function bearerMiddleware(opts: BearerMiddlewareOptions) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const expected = opts.getAdminToken();
    const header = c.req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const presented = match?.[1];

    const isOk =
      expected !== undefined &&
      presented !== undefined &&
      constantTimeEqual(new TextEncoder().encode(presented), new TextEncoder().encode(expected));

    const tokenHash = await getActorTokenHash(c);
    const baseRequest = {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      ip: c.req.header('cf-connecting-ip'),
    };

    if (!isOk) {
      opts.auditLogger({
        type: 'admin.auth.failure',
        timestamp: new Date().toISOString(),
        actor: { tokenHash },
        request: baseRequest,
        result: { status: 401 },
      });
      return problemResponse(c, {
        slug: ERROR_SLUGS.unauthorized,
        status: 401,
        title: 'Unauthorized',
        detail: 'Bearer token missing or invalid.',
      });
    }

    opts.auditLogger({
      type: 'admin.auth.success',
      timestamp: new Date().toISOString(),
      actor: { tokenHash },
      request: baseRequest,
      result: { status: 200 },
    });

    await next();
  };
}
