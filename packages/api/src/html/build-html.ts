/**
 * Pure HTML rendering for `takuhon build`.
 *
 * {@link renderProfileHtml} turns one locale-resolved {@link LocalizedTakuhon}
 * into a complete, self-contained static HTML document: semantic markup for
 * every profile section, an inline stylesheet, optional Schema.org JSON-LD,
 * and the `<head>` metadata (`<title>`, description, canonical, hreflang
 * alternates) the caller supplies.
 *
 * This is a deliberately separate, simpler surface from the React
 * `@takuhon/ui` (which is delivered as CSS-Modules components needing a
 * bundler). It reuses only `@takuhon/core` and has no DOM/browser dependency,
 * so it renders in plain Node and is unit-testable as a pure string function.
 *
 * Security: every piece of profile-derived text is escaped before it reaches
 * the markup ({@link escapeHtml}), and the JSON-LD payload is `<`/`>`/`&`
 * unicode-escaped so it cannot break out of its `<script>` element.
 */

import { generateJsonLd, renderActivitySvg } from '@takuhon/core';
import type { ActivitySnapshot, LocalizedTakuhon } from '@takuhon/core';

import { dateRange, escapeHtml, nonEmpty, safeUrl } from './html-helpers.js';

// Re-exported for existing importers (e.g. dev-command, tests) that pull
// `escapeHtml` from this module; the implementation now lives in html-helpers.
export { escapeHtml } from './html-helpers.js';

type LocalizedProfile = LocalizedTakuhon['profile'];

/** One entry in the human-facing locale switcher. */
export interface LocaleLink {
  locale: string;
  href: string;
  current: boolean;
}

/** One `<link rel="alternate" hreflang>` entry. */
export interface Alternate {
  hreflang: string;
  href: string;
}

export interface RenderInput {
  /** The locale-resolved document to render. */
  localized: LocalizedTakuhon;
  /** Absolute canonical URL for this page (only when `--base-url` was given). */
  canonicalUrl?: string;
  /** hreflang alternates (empty when no base URL is available). */
  alternates: readonly Alternate[];
  /** Human locale switcher links (rendered only when more than one locale). */
  localeNav: readonly LocaleLink[];
  /** Whether to emit Schema.org JSON-LD (mirrors `settings.enableJsonLd`). */
  jsonLd: boolean;
  /**
   * Synced developer-activity snapshot, rendered as a self-owned inline SVG
   * section. The caller gates it on `settings.activity.enabled`; an absent (or
   * metric-less) snapshot omits the section entirely.
   */
  activitySnapshot?: ActivitySnapshot;
  /**
   * When set, embed the `@takuhon/contact` widget: a `<link>` to its stylesheet
   * in `<head>` and a deferred `<script>` whose config travels as `data-*`
   * attributes (no inline script, so the page CSP needs no `'unsafe-inline'`).
   * The caller gates it on `settings.contact.enabled` and a present site key;
   * the adapter is responsible for serving `/contact-widget.{js,css}` and for
   * relaxing its CSP to allow the Turnstile origin.
   */
  contact?: { siteKey: string; endpoint?: string };
}

/** Unicode-escape `<`, `>`, `&` so a JSON-LD payload cannot break out of `<script>`. */
function escapeJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

const CSS = `:root{--fg:#1a1a1a;--muted:#666;--accent:#0b5fff;--line:#e5e5e5}
*{box-sizing:border-box}
body{margin:0;color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff}
main{max-width:42rem;margin:0 auto;padding:2rem 1.25rem}
a{color:var(--accent)}
h1{font-size:1.9rem;margin:.2rem 0}
h2{font-size:1.15rem;margin:2rem 0 .75rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
h3{font-size:1rem;margin:0}
header .avatar{width:96px;height:96px;border-radius:50%;object-fit:cover}
.tagline{font-size:1.1rem;color:var(--muted);margin:.2rem 0}
.location{color:var(--muted);margin:.2rem 0}
.bio{margin:.75rem 0}
ul{padding:0;margin:0;list-style:none}
.entries>li{margin:0 0 1.1rem}
.sub{margin:.1rem 0;font-weight:600}
.meta{margin:.1rem 0;color:var(--muted);font-size:.9rem}
.links{display:flex;flex-wrap:wrap;gap:.5rem 1rem;margin:.75rem 0}
.skills,.tags{display:flex;flex-wrap:wrap;gap:.4rem}
.skills>li,.tags>li{background:#f2f2f2;border-radius:1rem;padding:.15rem .6rem;font-size:.85rem}
.rec{margin:0 0 1.1rem}
.rec blockquote{margin:0;padding-left:.9rem;border-left:3px solid var(--line)}
.rec figcaption{color:var(--muted);font-size:.9rem;margin-top:.3rem}
nav.locales{display:flex;gap:.75rem;margin-bottom:1rem;font-size:.9rem}
.activity svg{max-width:100%;height:auto}
footer.powered{max-width:42rem;margin:0 auto;padding:1.5rem 1.25rem;color:var(--muted);font-size:.85rem}`;

interface EntryView {
  heading: string;
  sub?: string;
  dates?: string;
  body?: string;
  url?: string;
  tags?: readonly string[];
}

function renderEntry(entry: EntryView): string {
  const href = entry.url ? safeUrl(entry.url) : undefined;
  const heading = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(entry.heading)}</a>`
    : escapeHtml(entry.heading);
  const parts = [`<h3>${heading}</h3>`];
  if (entry.sub) parts.push(`<p class="sub">${escapeHtml(entry.sub)}</p>`);
  // `entry.dates` is already an escaped HTML fragment from `dateRange` (localized
  // <time> elements), so it is inserted raw rather than re-escaped.
  if (entry.dates) parts.push(`<p class="meta">${entry.dates}</p>`);
  if (entry.body) parts.push(`<p>${escapeHtml(entry.body)}</p>`);
  if (entry.tags && entry.tags.length > 0) {
    parts.push(
      `<ul class="tags">${entry.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`,
    );
  }
  return `<li>${parts.join('')}</li>`;
}

/** Render a `<section>` of entries, or `''` when there are none. */
function entryList(title: string, entries: readonly EntryView[]): string {
  if (entries.length === 0) return '';
  return `<section><h2>${escapeHtml(title)}</h2><ul class="entries">${entries
    .map(renderEntry)
    .join('')}</ul></section>`;
}

function renderHeader(p: LocalizedProfile): string {
  const parts: string[] = [];
  const avatarSrc = p.avatar?.url ? safeUrl(p.avatar.url) : undefined;
  if (avatarSrc) {
    parts.push(
      `<img class="avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.avatar?.alt ?? '')}">`,
    );
  }
  parts.push(`<h1>${escapeHtml(p.displayName)}</h1>`);
  if (p.tagline) parts.push(`<p class="tagline">${escapeHtml(p.tagline)}</p>`);
  if (p.location?.display) parts.push(`<p class="location">${escapeHtml(p.location.display)}</p>`);
  if (p.bio) parts.push(`<p class="bio">${escapeHtml(p.bio)}</p>`);
  return `<header>${parts.join('')}</header>`;
}

function renderLinks(links: LocalizedTakuhon['links']): string {
  if (links.length === 0) return '';
  const items = links
    .map((l) => {
      const text = escapeHtml(l.label ?? l.url);
      const href = safeUrl(l.url);
      return href ? `<li><a href="${escapeHtml(href)}">${text}</a></li>` : `<li>${text}</li>`;
    })
    .join('');
  return `<nav aria-label="Links"><ul class="links">${items}</ul></nav>`;
}

function renderSkills(skills: LocalizedTakuhon['skills']): string {
  if (skills.length === 0) return '';
  const items = skills.map((s) => `<li>${escapeHtml(s.label)}</li>`).join('');
  return `<section><h2>Skills</h2><ul class="skills">${items}</ul></section>`;
}

function renderLanguages(languages: LocalizedTakuhon['languages']): string {
  if (languages.length === 0) return '';
  const items = languages
    .map((l) => `<li>${escapeHtml(`${l.displayName ?? l.language} — ${l.proficiency}`)}</li>`)
    .join('');
  return `<section><h2>Languages</h2><ul class="entries">${items}</ul></section>`;
}

function renderRecommendations(recs: LocalizedTakuhon['recommendations']): string {
  if (recs.length === 0) return '';
  const items = recs
    .map((r) => {
      const authorHref = r.author.url ? safeUrl(r.author.url) : undefined;
      const name = authorHref
        ? `<a href="${escapeHtml(authorHref)}">${escapeHtml(r.author.name)}</a>`
        : escapeHtml(r.author.name);
      const caption = [name, r.author.headline ? escapeHtml(r.author.headline) : '']
        .filter(Boolean)
        .join(', ');
      const rel = r.relationship ? ` (${escapeHtml(r.relationship)})` : '';
      return `<figure class="rec"><blockquote>${escapeHtml(r.body)}</blockquote><figcaption>— ${caption}${rel}</figcaption></figure>`;
    })
    .join('');
  return `<section><h2>Recommendations</h2>${items}</section>`;
}

function renderContact(contact: LocalizedTakuhon['contact']): string {
  const items: string[] = [];
  if (contact.email) {
    items.push(
      `<li><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></li>`,
    );
  }
  const formHref = contact.formUrl ? safeUrl(contact.formUrl) : undefined;
  if (formHref) {
    items.push(`<li><a href="${escapeHtml(formHref)}">Contact form</a></li>`);
  }
  if (items.length === 0) return '';
  return `<section><h2>Contact</h2><ul class="entries">${items.join('')}</ul></section>`;
}

/**
 * Render the developer-activity section from the synced snapshot, or `''`
 * when there is none (or it carries no metric data). The SVG is generated by
 * `@takuhon/core` from stored numbers only — no external badge image — so the
 * page works under an `img-src 'self'` CSP.
 */
function renderActivity(snapshot: ActivitySnapshot | undefined): string {
  if (!snapshot) return '';
  const svg = renderActivitySvg(snapshot);
  if (svg === '') return '';
  return `<section class="activity"><h2>Activity</h2>${svg}</section>`;
}

function renderJsonLdScript(data: LocalizedTakuhon): string {
  const payload = JSON.stringify(generateJsonLd(data));
  return `<script type="application/ld+json">${escapeJsonLd(payload)}</script>`;
}

function renderLocaleNav(localeNav: readonly LocaleLink[]): string {
  const items = localeNav
    .map((l) =>
      l.current
        ? `<span aria-current="true">${escapeHtml(l.locale)}</span>`
        : `<a href="${escapeHtml(l.href)}">${escapeHtml(l.locale)}</a>`,
    )
    .join('');
  return `<nav class="locales" aria-label="Language">${items}</nav>`;
}

/** Render a complete static HTML document for one locale-resolved profile. */
export function renderProfileHtml(input: RenderInput): string {
  const d = input.localized;
  const p = d.profile;
  const description = p.tagline ?? p.bio ?? '';

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(p.displayName)}</title>`,
    description
      ? `<meta name="description" content="${escapeHtml(description.slice(0, 300))}">`
      : '',
    input.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">` : '',
    ...input.alternates.map(
      (a) =>
        `<link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}">`,
    ),
    input.jsonLd ? renderJsonLdScript(d) : '',
    input.contact ? '<link rel="stylesheet" href="/contact-widget.css">' : '',
    `<style>${CSS}</style>`,
  ]
    .filter(Boolean)
    .join('\n  ');

  const body = [
    input.localeNav.length > 1 ? renderLocaleNav(input.localeNav) : '',
    renderHeader(p),
    renderLinks(d.links),
    entryList(
      'Experience',
      d.careers.map((c) => ({
        heading: c.role,
        sub: c.organization,
        dates: dateRange(c.startDate, {
          end: c.endDate,
          isCurrent: c.isCurrent,
          locale: d.resolvedLocale,
        }),
        body: c.description,
        url: c.url,
      })),
    ),
    entryList(
      'Projects',
      d.projects.map((x) => ({
        heading: x.title,
        dates: dateRange(x.startDate, { end: x.endDate, locale: d.resolvedLocale }),
        body: x.description,
        url: x.url,
        tags: x.tags,
      })),
    ),
    renderSkills(d.skills),
    renderActivity(input.activitySnapshot),
    entryList(
      'Education',
      d.education.map((e) => {
        const degree = nonEmpty([e.degree, e.fieldOfStudy], ', ');
        return {
          heading: degree ?? e.institution,
          sub: degree ? e.institution : undefined,
          dates: dateRange(e.startDate, {
            end: e.endDate,
            isCurrent: e.isCurrent,
            locale: d.resolvedLocale,
          }),
          body: e.description,
          url: e.url,
        };
      }),
    ),
    entryList(
      'Certifications',
      d.certifications.map((c) => ({
        heading: c.title,
        sub: c.issuingOrganization,
        dates: dateRange(c.issueDate, { end: c.expirationDate, locale: d.resolvedLocale }),
        url: c.url,
      })),
    ),
    entryList(
      'Publications',
      d.publications.map((x) => ({
        heading: x.title,
        sub: nonEmpty([x.publisher, x.coAuthors?.join(', ')], ' · '),
        dates: dateRange(x.date, { locale: d.resolvedLocale }),
        body: x.description,
        url: x.url ?? (x.doi ? `https://doi.org/${x.doi}` : undefined),
      })),
    ),
    entryList(
      'Honors & awards',
      d.honors.map((x) => ({
        heading: x.title,
        sub: x.issuer,
        dates: dateRange(x.date, { locale: d.resolvedLocale }),
        body: x.description,
        url: x.url,
      })),
    ),
    entryList(
      'Memberships',
      d.memberships.map((x) => ({
        heading: x.role ?? x.organization,
        sub: x.role ? x.organization : undefined,
        dates: dateRange(x.startDate, {
          end: x.endDate,
          isCurrent: x.isCurrent,
          locale: d.resolvedLocale,
        }),
        body: x.description,
        url: x.url,
      })),
    ),
    entryList(
      'Volunteering',
      d.volunteering.map((x) => ({
        heading: x.role,
        sub: nonEmpty([x.organization, x.cause], ' · '),
        dates: dateRange(x.startDate, {
          end: x.endDate,
          isCurrent: x.isCurrent,
          locale: d.resolvedLocale,
        }),
        body: x.description,
        url: x.url,
      })),
    ),
    entryList(
      'Courses',
      d.courses.map((x) => ({
        heading: x.title,
        sub: x.provider,
        dates: dateRange(x.completionDate, { locale: d.resolvedLocale }),
        body: x.description,
        url: x.certificateUrl,
      })),
    ),
    entryList(
      'Patents',
      d.patents.map((x) => ({
        heading: x.title,
        sub: nonEmpty([x.patentNumber, x.office, x.status, x.coInventors?.join(', ')], ' · '),
        dates: dateRange(x.filingDate ?? x.grantDate, { locale: d.resolvedLocale }),
        body: x.description,
        url: x.url,
      })),
    ),
    entryList(
      'Test scores',
      d.testScores.map((x) => ({
        heading: `${x.title}: ${x.score}`,
        dates: dateRange(x.date, { locale: d.resolvedLocale }),
        body: x.description,
        url: x.url,
      })),
    ),
    renderLanguages(d.languages),
    renderRecommendations(d.recommendations),
    renderContact(d.contact),
  ]
    .filter(Boolean)
    .join('\n');

  const footer =
    d.settings.showPoweredBy === true ? '<footer class="powered">Powered by takuhon</footer>' : '';

  // The widget reads its config from these data-* attributes (see
  // @takuhon/contact's browser entry); `defer` lets it mount after parsing
  // without an inline bootstrap script.
  const contactScript = input.contact
    ? `<script src="/contact-widget.js" data-site-key="${escapeHtml(input.contact.siteKey)}"` +
      (input.contact.endpoint ? ` data-endpoint="${escapeHtml(input.contact.endpoint)}"` : '') +
      ' defer></script>\n'
    : '';

  return (
    `<!DOCTYPE html>\n<html lang="${escapeHtml(d.resolvedLocale)}">\n<head>\n  ${head}\n</head>\n` +
    `<body>\n<main>\n${body}\n</main>\n${footer ? `${footer}\n` : ''}${contactScript}</body>\n</html>\n`
  );
}
