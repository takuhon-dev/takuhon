import type { Context, Next } from 'hono';

import { ERROR_SLUGS, problemResponse } from '../error-envelope.js';

export interface OriginMiddlewareOptions {
  /**
   * Returns the allowlist of admin Origins (e.g.
   * `['https://admin.example.com']`). Empty list disables the check —
   * deploys are expected to populate the env before going to production,
   * with the trade-off documented in the adapter README.
   */
  getAdminOrigins: () => string[];
}

/**
 * Hono middleware that enforces a same-origin / allowlisted-origin policy
 * when configured. Requests without an `Origin` header (curl, server-to-
 * server, native apps) are allowed through; the Bearer token is the primary
 * auth boundary and the absence of `Origin` is itself an indicator that the
 * request did not originate from a browser CSRF context.
 */
export function originMiddleware(opts: OriginMiddlewareOptions) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const allow = opts.getAdminOrigins();
    if (allow.length === 0) {
      await next();
      return;
    }
    const origin = c.req.header('origin');
    if (origin !== undefined && !allow.includes(origin)) {
      return problemResponse(c, {
        slug: ERROR_SLUGS.forbidden,
        status: 403,
        title: 'Forbidden',
        detail: `Origin ${origin} is not in the admin allowlist.`,
      });
    }
    await next();
  };
}
