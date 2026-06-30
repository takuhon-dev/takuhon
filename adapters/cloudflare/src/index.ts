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
import { handleContact } from '@takuhon/contact';
import { contactWidgetCss, contactWidgetJs } from '@takuhon/contact/assets';
import { validate, type Takuhon } from '@takuhon/core';
import { Hono } from 'hono';

import exampleJson from '../../../examples/personal-profile/takuhon.json' with { type: 'json' };

import { serveActivitySvg } from './activity-svg.js';
import { syncActivity } from './activity-sync.js';
import { CloudflareCachePurger } from './admin/cloudflare-cache-purger.js';
import { consoleAuditLogger } from './admin/console-audit-logger.js';
import {
  createSendEmailTransport,
  createTurnstileVerifier,
  type SendEmailBinding,
} from './contact.js';
import { KvActivityStorage } from './kv-activity-storage.js';
import { KvTakuhonStorage } from './kv-storage.js';
import { serveMcp } from './mcp.js';
import { ASSET_CACHE_CONTROL, R2TakuhonAssetStorage } from './r2-storage.js';

export { buildInquiryEmail, createSendEmailTransport, createTurnstileVerifier } from './contact.js';
export type {
  InquiryEmail,
  SendEmailBinding,
  SendEmailTransportConfig,
  TurnstileVerifierOptions,
} from './contact.js';

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
  /**
   * R2 bucket holding uploaded image assets. Optional, mirroring {@link ASSETS}:
   * when bound, `POST /api/admin/assets` stores images here and `GET /assets/*`
   * serves them; when absent, the upload endpoint stays unregistered (404) and
   * avatars remain URL-only.
   */
  TAKUHON_R2?: R2Bucket;
  /**
   * GitHub token for the scheduled activity sync. Optional: languages are
   * fetched unauthenticated without it; the contribution calendar (GraphQL,
   * token-only) is simply skipped. Provision via
   * `wrangler secret put TAKUHON_GITHUB_TOKEN` — never in `wrangler.toml`.
   */
  TAKUHON_GITHUB_TOKEN?: string;
  /**
   * WakaTime API key for the scheduled activity sync; required to read coding
   * time (WakaTime has no unauthenticated mode). Provision via
   * `wrangler secret put TAKUHON_WAKATIME_KEY` — never in `wrangler.toml`.
   * Only flows through the sync step; never persisted.
   */
  TAKUHON_WAKATIME_KEY?: string;
  /**
   * Cloudflare `send_email` binding that delivers contact-form submissions.
   * Optional, like {@link ASSETS} / {@link TAKUHON_R2}: when bound, `POST
   * /api/contact` is mounted (and additionally requires `settings.contact`
   * `.enabled`); when absent the endpoint stays unmounted, so a stray POST
   * 405s and the contact form is effectively off regardless of the profile.
   * Provision with a `[[send_email]]` block in `wrangler.toml`.
   */
  TAKUHON_CONTACT_EMAIL?: SendEmailBinding;
  /**
   * Verified destination inbox for contact submissions (must be a
   * Cloudflare Email Routing-verified address). A missing value degrades to a
   * failed delivery (502), never a crash.
   */
  TAKUHON_CONTACT_TO?: string;
  /**
   * From address for contact emails; must be on a domain you control
   * (e.g. `noreply@example.com`). A missing value degrades to a 502.
   */
  TAKUHON_CONTACT_FROM?: string;
  /**
   * Turnstile secret key for server-side `siteverify`. Provision via
   * `wrangler secret put TAKUHON_TURNSTILE_SECRET` — never in `wrangler.toml`.
   * A missing secret degrades to a rejected challenge (422), never a crash.
   * The public site key is not here — it lives in `settings.contact`
   * `.turnstileSiteKey` because it is embedded in the page.
   */
  TAKUHON_TURNSTILE_SECRET?: string;
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
 * Public asset-delivery paths served from R2. Matches only the literal
 * `/assets/...` prefix, so a locale-prefixed `/{locale}/assets/...` is left to
 * the router (which 404s it) — asset delivery is intentionally locale-agnostic,
 * like `/health` and the admin surface.
 */
function isAssetPath(pathname: string): boolean {
  return pathname.startsWith('/assets/');
}

/**
 * The read-only MCP endpoint. Matches only the literal `/mcp`, so a
 * locale-prefixed `/{locale}/mcp` is left to the router (which 404s it) — the
 * endpoint is intentionally locale-agnostic, like `/health` and `/assets/*`.
 */
function isMcpPath(pathname: string): boolean {
  return pathname === '/mcp';
}

/**
 * The read-only activity-badge endpoint. Matches only the literal
 * `/activity.svg`, so a locale-prefixed `/{locale}/activity.svg` is left to the
 * router (which 404s it) — the endpoint is intentionally locale-agnostic, like
 * `/health`, `/assets/*`, and `/mcp`.
 */
function isActivitySvgPath(pathname: string): boolean {
  return pathname === '/activity.svg';
}

/**
 * The bundled contact-widget assets. Matches only the literal
 * `/contact-widget.{js,css}` (locale-agnostic, like `/mcp` and `/activity.svg`);
 * these are the URLs the server-rendered page references when the profile
 * enables the contact form.
 */
function isContactWidgetPath(pathname: string): boolean {
  return pathname === '/contact-widget.js' || pathname === '/contact-widget.css';
}

/**
 * Serve a bundled contact-widget asset (`GET`/`HEAD /contact-widget.{js,css}`).
 * The content is inlined into the Worker from `@takuhon/contact/assets`, so no
 * asset-hosting binding is needed; `nosniff` keeps the served type honest and a
 * moderate cache lets it refresh on the next deploy.
 */
function serveContactWidget(request: Request, url: URL): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const isJs = url.pathname === '/contact-widget.js';
  const headers = new Headers();
  headers.set('content-type', isJs ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'public, max-age=3600');
  const body = request.method === 'HEAD' ? null : isJs ? contactWidgetJs : contactWidgetCss;
  return new Response(body, { status: 200, headers });
}

/**
 * Handle a contact-form submission (`POST /api/contact`). The caller has
 * already confirmed the `send_email` binding is bound; this additionally
 * requires `settings.contact.enabled` (so disabling the form turns off the
 * endpoint too) and then runs the portable `handleContact` pipeline with the
 * Cloudflare Turnstile + `send_email` seams. Stateless and never throws: a
 * missing secret / recipient degrades to a 422 / 502 inside the pipeline.
 */
async function serveContact(
  request: Request,
  env: Env,
  fallback: () => Takuhon,
  url: URL,
): Promise<Response> {
  const storage = new KvTakuhonStorage(env.TAKUHON_KV);
  let profile: Takuhon;
  try {
    profile = (await storage.getProfile()).data;
  } catch {
    profile = fallback();
  }

  const contact = profile.settings.contact;
  if (contact?.enabled !== true) {
    // Form disabled in the profile: behave as if the endpoint were not mounted.
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // The binding presence is the caller's gate; assert it for the type.
  const binding = env.TAKUHON_CONTACT_EMAIL!;
  return handleContact(request, {
    verifier: createTurnstileVerifier(env.TAKUHON_TURNSTILE_SECRET ?? ''),
    transport: createSendEmailTransport(binding, {
      to: env.TAKUHON_CONTACT_TO ?? '',
      from: { email: env.TAKUHON_CONTACT_FROM ?? '' },
      ...(contact.subjectPrefix ? { subjectPrefix: contact.subjectPrefix } : {}),
    }),
    // Same-origin only: the widget POSTs from the page it is embedded on.
    config: { allowedOrigins: [url.origin] },
    readMeta: (req) => {
      const cf = (req as { cf?: { country?: unknown } }).cf;
      const country = typeof cf?.country === 'string' ? cf.country : undefined;
      const ip = req.headers.get('cf-connecting-ip') ?? undefined;
      return { ...(country ? { country } : {}), ...(ip ? { ip } : {}) };
    },
  });
}

/**
 * Serve an uploaded asset from R2 (`GET`/`HEAD /assets/*`). This is the public,
 * unauthenticated delivery proxy: the bucket stays private and the Worker
 * mediates every read so it can force `X-Content-Type-Options: nosniff`
 * (`security.md` §4.7) and an immutable cache policy. A missing object is 404.
 */
async function serveAsset(request: Request, bucket: R2Bucket, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  // The R2 object key is the pathname without its leading slash, e.g.
  // `/assets/1715432100-a8f3.webp` → `assets/1715432100-a8f3.webp`.
  const key = url.pathname.slice(1);
  const object = await bucket.get(key);
  if (object === null) {
    return new Response('Not Found', { status: 404 });
  }
  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType;
  if (contentType !== undefined) headers.set('content-type', contentType);
  // SECURITY-CRITICAL (security.md §4.7): force nosniff so a stored object can
  // never be reinterpreted as an active type (e.g. HTML) by the browser.
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', ASSET_CACHE_CONTROL);
  headers.set('etag', object.httpEtag);
  const body = request.method === 'HEAD' ? null : object.body;
  return new Response(body, { status: 200, headers });
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
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) => Promise<void>;
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

      // Serve uploaded assets from R2 when the bucket is bound. Without it,
      // `/assets/*` falls through to the router and 404s, matching the
      // unregistered upload endpoint.
      if (env.TAKUHON_R2 && isAssetPath(url.pathname)) {
        return serveAsset(request, env.TAKUHON_R2, url);
      }

      // Read-only MCP endpoint. Stateless (no Durable Object / session); reads
      // the profile from the same KV the public API uses.
      if (isMcpPath(url.pathname)) {
        return serveMcp(request, env.TAKUHON_KV, opts.fallback);
      }

      // Read-only activity badge. Renders the synced snapshot as a
      // self-contained SVG image (?theme=dark for the dark variant), re-checking
      // the settings.activity opt-in on every request — parity with
      // GET /api/activity.
      if (isActivitySvgPath(url.pathname)) {
        return serveActivitySvg(request, env.TAKUHON_KV, opts.fallback);
      }

      // Bundled contact-widget assets, referenced by the server-rendered page
      // when the contact form is enabled. Served from the Worker bundle, so no
      // asset binding is required (parity with /mcp and /activity.svg).
      if (isContactWidgetPath(url.pathname)) {
        return serveContactWidget(request, url);
      }

      // Contact-form submission. Mounted only when the send_email binding is
      // bound; serveContact additionally requires settings.contact.enabled.
      // Without the binding the POST falls through to the public app's 405.
      if (
        url.pathname === '/api/contact' &&
        request.method === 'POST' &&
        env.TAKUHON_CONTACT_EMAIL
      ) {
        return serveContact(request, env, opts.fallback, url);
      }

      const storage = new KvTakuhonStorage(env.TAKUHON_KV);
      // Enable image uploads only when an R2 bucket is bound; otherwise the
      // admin API leaves `POST /assets` unregistered, so uploads are disabled
      // and avatars stay URL-only. The public URL is built on this request's
      // origin since the Worker proxies delivery from its own `/assets/*` route.
      const assetStorage = env.TAKUHON_R2
        ? new R2TakuhonAssetStorage(env.TAKUHON_R2, { publicBaseUrl: url.origin })
        : undefined;
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
          assetStorage,
          getAdminToken: () => env.TAKUHON_ADMIN_TOKEN,
          getAdminOrigins: () => parseOrigins(env.TAKUHON_ADMIN_ORIGIN),
          cachePurger,
          auditLogger,
        }),
      );
      router.route('/admin', createAdminUiApp());
      router.route(
        '/',
        createPublicApp({
          storage,
          fallback: opts.fallback,
          // Serves `GET /api/activity` from the synced snapshot; the route
          // 404s while no snapshot is stored or activity is not enabled.
          activityStorage: new KvActivityStorage(env.TAKUHON_KV),
          // Advertise the read-only MCP endpoint in `/.well-known/takuhon.json`.
          mcpPath: '/mcp',
        }),
      );

      return router.fetch(request, env);
    },

    /**
     * Cron-driven activity sync (enable with a `[triggers] crons` entry in
     * `wrangler.toml`; daily is the recommended cadence). MUST NOT throw: a
     * failed sync keeps the last-known snapshot and surfaces through the
     * structured log line below (captured by Workers Tail / Logpush), never by
     * failing the cron run.
     */
    async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
      const timestamp = new Date().toISOString();
      try {
        const result = await syncActivity({
          profileStorage: new KvTakuhonStorage(env.TAKUHON_KV),
          activityStorage: new KvActivityStorage(env.TAKUHON_KV),
          secrets: {
            githubToken: env.TAKUHON_GITHUB_TOKEN,
            wakatimeKey: env.TAKUHON_WAKATIME_KEY,
          },
          fallback: opts.fallback,
        });
        const type =
          result.status === 'synced'
            ? 'activity.sync.success'
            : result.status === 'empty'
              ? 'activity.sync.failure'
              : 'activity.sync.skipped';
        console.log(
          JSON.stringify({ type, timestamp, reason: result.reason, failures: result.failures }),
        );
      } catch (err) {
        console.error(
          JSON.stringify({
            type: 'activity.sync.failure',
            timestamp,
            reason: err instanceof Error ? err.message : String(err),
            failures: [],
          }),
        );
      }
    },
  };
}

function bundledFallback(): Takuhon {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('Bundled fixture failed validation.');
  return r.data;
}

export default createTakuhonWorker({ fallback: bundledFallback });
