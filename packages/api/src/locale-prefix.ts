/**
 * URL-path locale prefix handling for the public app.
 *
 * Implements locale resolution priority #2: a leading `/{locale}` path
 * segment, e.g. `/ja/api/profile`, ranked after the `?lang=` query (#1)
 * and before the `takuhon_locale` cookie (#3). This module is responsible
 * only for the *structural* concern — detecting and stripping the prefix
 * so the existing flat routes match — while the locale *value* it
 * extracts is fed into {@link resolveRequestLocales} at slot #2 by the
 * route handlers.
 *
 * The prefix is honored via Hono's `getPath` option rather than parametric
 * routes: {@link localePrefixGetPath} rewrites the match path so a request
 * to `/ja/api/profile` is routed to the `/api/profile` handler. Hono's
 * `route()` flattens a sub-app's routes into the parent and dispatches with
 * the *parent* router's `getPath` only, so the same function is applied on
 * both the standalone public app (for direct tests) and the adapter's
 * top-level router (production). The original request URL is untouched, so
 * handlers recover the locale token from `c.req.url`.
 */
import { isValidBcp47 } from './locale-resolution.js';

/**
 * Remainder paths that may legitimately follow a `/{locale}` segment.
 *
 * This allowlist — NOT the BCP-47 shape check — is the load-bearing safety
 * mechanism. It keeps locale-agnostic paths (`/health`, `/api/schema`,
 * `/.well-known/*`, `/takuhon.json`) and admin paths (`/api/admin/*`,
 * `/admin/*`) from being misread as a locale prefix. Note that `api`
 * itself satisfies the BCP-47 primary-subtag shape (`[a-z]{2,3}`), so a
 * shape check alone would treat `/api/schema` as locale `api` + `/schema`;
 * the remainder allowlist is what prevents that.
 *
 * Keep this in sync with the locale-aware routes in `public-app.ts`.
 */
export const LOCALE_AWARE_REMAINDERS = ['/', '/api/profile', '/api/jsonld'] as const;

/**
 * First-path segments that are reserved namespaces and must never be read
 * as a locale, even though they satisfy the BCP-47 shape. Without this,
 * a bare `/api` (segment `api` is a valid 2–3 letter primary subtag,
 * remainder defaults to the landing `/`) would alias the landing page
 * instead of 404ing. Other reserved roots (`admin`, `health`,
 * `takuhon.json`, `.well-known`) fail the BCP-47 shape check and need no
 * entry here; `api` is the only collision.
 */
const RESERVED_FIRST_SEGMENTS = new Set(['api']);

function getPathname(url: string): string {
  return new URL(url).pathname;
}

/**
 * Split a leading `/{locale}` segment from `pathname` when — and only
 * when — the segment is BCP-47-shaped and the remainder is a locale-aware
 * route ({@link LOCALE_AWARE_REMAINDERS}).
 *
 * - `/ja/api/profile` → `{ locale: 'ja', path: '/api/profile' }`
 * - `/api/profile`    → `{ path: '/api/profile' }` (remainder `/profile` not locale-aware)
 * - `/api/schema`     → `{ path: '/api/schema' }` (the `api`-collision guard)
 * - `/ja/api/admin`   → `{ path: '/ja/api/admin' }` (remainder `/api/admin` not locale-aware → 404, admin isolated)
 * - `/ja` and `/ja/`  → `{ locale: 'ja', path: '/' }` (trailing slash normalized to landing)
 *
 * The returned `locale` is the raw path token; it is not matched against
 * `availableLocales` here (that happens downstream in
 * {@link resolveRequestLocales}), so an unknown-but-shaped prefix like
 * `/fr/` on an en/ja document strips structurally and then falls through
 * to the next resolution tier, mirroring `?lang=fr` semantics.
 */
export function stripLocalePrefix(pathname: string): { locale?: string; path: string } {
  // Match a leading single segment: `/seg` or `/seg/rest...`.
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match === null) return { path: pathname };

  const seg = match[1];
  if (seg === undefined || !isValidBcp47(seg)) return { path: pathname };

  // Reserved namespace segments (e.g. `api`) pass the BCP-47 shape but are
  // not locales; leave them for the route table (so `/api` 404s as before).
  if (RESERVED_FIRST_SEGMENTS.has(seg.toLowerCase())) return { path: pathname };

  // Normalize a bare `/ja` (no trailing content) to the landing remainder.
  const remainder = match[2] ?? '/';
  if (!(LOCALE_AWARE_REMAINDERS as readonly string[]).includes(remainder)) {
    return { path: pathname };
  }

  return { locale: seg, path: remainder };
}

/**
 * Hono `getPath` implementation: returns the locale-stripped path used for
 * route matching. Apply on every Hono router that dispatches the public
 * routes (the standalone public app and the adapter's top-level router).
 */
export function localePrefixGetPath(req: Request): string {
  return stripLocalePrefix(getPathname(req.url)).path;
}

/**
 * Extract the locale token from a request URL's path prefix, or `undefined`
 * when there is none. Used by route handlers to feed priority #2 into
 * {@link resolveRequestLocales}. Reads the original URL, which `getPath`
 * does not mutate.
 */
export function pathLocaleFromUrl(url: string): string | undefined {
  return stripLocalePrefix(getPathname(url)).locale;
}
