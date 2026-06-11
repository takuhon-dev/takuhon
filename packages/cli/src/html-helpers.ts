/**
 * Pure HTML helpers shared by the static-site renderer ({@link
 * import('./build-html.js')}) and the CV renderer ({@link
 * import('./cv-html.js')}). All are string-in / string-out with no I/O, so they
 * stay unit-testable and keep both renderers' escaping behavior identical.
 */

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

/** Format a YearMonth range; `null` end or `isCurrent` renders as "Present". */
export function dateRange(start?: string, end?: string | null, isCurrent?: boolean): string {
  const left = start ?? '';
  const right = isCurrent === true || end === null ? 'Present' : (end ?? '');
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
