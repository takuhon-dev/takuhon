/**
 * `@takuhon/vercel` — read-only Vercel adapter for takuhon.
 *
 * Publishes a profile on Vercel by mounting the framework-agnostic public app
 * from `@takuhon/api` — the server-rendered profile page (with embedded
 * JSON-LD), the public read API (`/api/profile`, `/api/jsonld`, `/api/schema`),
 * and `GET /takuhon.json` / `/.well-known/takuhon.json` — on the Vercel
 * runtime. It carries no database, admin UI, or auth: the canonical
 * `takuhon.json` is bundled into the repository or fetched from
 * `TAKUHON_DATA_URL`, and editing happens through Git (edit, push, redeploy).
 *
 * Cloudflare-only surfaces are intentionally absent: image uploads
 * (`/assets/*`), the MCP endpoint (`/mcp`), and the activity badge / sync
 * (`/activity.svg`, cron). `createPublicApp` answers 404 for `GET /api/activity`
 * when no activity snapshot is supplied, and omits `mcp` from the discovery
 * document, so a Vercel deployment never advertises an endpoint it does not
 * host.
 */

import {
  createPublicApp,
  localePrefixGetPath,
  type PublicAppDeps,
  type PublicRenderOptions,
} from '@takuhon/api';
import { Hono } from 'hono';

export { BundledTakuhonStorage, UrlTakuhonStorage } from './storage.js';
export type { UrlTakuhonStorageOptions } from './storage.js';

/**
 * Options for {@link createTakuhonVercelApp}: a read-only subset of
 * {@link PublicAppDeps}. Only `storage` (required) and `fallback` (optional)
 * are accepted; `activityStorage` and `mcpPath` are deliberately omitted
 * because those surfaces are not part of a read-only Vercel deployment.
 */
export interface CreateTakuhonVercelAppOptions {
  /** Read-only profile source (e.g. {@link BundledTakuhonStorage}). */
  storage: PublicAppDeps['storage'];
  /**
   * Profile returned when `storage` reports {@link import('@takuhon/core').NotFoundError}.
   * Rarely needed for the bundled case, where the document is always present.
   */
  fallback?: PublicAppDeps['fallback'];
  /**
   * First-party host composition for the profile page: renderer `slots` /
   * `labels` / `omitSections` plus an optional CSP extension (see
   * {@link PublicRenderOptions}). Omitted (the default) leaves the page and its
   * strict CSP untouched.
   */
  render?: PublicRenderOptions;
}

/**
 * Build the Hono app for a read-only Vercel deployment.
 *
 * Mount it with `hono/vercel`'s `handle` in an App Router catch-all route:
 *
 * ```ts
 * // app/[[...route]]/route.ts
 * import { createTakuhonVercelApp, BundledTakuhonStorage } from '@takuhon/vercel';
 * import { handle } from 'hono/vercel';
 * import profile from '../../takuhon.json';
 *
 * const app = createTakuhonVercelApp({ storage: new BundledTakuhonStorage(profile) });
 * export const GET = handle(app);
 * ```
 *
 * The top-level router sets the same `getPath` as the public app so that
 * locale-prefixed URLs (e.g. `/ja/api/profile`) dispatch correctly: Hono
 * flattens a `route()`d sub-app into the parent and dispatches using the
 * parent's `getPath`, so it must be set here too — setting it only inside
 * `createPublicApp` is honored for direct `app.fetch()` but not once mounted.
 */
export function createTakuhonVercelApp(options: CreateTakuhonVercelAppOptions): Hono {
  const app = new Hono({ getPath: localePrefixGetPath });
  app.route(
    '/',
    createPublicApp({
      storage: options.storage,
      fallback: options.fallback,
      render: options.render,
    }),
  );
  return app;
}
