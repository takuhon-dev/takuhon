import {
  NotFoundError,
  SCHEMA_VERSION,
  applyPublicPrivacyFilter,
  generateJsonLd,
  normalize,
  resolveLocale,
  schema,
  type ActivityStorage,
  type Takuhon,
  type TakuhonStorage,
} from '@takuhon/core';
import { Hono } from 'hono';

import { ERROR_SLUGS, problemResponse } from './error-envelope.js';
import { renderProfileHtml } from './html/build-html.js';
import { localePrefixGetPath, pathLocaleFromUrl } from './locale-prefix.js';
import { resolveRequestLocales } from './locale-resolution.js';

export interface PublicAppDeps {
  storage: TakuhonStorage;
  /**
   * Returned when storage reports NotFoundError. Adapters that ship a
   * bundled example fixture (e.g. @takuhon/cloudflare) pass a thunk that
   * returns the validated document so initial-onboarding requests still
   * succeed before the first admin write.
   */
  fallback?: () => Takuhon;
  /**
   * Source of the synced developer-activity snapshot, exposed at
   * `GET /api/activity`. Optional, like the admin app's `assetStorage`:
   * deployments that don't sync activity leave it unset and the route
   * answers 404. The route also answers 404 while `settings.activity` is
   * not enabled in the profile, so disabling the feature stops serving a
   * previously synced snapshot immediately.
   */
  activityStorage?: ActivityStorage;
  /**
   * Path of the read-only MCP endpoint, advertised in
   * `/.well-known/takuhon.json` as `mcp`. Only set it on adapters that actually
   * serve MCP (e.g. @takuhon/cloudflare's `/mcp`); left unset, the discovery
   * document omits `mcp` so static / Vercel deployments don't point at an
   * endpoint they don't host.
   */
  mcpPath?: string;
}

const FALLBACK_VERSION = 'bundled-fixture';

const PUBLIC_CSP = [
  "default-src 'self'",
  // `https:` lets the server-rendered profile page load remote avatar images
  // (the schema permits any https avatar URL, and `safeUrl` in the renderer
  // already blocks non-http(s) schemes); `data:` covers inline placeholders.
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

async function loadProfile(deps: PublicAppDeps): Promise<{ data: Takuhon; version: string }> {
  try {
    return await deps.storage.getProfile();
  } catch (e) {
    if (e instanceof NotFoundError && deps.fallback) {
      return { data: deps.fallback(), version: FALLBACK_VERSION };
    }
    throw e;
  }
}

export function createPublicApp(deps: PublicAppDeps): Hono {
  // `getPath` strips a leading `/{locale}` prefix (e.g. `/ja/api/profile`
  // → `/api/profile`) so the flat routes below match locale-prefixed
  // URLs. The same function is applied on the adapter's top-level router,
  // because Hono's `route()` flattens this app's routes into the parent
  // and dispatches with the parent's `getPath` only — setting it here
  // alone would be honored for direct `app.fetch()` (tests) but not in
  // production. Handlers recover the locale token from the original URL
  // (`c.req.url`), which `getPath` does not mutate.
  const app = new Hono({ getPath: localePrefixGetPath });

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    h.set('x-content-type-options', 'nosniff');
    h.set('x-frame-options', 'DENY');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    h.set('content-security-policy', PUBLIC_CSP);
    // Every route on this app is unauthenticated, read-only, and already
    // privacy-filtered, so the responses are safe to expose to any origin. This
    // is what lets browsers and AI tools fetch the profile / JSON-LD / discovery
    // document cross-origin — the public API's "read anywhere" goal. No cookies
    // or credentials are involved, so `*` is correct and `Vary: Origin` is not
    // needed; preflights are answered by the OPTIONS handler below. The admin
    // app (createAdminApiApp) is a separate Hono instance and is unaffected.
    h.set('access-control-allow-origin', '*');
    h.set('access-control-expose-headers', 'ETag');
  });

  app.onError((err, c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.internal,
      status: 500,
      title: 'Internal Error',
      detail: err instanceof Error ? err.message : 'Unknown failure',
    }),
  );

  app.notFound((c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.notFound,
      status: 404,
      title: 'Not Found',
      detail: `No route matches ${new URL(c.req.url).pathname}.`,
    }),
  );

  // The public profile page. `getPath` has already stripped any `/{locale}`
  // prefix, so this single route serves `/` (default locale) and `/<locale>/`
  // alike; the locale token is recovered from the original URL. The same
  // load → normalize → resolveLocale → privacy-filter pipeline that backs
  // `/api/profile` feeds the pure `renderProfileHtml`, so the page a visitor —
  // and any crawler reading the embedded JSON-LD — sees matches the API and the
  // static `takuhon build` output exactly. Canonical / hreflang are derived
  // from this request's own origin, so they are correct without configuration.
  app.get('/', async (c) => {
    const { data, version } = await loadProfile(deps);
    const profile = normalize(data);
    const { locale, fallbackLocale } = resolveRequestLocales(
      c,
      profile.settings.availableLocales,
      pathLocaleFromUrl(c.req.url),
    );
    const localized = applyPublicPrivacyFilter(resolveLocale(profile, locale, fallbackLocale));

    const defaultLocale = profile.settings.defaultLocale;
    const locales = [...new Set([defaultLocale, ...profile.settings.availableLocales])];
    const current = localized.resolvedLocale;
    const origin = new URL(c.req.url).origin;
    const localePath = (l: string): string => (l === defaultLocale ? '/' : `/${l}/`);

    const snapshot =
      profile.settings.activity?.enabled === true && deps.activityStorage
        ? await deps.activityStorage.getActivitySnapshot()
        : null;

    const html = renderProfileHtml({
      localized,
      canonicalUrl: `${origin}${localePath(current)}`,
      alternates: [
        ...locales.map((l) => ({ hreflang: l, href: `${origin}${localePath(l)}` })),
        { hreflang: 'x-default', href: `${origin}${localePath(defaultLocale)}` },
      ],
      localeNav: locales.map((l) => ({ locale: l, href: localePath(l), current: l === current })),
      jsonLd: profile.settings.enableJsonLd !== false,
      activitySnapshot: snapshot ?? undefined,
    });

    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300');
    c.header('vary', 'Accept-Language, Cookie');
    return c.html(html);
  });

  // Liveness probe. Intentionally storage-independent: it reports that the
  // worker itself is serving requests, not that the profile store is
  // reachable. A readiness probe that also checks storage can be added
  // later under a separate path if deployment platforms need it.
  app.get('/health', (c) => {
    c.header('cache-control', 'no-store');
    return c.json({ status: 'ok', schemaVersion: SCHEMA_VERSION });
  });

  app.get('/api/profile', async (c) => {
    const { data, version } = await loadProfile(deps);
    const { locale, fallbackLocale } = resolveRequestLocales(
      c,
      data.settings.availableLocales,
      pathLocaleFromUrl(c.req.url),
    );
    const localized = applyPublicPrivacyFilter(
      resolveLocale(normalize(data), locale, fallbackLocale),
    );
    const body = {
      data: localized,
      meta: {
        schemaVersion: localized.schemaVersion,
        locale: localized.resolvedLocale,
        updatedAt: localized.meta.updatedAt,
      },
    };
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'private, max-age=300');
    c.header('vary', 'Accept-Language, Cookie');
    return c.json(body);
  });

  app.get('/api/schema', (c) => c.json(schema));

  // Public read of the synced developer-activity snapshot (design decision
  // §9-5: public, like /api/profile). The snapshot is already owner-derived
  // public metrics — no privacy filter applies — but the owner's opt-in is
  // re-checked on every read so disabling `settings.activity` takes effect
  // immediately, even while a stale snapshot is still stored. All three
  // unavailable states answer the same 404 problem.
  app.get('/api/activity', async (c) => {
    const unavailable = (): Response =>
      problemResponse(c, {
        slug: ERROR_SLUGS.notFound,
        status: 404,
        title: 'Not Found',
        detail: 'No activity snapshot is available.',
      });

    if (!deps.activityStorage) return unavailable();
    const { data } = await loadProfile(deps);
    if (data.settings.activity?.enabled !== true) return unavailable();
    const snapshot = await deps.activityStorage.getActivitySnapshot();
    if (snapshot === null) return unavailable();

    c.header('cache-control', 'public, max-age=300');
    return c.json(snapshot);
  });

  app.get('/api/jsonld', async (c) => {
    const { data, version } = await loadProfile(deps);
    const { locale, fallbackLocale } = resolveRequestLocales(
      c,
      data.settings.availableLocales,
      pathLocaleFromUrl(c.req.url),
    );
    const localized = applyPublicPrivacyFilter(
      resolveLocale(normalize(data), locale, fallbackLocale),
    );
    const ld = generateJsonLd(localized);
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'private, max-age=300');
    c.header('vary', 'Accept-Language, Cookie');
    c.header('content-type', 'application/ld+json; charset=utf-8');
    return c.body(JSON.stringify(ld));
  });

  app.get('/takuhon.json', async (c) => {
    const { data, version } = await loadProfile(deps);
    const filtered = applyPublicPrivacyFilter(data);
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300');
    return c.json(filtered);
  });

  app.get('/.well-known/takuhon.json', (c) => {
    c.header('cache-control', 'public, max-age=3600');
    return c.json({
      schemaVersion: SCHEMA_VERSION,
      schemaUrl: '/api/schema',
      profile: '/api/profile',
      jsonld: '/api/jsonld',
      export: '/api/admin/export',
      canonical: '/takuhon.json',
      // Only advertised when the adapter serves MCP (see PublicAppDeps.mcpPath).
      ...(deps.mcpPath !== undefined ? { mcp: deps.mcpPath } : {}),
    });
  });

  // CORS preflight for cross-origin reads. The actual GET responses carry
  // `Access-Control-Allow-Origin` via the middleware above; this answers the
  // preflight a browser sends before a non-simple cross-origin request (a
  // simple GET needs no preflight). Without this, OPTIONS would fall through to
  // the 404 handler and the preflight would fail.
  app.options('*', (c) => {
    c.header('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    c.header('access-control-allow-headers', c.req.header('access-control-request-headers') ?? '*');
    c.header('access-control-max-age', '86400');
    return c.body(null, 204);
  });

  app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '*', (c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.methodNotAllowed,
      status: 405,
      title: 'Method Not Allowed',
      detail: `${c.req.method} ${new URL(c.req.url).pathname} is not supported on the public app.`,
    }),
  );

  return app;
}
