import {
  ERROR_SLUGS,
  createAdminApiApp,
  createAdminUiApp,
  createPublicApp,
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
      const storage = new KvTakuhonStorage(env.TAKUHON_KV);
      const cachePurger: CachePurger = new CloudflareCachePurger(() => caches.default, {
        origin: url.origin,
      });
      const auditLogger: AuditLogger = consoleAuditLogger;

      const router = new Hono();
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
