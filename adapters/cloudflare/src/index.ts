import {
  ERROR_SLUGS,
  adminAssetSecurityHeaders,
  createAdminApiApp,
  createAdminUiApp,
  createPublicApp,
  localePrefixGetPath,
  problemResponse,
  type AuditLogger,
  type CachePurger,
} from '@takuhon/api';
import { validate, type Takuhon } from '@takuhon/core';
import { Hono } from 'hono';

import exampleJson from '../../../examples/personal-profile/takuhon.json' with { type: 'json' };

import { CloudflareCachePurger } from './admin/cloudflare-cache-purger.js';
import { consoleAuditLogger } from './admin/console-audit-logger.js';
import { KvTakuhonStorage } from './kv-storage.js';

export interface Env {
  TAKUHON_KV: KVNamespace;
  /**
   * Admin bearer token. Provision via `wrangler secret put TAKUHON_ADMIN_TOKEN`.
   * Leave unset to disable admin writes entirely (every PUT/DELETE returns 401).
   */
  TAKUHON_ADMIN_TOKEN?: string;
  /**
   * Comma-separated Origin allowlist for browser-originating admin requests.
   * Empty / unset disables the check (deploy without a configured allowlist is
   * acceptable when the admin UI is same-origin; documented in the README).
   */
  TAKUHON_ADMIN_ORIGIN?: string;
  /**
   * Workers Assets binding holding the bundled admin SPA (`apps/admin`). When
   * present, `/admin/*` is served from it under a strict CSP; when absent, the
   * Worker falls back to the inline `createAdminUiApp` editor, so deployments
   * without Workers Assets configured still have a working admin.
   */
  ASSETS?: Fetcher;
}

/** Options accepted by {@link createTakuhonWorker}. */
export interface CreateTakuhonWorkerOptions {
  /**
   * Lazy producer for the fallback Takuhon document served when KV has no
   * stored profile yet. Called at most once per Worker invocation, on the
   * cold path where the storage layer returns no entry. Implementations
   * typically import a bundled `takuhon.json`, validate it once, and return
   * the resulting value.
   */
  readonly fallback: () => Takuhon;
}

function parseOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Admin UI (not the `/api/admin` API) request paths served from the SPA bundle. */
function isAdminUiPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Serve the admin SPA from the Workers Assets binding. The bundle's files live
 * at the assets root, so the `/admin` prefix is stripped before lookup; `/admin`
 * and `/admin/` map to `index.html`. The strict admin CSP / security headers are
 * applied to every response (the binding's own headers would otherwise cache
 * the operator-only UI and omit the policy).
 */
async function serveAdminSpa(request: Request, assets: Fetcher, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  // Strip the `/admin` mount prefix; `/admin` and `/admin/` map to the bundle
  // root `/` (which Workers Assets serves as index.html). Requesting
  // `/index.html` directly would 307-redirect under `auto-trailing-slash`.
  const rest = url.pathname.slice('/admin'.length);
  const assetPath = rest === '' ? '/' : rest;
  const assetResponse = await assets.fetch(new Request(new URL(assetPath, url.origin), request));
  const headers = new Headers(assetResponse.headers);
  for (const [name, value] of Object.entries(adminAssetSecurityHeaders())) {
    headers.set(name, value);
  }
  // The admin UI is `private, no-store`, so a conditional-request ETag carried
  // over from the binding would be misleading — drop it.
  headers.delete('etag');
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

/**
 * Build a Cloudflare Worker handler for the takuhon adapter. Wires
 * `@takuhon/api`'s public/admin app factories to the KV-backed storage,
 * Cloudflare edge cache purger, and console audit logger that ship with
 * this package.
 *
 * This is the entry point used by projects scaffolded with
 * `create-takuhon`: their `src/index.ts` imports `createTakuhonWorker`,
 * passes a `fallback` that loads the project's own `takuhon.json`, and
 * `export default`s the returned handler. The default export of this
 * module is a convenience that calls the same factory with the monorepo's
 * bundled `personal-profile` fixture.
 */
export function createTakuhonWorker(opts: CreateTakuhonWorkerOptions): {
  fetch: (request: Request, env: Env) => Response | Promise<Response>;
} {
  return {
    fetch(request: Request, env: Env): Response | Promise<Response> {
      const url = new URL(request.url);

      // Serve the bundled admin SPA when a Workers Assets binding is present.
      // Without it, the request falls through to the inline editor mounted on
      // the router below, so admin stays available either way.
      if (env.ASSETS && isAdminUiPath(url.pathname)) {
        return serveAdminSpa(request, env.ASSETS, url);
      }

      const storage = new KvTakuhonStorage(env.TAKUHON_KV);
      const cachePurger: CachePurger = new CloudflareCachePurger(() => caches.default, {
        origin: url.origin,
      });
      const auditLogger: AuditLogger = consoleAuditLogger;

      // `getPath` strips a leading `/{locale}` prefix before route
      // matching. This is the production-critical placement: Hono's
      // `route()` flattens each mounted sub-app's routes into this router
      // and dispatches with this router's `getPath` only, so a `getPath`
      // set on the public sub-app alone would not run here. The shared
      // function's allowlist guard never strips admin remainders, so
      // `/api/admin/*` and `/admin/*` mounts stay locale-agnostic.
      const router = new Hono({ getPath: localePrefixGetPath });
      router.notFound((c) =>
        problemResponse(c, {
          slug: ERROR_SLUGS.notFound,
          status: 404,
          title: 'Not Found',
          detail: `No route matches ${new URL(c.req.url).pathname}.`,
        }),
      );
      router.route(
        '/api/admin',
        createAdminApiApp({
          storage,
          getAdminToken: () => env.TAKUHON_ADMIN_TOKEN,
          getAdminOrigins: () => parseOrigins(env.TAKUHON_ADMIN_ORIGIN),
          cachePurger,
          auditLogger,
        }),
      );
      router.route('/admin', createAdminUiApp());
      router.route('/', createPublicApp({ storage, fallback: opts.fallback }));

      return router.fetch(request, env);
    },
  };
}

function bundledFallback(): Takuhon {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('Bundled fixture failed validation.');
  return r.data;
}

export default createTakuhonWorker({ fallback: bundledFallback });
