/**
 * Pure HTML rendering of a {@link CvDocument} for `takuhon build --cv`.
 *
 * {@link renderCvHtml} turns one locale-resolved CV (from `@takuhon/core`'s
 * {@link deriveCv}) into a complete, self-contained static HTML résumé: an
 * inline stylesheet sized for A4 with an `@media print` block, so the page
 * reads well on screen and the browser's "Save as PDF" produces a clean,
 * single-column résumé. No external resources are referenced, so the page works
 * under a strict `img-src 'self'` / no-network policy (the same self-owned
 * stance the profile page and the activity card take).
 *
 * Security: every CV-derived string is escaped before it reaches the markup
 * ({@link escapeHtml}), and any URL is scheme-checked ({@link safeUrl}) so a
 * hostile document cannot smuggle a `javascript:` href into the résumé.
 */

import type { CvDocument, CvSection, LocaleTag, LocalizedLanguage } from '@takuhon/core';

import { dateRange, escapeHtml, nonEmpty, renderMarkdown, safeUrl } from './html-helpers.js';

/** Heading shown for each section, by `kind`. Plain English (CV chrome). */
const SECTION_TITLES: Record<CvSection['kind'], string> = {
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  publications: 'Publications',
  honors: 'Honors & Awards',
  courses: 'Courses',
  patents: 'Patents',
  languages: 'Languages',
  volunteering: 'Volunteering',
  memberships: 'Memberships',
};

// A4-sized, single-column résumé. The screen view is centered on a neutral
// backdrop; the print view drops the backdrop/margins so the page fills the
// sheet, and `break-inside: avoid` keeps entries from splitting across pages.
const CSS = `:root{--fg:#1a1a1a;--muted:#555;--accent:#0b5fff;--line:#d9d9d9}
*{box-sizing:border-box}
body{margin:0;background:#f3f4f6;color:var(--fg);font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{background:#fff;width:210mm;min-height:297mm;margin:1.5rem auto;padding:18mm 16mm;box-shadow:0 1px 6px rgba(0,0,0,.15)}
h1{font-size:1.7rem;margin:0}
.tagline{font-size:1.05rem;color:var(--muted);margin:.15rem 0 0}
.contact{color:var(--muted);font-size:.85rem;margin:.4rem 0 0;display:flex;flex-wrap:wrap;gap:.25rem 1rem}
.contact a{color:var(--accent)}
.bio-body{margin:.75rem 0 0}
.bio-body p{margin:.35rem 0 0}
.bio-body p:first-child{margin-top:0}
.bio-body h3{font-size:.95rem;margin:.6rem 0 .15rem}
.bio-body h4{font-size:.85rem;margin:.5rem 0 .15rem}
.bio-body ul{padding-left:1.1rem;margin:.2rem 0 0;list-style:disc}
.bio-body li{margin:.05rem 0}
.bio-body hr{border:0;border-top:1px solid var(--line);margin:.5rem 0}
header{border-bottom:2px solid var(--fg);padding-bottom:.6rem;margin-bottom:.4rem}
section{margin-top:1.1rem}
h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-bottom:1px solid var(--line);margin:0 0 .5rem;padding-bottom:.15rem}
ul{padding:0;margin:0;list-style:none}
.entry{margin:0 0 .7rem;break-inside:avoid}
.entry .row{display:flex;justify-content:space-between;gap:1rem;align-items:baseline}
.entry h3{font-size:.95rem;margin:0}
.entry .dates{color:var(--muted);font-size:.8rem;white-space:nowrap}
.entry .sub{color:var(--muted);margin:.05rem 0}
.entry p{margin:.2rem 0 0}
.entry a{color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:.3rem}
.chips li{border:1px solid var(--line);border-radius:1rem;padding:.05rem .55rem;font-size:.8rem}
@media print{
  body{background:#fff}
  main{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
  a{color:var(--fg)}
}
@page{size:A4;margin:14mm}`;

/** One résumé entry: a heading row (title + dates), an optional sub line, body. */
interface CvEntryView {
  heading: string;
  url?: string;
  dates?: string;
  sub?: string;
  body?: string;
}

function renderEntry(entry: CvEntryView): string {
  const href = entry.url ? safeUrl(entry.url) : undefined;
  const title = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(entry.heading)}</a>`
    : escapeHtml(entry.heading);
  // `entry.dates` is already an escaped HTML fragment from `dateRange` (localized
  // <time> elements), so it is inserted raw rather than re-escaped.
  const dates = entry.dates ? `<span class="dates">${entry.dates}</span>` : '';
  const parts = [`<div class="row"><h3>${title}</h3>${dates}</div>`];
  if (entry.sub) parts.push(`<p class="sub">${escapeHtml(entry.sub)}</p>`);
  if (entry.body) parts.push(`<p>${escapeHtml(entry.body)}</p>`);
  return `<li class="entry">${parts.join('')}</li>`;
}

function entryListSection(title: string, entries: readonly CvEntryView[]): string {
  return `<section><h2>${escapeHtml(title)}</h2><ul>${entries.map(renderEntry).join('')}</ul></section>`;
}

/** Skills / languages render as compact chip rows rather than dated entries. */
function chipSection(title: string, labels: readonly string[]): string {
  const chips = labels.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  return `<section><h2>${escapeHtml(title)}</h2><ul class="chips">${chips}</ul></section>`;
}

function languageLabel(l: LocalizedLanguage): string {
  return `${l.displayName ?? l.language} — ${l.proficiency}`;
}

/**
 * Render one CV section to its `<section>` markup, dispatching on `kind`. The
 * `locale` formats every date in the section (via {@link dateRange}); the
 * per-entry helpers below receive their dates already formatted, so only this
 * dispatcher needs the locale.
 */
function renderSection(section: CvSection, locale: LocaleTag): string {
  const title = SECTION_TITLES[section.kind];
  switch (section.kind) {
    case 'experience':
      return entryListSection(
        title,
        section.entries.map((c) => ({
          heading: c.role,
          sub: c.organization,
          dates: dateRange(c.startDate, { end: c.endDate, isCurrent: c.isCurrent, locale }),
          body: c.description,
          url: c.url,
        })),
      );
    case 'education':
      return entryListSection(
        title,
        section.entries.map((e) => {
          const degree = nonEmpty([e.degree, e.fieldOfStudy], ', ');
          return {
            heading: degree ?? e.institution,
            sub: degree ? e.institution : undefined,
            dates: dateRange(e.startDate, { end: e.endDate, isCurrent: e.isCurrent, locale }),
            body: e.description,
            url: e.url,
          };
        }),
      );
    case 'skills':
      return chipSection(
        title,
        section.entries.map((s) => s.label),
      );
    case 'languages':
      return chipSection(title, section.entries.map(languageLabel));
    case 'certifications':
      return entryListSection(
        title,
        section.entries.map((c) => ({
          heading: c.title,
          sub: c.issuingOrganization,
          dates: dateRange(c.issueDate, { end: c.expirationDate, locale }),
          url: c.url,
        })),
      );
    case 'publications':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.title,
          sub: nonEmpty([x.publisher, x.coAuthors?.join(', ')], ' · '),
          dates: dateRange(x.date, { locale }),
          body: x.description,
          url: x.url ?? (x.doi ? `https://doi.org/${x.doi}` : undefined),
        })),
      );
    case 'honors':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.title,
          sub: x.issuer,
          dates: dateRange(x.date, { locale }),
          body: x.description,
          url: x.url,
        })),
      );
    case 'courses':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.title,
          sub: x.provider,
          dates: dateRange(x.completionDate, { locale }),
          body: x.description,
          url: x.certificateUrl,
        })),
      );
    case 'patents':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.title,
          sub: nonEmpty([x.patentNumber, x.office, x.status], ' · '),
          dates: dateRange(x.filingDate ?? x.grantDate, { locale }),
          body: x.description,
          url: x.url,
        })),
      );
    case 'volunteering':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.role,
          sub: nonEmpty([x.organization, x.cause], ' · '),
          dates: dateRange(x.startDate, { end: x.endDate, isCurrent: x.isCurrent, locale }),
          body: x.description,
          url: x.url,
        })),
      );
    case 'memberships':
      return entryListSection(
        title,
        section.entries.map((x) => ({
          heading: x.role ?? x.organization,
          sub: x.role ? x.organization : undefined,
          dates: dateRange(x.startDate, { end: x.endDate, isCurrent: x.isCurrent, locale }),
          body: x.description,
          url: x.url,
        })),
      );
  }
}

function renderHeader(cv: CvDocument): string {
  const h = cv.header;
  const parts = [`<h1>${escapeHtml(h.displayName)}</h1>`];
  if (h.tagline) parts.push(`<p class="tagline">${escapeHtml(h.tagline)}</p>`);

  const contact: string[] = [];
  if (h.location) contact.push(`<span>${escapeHtml(h.location)}</span>`);
  if (h.email) {
    contact.push(`<a href="mailto:${escapeHtml(h.email)}">${escapeHtml(h.email)}</a>`);
  }
  const formHref = h.formUrl ? safeUrl(h.formUrl) : undefined;
  if (formHref) contact.push(`<a href="${escapeHtml(formHref)}">Contact</a>`);
  if (contact.length > 0) parts.push(`<div class="contact">${contact.join('')}</div>`);

  // `h.bio` carries the same Markdown-subset `profile.bio` the profile page
  // renders (core's deriveCv copies it verbatim), so it goes through the shared
  // {@link renderMarkdown} — one field, one meaning across both surfaces. The
  // result is block-level markup, so it wraps in a `<div>`, never a `<p>`. The
  // `.bio-body` class name mirrors the profile page's markdown content container.
  if (h.bio) parts.push(`<div class="bio-body">${renderMarkdown(h.bio)}</div>`);
  return `<header>${parts.join('')}</header>`;
}

/** Render a complete static HTML résumé document for one locale-resolved CV. */
export function renderCvHtml(cv: CvDocument): string {
  const title = `${cv.header.displayName} — CV`;
  const body = [
    renderHeader(cv),
    ...cv.sections.map((s) => renderSection(s, cv.resolvedLocale)),
  ].join('\n');
  return (
    `<!DOCTYPE html>\n<html lang="${escapeHtml(cv.resolvedLocale)}">\n<head>\n` +
    `  <meta charset="utf-8">\n` +
    `  <meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `  <title>${escapeHtml(title)}</title>\n` +
    `  <style>${CSS}</style>\n</head>\n` +
    `<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`
  );
}
