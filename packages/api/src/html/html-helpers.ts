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
 * separator and the `<time>` tags themselves. `separator` defaults to a
 * spaced en-dash; a caller can pass another safe, static separator (the profile
 * renderer uses a wave dash) — never user data, since it is inserted raw.
 */
export function dateRange(
  start: string | undefined,
  opts: { end?: string | null; isCurrent?: boolean; locale: LocaleTag; separator?: string },
): string {
  const { end, isCurrent, locale, separator = ' – ' } = opts;
  const left = start ? timeTag(start, locale) : '';
  const right =
    isCurrent === true || end === null ? presentLabel(locale) : end ? timeTag(end, locale) : '';
  if (left && right) return `${left}${separator}${right}`;
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

/**
 * Render a `**bold**` inline run. Text is HTML-escaped FIRST, then the `**`
 * markers (plain ASCII, untouched by escaping) are turned into `<strong>` — so
 * escaped user content can never inject a tag. Non-greedy, non-nesting.
 * Internal to {@link renderMarkdown}; not part of the module's public surface.
 */
function renderInline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Minimal, dependency-free Markdown subset for `profile.bio`: `## ` → `<h3>`,
 * `### ` → `<h4>`, `---` → `<hr>`, `- ` → `<ul><li>`, `**bold**`, and
 * blank-line-separated paragraphs. Every text node is HTML-escaped before inline
 * markers are applied ({@link renderInline}), so content cannot inject markup.
 * Anything not matching a block marker becomes a paragraph — so a plain one-line
 * bio degrades to a single `<p>`. No inline links/images (kept deliberately out
 * of the subset so the section needs no URL-safety gate).
 *
 * Shared by the profile page ({@link import('./build-html.js')}) and the CV
 * ({@link import('./cv-html.js')}) so `profile.bio` renders identically on both
 * surfaces — one field, one meaning. The returned string is block-level markup
 * (`<p>`/`<h3>`/`<h4>`/`<hr>`/`<ul>`), so callers must wrap it in a block
 * container (e.g. a `<div>`), never an inline `<p>`.
 */
export function renderMarkdown(input: string): string {
  const lines = input.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = (lines[i] ?? '').trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    if (trimmed === '---') {
      out.push('<hr>');
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      out.push(`<h4>${renderInline(trimmed.slice(4))}</h4>`);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      out.push(`<h3>${renderInline(trimmed.slice(3))}</h3>`);
      i++;
      continue;
    }
    if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length) {
        const cur = (lines[i] ?? '').trim();
        if (!cur.startsWith('- ')) break;
        items.push(`<li>${renderInline(cur.slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const cur = (lines[i] ?? '').trim();
      if (
        cur === '' ||
        cur === '---' ||
        cur.startsWith('## ') ||
        cur.startsWith('### ') ||
        cur.startsWith('- ')
      ) {
        break;
      }
      para.push(cur);
      i++;
    }
    if (para.length > 0) out.push(`<p>${renderInline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
