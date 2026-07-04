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
import { renderProfileHtml, type RenderInput } from './html/build-html.js';
import { localePrefixGetPath, pathLocaleFromUrl } from './locale-prefix.js';
import { resolveRequestLocales } from './locale-resolution.js';

declare module 'hono' {
  interface ContextVariableMap {
    /**
     * Set by the `/` handler when it embeds the contact widget, so the
     * security-headers middleware serves the Turnstile-allowing CSP variant for
     * that one response and the strict default everywhere else.
     */
    contactEnabled?: boolean;
    /**
     * Set by the `/` handler so the security-headers middleware serves the
     * host-extended CSP (`deps.render.csp`) on the profile page only; every
     * other route keeps the strict `'self'` policy.
     */
    profilePage?: boolean;
  }
}

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
  /**
   * First-party host composition applied to the server-rendered profile page
   * (`GET /`): the renderer's `slots` / `labels` / `omitSections` (see
   * {@link RenderInput}) plus an optional {@link PublicRenderCsp} that widens the
   * page's Content-Security-Policy so injected slots can load their scripts.
   * Absent (the turnkey default) leaves the page and its strict CSP untouched.
   */
  render?: PublicRenderOptions;
}

/**
 * Declarative, additive extensions to the public profile page's
 * Content-Security-Policy (see {@link PublicRenderOptions.csp}). Each list is
 * appended to the corresponding base directive; `scriptHashes` (e.g.
 * `'sha256-…'`) are appended to `script-src` so a specific inline script — such
 * as a service-worker registration injected via a slot — is allowed WITHOUT a
 * blanket `'unsafe-inline'`. Only the profile page's CSP is widened; every other
 * public route keeps the strict `'self'` policy.
 *
 * Values are host-supplied deploy configuration (not user data), but each token
 * is validated at construction and invalid entries are dropped (with a
 * `console.warn` naming them):
 * - Origin lists must be single CSP source expressions of printable-ASCII
 *   characters with no `;` or `,`, so a malformed value can neither inject a
 *   directive, split the header, nor crash header construction (a control
 *   character or non-Latin-1 codepoint would throw in `Headers.set`). The two
 *   most common blanket relaxations, `'unsafe-inline'` / `'unsafe-eval'`, are
 *   also rejected — they are the usual copy-paste footgun. This is deliberately
 *   narrow, NOT a comprehensive guardrail: `render.csp` is trusted host deploy
 *   config, so a host can still broaden its own `script-src` with e.g. `*` or a
 *   scheme source, exactly as it could by hand-writing the policy.
 * - `scriptHashes` must be a CSP hash expression (`'sha256-…'` / `'sha384-…'` /
 *   `'sha512-…'`); anything else (including `'unsafe-inline'`) is dropped.
 */
export interface PublicRenderCsp {
  /** Extra `script-src` origins (e.g. an analytics beacon's script host). */
  scriptSrc?: readonly string[];
  /** Extra `connect-src` origins (e.g. where a beacon reports back). */
  connectSrc?: readonly string[];
  /** `worker-src` origins (e.g. `'self'` for a PWA service worker). Adds the directive when set. */
  workerSrc?: readonly string[];
  /** `'sha256-…'` / `'sha384-…'` / `'sha512-…'` hashes for specific inline scripts, appended to `script-src`. */
  scriptHashes?: readonly string[];
}

/**
 * Host composition for the server-rendered profile page: the renderer's
 * first-party {@link RenderInput} seams (`slots` / `labels` / `omitSections`)
 * plus an optional {@link PublicRenderCsp}. The CSP lives here, beside the slots
 * whose scripts it authorizes.
 */
export type PublicRenderOptions = Pick<RenderInput, 'slots' | 'labels' | 'omitSections'> & {
  csp?: PublicRenderCsp;
};

const FALLBACK_VERSION = 'bundled-fixture';

// Cloudflare Turnstile (the contact widget's challenge) loads its script from,
// renders its iframe on, and reports back to this single origin.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * A single CSP source expression: one or more printable-ASCII characters
 * (`!`–`~`), which the {@link sanitizeCsp} predicate further narrows by rejecting
 * `;` and `,`. This is an ALLOWLIST, not a `\s`-based denylist: a denylist
 * silently passes control characters (NUL, DEL), C1 controls, and non-Latin-1
 * codepoints (e.g. a copy-pasted zero-width space) — none of which are `\s` —
 * and those then throw inside `Headers.set` (invalid header value / non-ByteString
 * codepoint), 500-ing the profile page on every request. Restricting to printable
 * ASCII means a malformed value can neither split the header, inject a directive,
 * nor crash header construction; it is simply dropped.
 */
const CSP_SOURCE = /^[!-~]+$/;
/**
 * A CSP hash source — `'sha256-…'` / `'sha384-…'` / `'sha512-…'` (base64,
 * optionally `=`-padded). Anything else offered as a `scriptHashes` entry
 * (including `'unsafe-inline'`) is rejected.
 */
const CSP_HASH = /^'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'$/;
/**
 * The two most notorious blanket relaxations, refused from ANY directive so a
 * host can't reintroduce them via `render.csp` — they are the usual copy-paste
 * footgun (an analytics/embed snippet that says "add 'unsafe-inline'"). This is
 * deliberately narrow, not a comprehensive guardrail: `render.csp` is trusted
 * host deploy config, so broadening sources like `*` or a bare scheme remain the
 * host's own choice (as in any hand-written policy). Compared case-insensitively
 * because browsers match these keywords without regard to case.
 */
const CSP_BLANKET: ReadonlySet<string> = new Set(["'unsafe-inline'", "'unsafe-eval'"]);

/**
 * A host-supplied {@link PublicRenderCsp} after validation: every token is a
 * guaranteed-safe CSP source (or hash), so {@link buildPublicCsp} appends it
 * verbatim. Produced by {@link sanitizeCsp}.
 */
interface CleanCsp {
  scriptSrc: readonly string[];
  connectSrc: readonly string[];
  workerSrc: readonly string[];
  scriptHashes: readonly string[];
}

/**
 * Validate a host-supplied {@link PublicRenderCsp} into a {@link CleanCsp}.
 * Origin lists keep only well-formed source expressions that are not blanket
 * relaxations (`'unsafe-inline'` / `'unsafe-eval'`); `scriptHashes` keeps only
 * CSP hash expressions. Every rejected token is collected in `dropped` so the
 * caller can warn — silently dropping a config typo would turn it into a
 * production CSP-violation hunt.
 */
function sanitizeCsp(ext: PublicRenderCsp): { clean: CleanCsp; dropped: string[] } {
  const dropped: string[] = [];
  const keep = (tokens: readonly string[] | undefined, ok: (t: string) => boolean): string[] =>
    (tokens ?? []).filter((t) => {
      if (ok(t)) return true;
      dropped.push(t);
      return false;
    });
  const source = (t: string): boolean =>
    CSP_SOURCE.test(t) && !t.includes(';') && !t.includes(',') && !CSP_BLANKET.has(t.toLowerCase());
  return {
    clean: {
      scriptSrc: keep(ext.scriptSrc, source),
      connectSrc: keep(ext.connectSrc, source),
      workerSrc: keep(ext.workerSrc, source),
      scriptHashes: keep(ext.scriptHashes, (t) => CSP_HASH.test(t)),
    },
    dropped,
  };
}

/**
 * Build the public Content-Security-Policy. With `contact` the `@takuhon/contact`
 * widget is embedded, so the Turnstile origin is added to `script-src` (its
 * api.js), `frame-src` (its challenge iframe), and `connect-src` (its
 * verification XHR). The widget's config travels as `data-*` attributes on the
 * external script, so `script-src` still needs no `'unsafe-inline'`. This
 * relaxation is applied ONLY to the HTML page that actually embeds the widget
 * (gated per-request in the `/` handler); every other route keeps the strict,
 * `'self'`-only policy below.
 *
 * `ext` (a validated {@link CleanCsp}) appends origins/hashes to the profile
 * page's directives. When `ext` is undefined the output is byte-identical to the
 * pre-extension policy, so the turnkey default is unchanged.
 */
function buildPublicCsp(contact: boolean, ext?: CleanCsp): string {
  const turnstile = contact ? [TURNSTILE_ORIGIN] : [];
  const scriptSrc = ["'self'", ...turnstile, ...(ext?.scriptSrc ?? []), ...(ext?.scriptHashes ?? [])]; // prettier-ignore
  const connectSrc = ["'self'", ...turnstile, ...(ext?.connectSrc ?? [])];
  const frameSrc = [...turnstile];
  const workerSrc = ext?.workerSrc ?? [];
  return [
    "default-src 'self'",
    // `https:` lets the server-rendered profile page load remote avatar images
    // (the schema permits any https avatar URL, and `safeUrl` in the renderer
    // already blocks non-http(s) schemes); `data:` covers inline placeholders.
    "img-src 'self' https: data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    ...(frameSrc.length > 0 ? [`frame-src ${frameSrc.join(' ')}`] : []),
    ...(workerSrc.length > 0 ? [`worker-src ${workerSrc.join(' ')}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

const PUBLIC_CSP = buildPublicCsp(false);
const PUBLIC_CSP_WITH_CONTACT = buildPublicCsp(true);

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

  // The profile page's CSP, widened by the host's `render.csp` (if any). Host
  // tokens are validated (`sanitizeCsp`) and any rejected token is warned about
  // once at construction, so a config typo surfaces in the logs rather than
  // silently failing at runtime. With no extension these equal the base
  // policies, so the profile page is byte-identical to every other route and no
  // behavior changes.
  const cspExt = deps.render?.csp;
  let pageCsp = PUBLIC_CSP;
  let pageCspWithContact = PUBLIC_CSP_WITH_CONTACT;
  if (cspExt) {
    const { clean, dropped } = sanitizeCsp(cspExt);
    if (dropped.length > 0) {
      console.warn(
        `[takuhon] Ignored ${dropped.length} invalid render.csp token(s): ${dropped.join(', ')}`,
      );
    }
    pageCsp = buildPublicCsp(false, clean);
    pageCspWithContact = buildPublicCsp(true, clean);
  }

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    h.set('x-content-type-options', 'nosniff');
    h.set('x-frame-options', 'DENY');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    // The `/` handler sets `contactEnabled` (contact widget embedded) and
    // `profilePage` (host `render.csp` extension applies), so both relaxations
    // are scoped to that one page; every other route falls through to the strict
    // default.
    const contact = c.get('contactEnabled') === true;
    const page = c.get('profilePage') === true;
    h.set(
      'content-security-policy',
      page
        ? contact
          ? pageCspWithContact
          : pageCsp
        : contact
          ? PUBLIC_CSP_WITH_CONTACT
          : PUBLIC_CSP,
    );
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

  app.onError((err, c) => {
    // This 500 body is public — and cross-origin readable once CORS is enabled —
    // so it must not echo internal exception text (storage/render errors can
    // carry implementation detail). Log the real error server-side and return a
    // generic, non-revealing detail.
    console.error('Public app request failed:', err);
    return problemResponse(c, {
      slug: ERROR_SLUGS.internal,
      status: 500,
      title: 'Internal Error',
      detail: 'An unexpected error occurred while handling the request.',
    });
  });

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

    // Embed the contact widget only when the owner has enabled it AND provided
    // the public Turnstile site key (without the key the widget cannot mount).
    // The secret / recipient / From live in adapter env and gate the POST
    // endpoint separately; the page only needs the public key. Setting the
    // context flag relaxes this response's CSP for the Turnstile origin.
    const contactSettings = profile.settings.contact;
    const contactSiteKey = contactSettings?.turnstileSiteKey?.trim();
    const contact =
      contactSettings?.enabled === true && contactSiteKey
        ? {
            siteKey: contactSiteKey,
            ...(contactSettings.endpoint ? { endpoint: contactSettings.endpoint } : {}),
          }
        : undefined;
    if (contact) c.set('contactEnabled', true);

    const html = renderProfileHtml({
      // Host composition seams (slots / labels / omitSections). `csp` is a
      // response-header concern handled above, not a renderer input, so it is
      // intentionally excluded here.
      ...(deps.render
        ? {
            slots: deps.render.slots,
            labels: deps.render.labels,
            omitSections: deps.render.omitSections,
          }
        : {}),
      localized,
      canonicalUrl: `${origin}${localePath(current)}`,
      alternates: [
        ...locales.map((l) => ({ hreflang: l, href: `${origin}${localePath(l)}` })),
        { hreflang: 'x-default', href: `${origin}${localePath(defaultLocale)}` },
      ],
      localeNav: locales.map((l) => ({ locale: l, href: localePath(l), current: l === current })),
      jsonLd: profile.settings.enableJsonLd !== false,
      activitySnapshot: snapshot ?? undefined,
      contact,
      year: new Date().getFullYear(),
    });

    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300');
    c.header('vary', 'Accept-Language, Cookie');
    // Scope the host CSP extension (if any) to this page — set only now that the
    // profile page rendered successfully, so a failure above never widens the
    // CSP on the error response (mirrors `contactEnabled`).
    c.set('profilePage', true);
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
