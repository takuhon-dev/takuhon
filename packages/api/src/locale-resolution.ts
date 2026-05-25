/**
 * HTTP-layer locale resolution for the public app.
 *
 * Reads request-side locale candidates in this priority order:
 *
 *   1. `?lang=` query parameter
 *   2. `takuhon_locale` cookie
 *   3. `Accept-Language` request header (q-value ordered)
 *
 * URL-path-based candidates (e.g. `/ja/`) are not yet honored — that
 * would require route restructuring and is tracked for a future
 * release. Settings-tier fallbacks (`settings.defaultLocale`,
 * `settings.fallbackLocale`, `settings.availableLocales[0]`) are
 * resolved inside `@takuhon/core`'s `resolveLocale` and do not appear
 * here.
 *
 * `resolveLocale` only exposes two caller slots (`locale`,
 * `fallbackLocale`). To avoid wasting them on tags the document can't
 * serve, candidates are filtered against `availableLocales` (case-
 * insensitive on the full tag or its primary subtag) and the matched
 * available locale token is substituted before forwarding, so a
 * primary-subtag match like `en` → `en-US` does not silently fall
 * through to the settings tier. Filtered candidates beyond the second
 * fall through to `resolveLocale`'s own settings-tier candidates, not
 * in request order — an acceptable loss given the contract.
 */
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';

const BCP47 = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

// DoS guards. The header parser is exposed to untrusted client input,
// so the byte budget and entry count are bounded before any per-token
// work. Numbers are conservative defaults, not spec-derived.
const ACCEPT_LANG_MAX = 2048;
const ACCEPT_LANG_MAX_ENTRIES = 16;
const COOKIE_VALUE_MAX = 64;

function isValidBcp47(tag: string): boolean {
  return BCP47.test(tag);
}

interface AcceptLangEntry {
  readonly tag: string;
  readonly q: number;
}

/**
 * Parse an `Accept-Language` header into BCP-47 tags ordered by q
 * descending. Invalid or zero-quality entries and `*` wildcards are
 * dropped. Input larger than {@link ACCEPT_LANG_MAX} bytes or with more
 * than {@link ACCEPT_LANG_MAX_ENTRIES} comma-separated parts is
 * truncated before parsing.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const trimmed = header.length > ACCEPT_LANG_MAX ? header.slice(0, ACCEPT_LANG_MAX) : header;
  const parts = trimmed.split(',').slice(0, ACCEPT_LANG_MAX_ENTRIES);

  const entries: AcceptLangEntry[] = [];
  for (const rawPart of parts) {
    const segments = rawPart.split(';');
    const tagSegment = segments[0];
    if (tagSegment === undefined) continue;
    const tag = tagSegment.trim();
    if (tag === '' || tag === '*') continue;
    if (!isValidBcp47(tag)) continue;

    let q = 1;
    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined) continue;
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(segment);
      if (!match) continue;
      const parsed = Number.parseFloat(match[1] ?? '');
      if (Number.isNaN(parsed)) {
        q = 1;
      } else if (parsed < 0 || parsed > 1) {
        // RFC 7231 §5.3.1 says values MUST be in [0, 1]; treat
        // out-of-range as missing (q=1) rather than dropping.
        q = 1;
      } else {
        q = parsed;
      }
      break;
    }
    if (q === 0) continue;

    entries.push({ tag, q });
  }

  // Stable sort: Array.prototype.sort is stable in ES2019+.
  entries.sort((a, b) => b.q - a.q);
  return entries.map((e) => e.tag);
}

function primarySubtag(tag: string): string {
  const dash = tag.indexOf('-');
  return (dash === -1 ? tag : tag.slice(0, dash)).toLowerCase();
}

function matchAvailable(tag: string, available: readonly string[]): string | undefined {
  const tagLower = tag.toLowerCase();
  const tagPrimary = primarySubtag(tag);
  // Prefer exact (case-insensitive) match over primary-subtag match so a
  // request that names a region explicitly wins over a region-stripped
  // alternative.
  for (const a of available) {
    if (a.toLowerCase() === tagLower) return a;
  }
  for (const a of available) {
    if (primarySubtag(a) === tagPrimary) return a;
  }
  return undefined;
}

/**
 * Resolve HTTP-layer locale candidates from the request — query,
 * cookie, and `Accept-Language` in that priority order. Returns the
 * top two candidates that survive validation and the
 * `availableLocales` filter, after substituting the matched available
 * token so primary-subtag matches resolve correctly downstream.
 */
export function resolveRequestLocales(
  c: Context,
  available: readonly string[],
): { locale?: string; fallbackLocale?: string } {
  const raw: string[] = [];

  const query = c.req.query('lang');
  if (query !== undefined && isValidBcp47(query)) {
    raw.push(query);
  }

  const cookie = getCookie(c, 'takuhon_locale');
  if (cookie !== undefined && cookie.length <= COOKIE_VALUE_MAX && isValidBcp47(cookie)) {
    raw.push(cookie);
  }

  const accept = c.req.header('accept-language');
  if (accept !== undefined) {
    raw.push(...parseAcceptLanguage(accept));
  }

  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const tag of raw) {
    const matched = matchAvailable(tag, available);
    if (matched === undefined) continue;
    const key = matched.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(matched);
    if (filtered.length === 2) break;
  }

  const out: { locale?: string; fallbackLocale?: string } = {};
  if (filtered[0] !== undefined) out.locale = filtered[0];
  if (filtered[1] !== undefined) out.fallbackLocale = filtered[1];
  return out;
}
