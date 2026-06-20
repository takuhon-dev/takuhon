/**
 * Pure HTML helpers shared by the static-site renderer ({@link
 * import('./build-html.js')}) and the CV renderer ({@link
 * import('./cv-html.js')}). All are string-in / string-out with no I/O, so they
 * stay unit-testable and keep both renderers' escaping behavior identical.
 */

import { formatDate, getPresentLabel, type LocaleTag } from '@takuhon/core';

/** Escape text for use in HTML element content or double/single-quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Return `url` only when its scheme is safe to place in an `href`/`src`, else
 * `undefined`. Relative, protocol-relative, fragment, and query URLs (no
 * scheme) are allowed; among absolute URLs only `http:`, `https:`, and
 * `mailto:` are. This blocks `javascript:`, `data:`, `vbscript:`, etc. — the
 * schema validates only a generic URI, so a hostile document could otherwise
 * smuggle an executable scheme into the generated page.
 */
export function safeUrl(url: string): string | undefined {
  const trimmed = url.trim();
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === undefined) return trimmed; // relative / protocol-relative / fragment
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto' ? trimmed : undefined;
}

/**
 * Wrap a single ISO date in a `<time>` element: the machine-readable ISO value
 * stays verbatim in the `datetime` attribute while the visible text is the
 * locale-formatted form from `@takuhon/core`'s {@link formatDate}. Both parts
 * are escaped, so the returned fragment is already safe to insert raw — callers
 * must NOT pass it back through {@link escapeHtml}.
 */
export function timeTag(iso: string, locale: LocaleTag): string {
  return `<time datetime="${escapeHtml(iso)}">${escapeHtml(formatDate(iso, locale))}</time>`;
}

/** The localized ongoing-role marker (en `Present` / ja `現在`), escaped. */
export function presentLabel(locale: LocaleTag): string {
  return escapeHtml(getPresentLabel(locale));
}

/**
 * Format a date range as an escaped HTML fragment: each bound becomes a
 * localized `<time>` element ({@link timeTag}), and a `null` end or `isCurrent`
 * renders as the localized "Present" marker ({@link presentLabel}). `locale` is
 * required, so a call that forgets it is a compile error rather than a silently
 * mis-formatted output. The result is fully escaped — callers insert it raw,
 * without {@link escapeHtml}; the only non-escaped literals are the static
 * en-dash separator and the `<time>` tags themselves.
 */
export function dateRange(
  start: string | undefined,
  opts: { end?: string | null; isCurrent?: boolean; locale: LocaleTag },
): string {
  const { end, isCurrent, locale } = opts;
  const left = start ? timeTag(start, locale) : '';
  const right =
    isCurrent === true || end === null ? presentLabel(locale) : end ? timeTag(end, locale) : '';
  if (left && right) return `${left} – ${right}`;
  return left || right;
}

/** Join the non-empty values with `separator`, or `undefined` when none remain. */
export function nonEmpty(
  values: readonly (string | undefined)[],
  separator: string,
): string | undefined {
  const joined = values
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(separator);
  return joined.length > 0 ? joined : undefined;
}
