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
import type {
  ActivitySnapshot,
  AppearanceColors,
  AppearanceSettings,
  LocalizedTakuhon,
} from '@takuhon/core';

import { brandIconSvg } from './brand-icons.js';
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
  /**
   * First-party composition slots: raw HTML injected verbatim at three fixed
   * points so a host can extend the page without forking the renderer (a page
   * `<head>`, a trailing `<main>` section, a pre-`</body>` block). Unlike every
   * other input, slot content is NOT escaped — it is the caller's own trusted
   * markup (e.g. Open Graph tags, a PWA manifest link, an analytics beacon, a
   * bespoke section), never profile/user data. Absent slots emit nothing, so a
   * caller that passes none (e.g. the turnkey public app) gets byte-identical
   * output. See {@link RenderSlots}.
   */
  slots?: RenderSlots;
  /**
   * Localized overrides for the section headings and chrome labels, merged over
   * the built-in English defaults ({@link DEFAULT_LABELS}). The renderer stays
   * locale-agnostic — it ships English and never guesses another language — so a
   * bilingual host supplies the heading strings for the resolved locale here.
   * Absent = the English defaults, byte-identical to before this field existed.
   */
  labels?: Partial<SectionLabels>;
  /**
   * Sections whose DEFAULT rendering to suppress in the visible body — so a host
   * can replace one with its own markup via {@link RenderSlots.mainEnd} without
   * it appearing twice. This affects the visible body ONLY: the embedded JSON-LD
   * is still generated from the complete document, so structured data never
   * loses a suppressed section. Absent / empty = every section renders.
   */
  omitSections?: readonly OmittableSection[];
}

/**
 * First-party raw-HTML injection points. Content is inserted verbatim (not
 * escaped): it is the host's own trusted markup, not profile/user data. Keep it
 * self-contained — the renderer makes no guarantees about it.
 *
 * CSP: the renderer does not set any Content-Security-Policy — the adapter does.
 * The turnkey public app serves `script-src 'self'` (no `'unsafe-inline'`), so
 * an inline `<script>` injected via `bodyEnd`/`head` is blocked there; prefer an
 * external `<script src>` or ensure the host's own CSP permits the slot content.
 *
 * Reserved id: the renderer owns `<main id="main">` (the skip-link target). A
 * slot MUST NOT inject another element with `id="main"`, or the skip anchor
 * becomes ambiguous.
 */
export interface RenderSlots {
  /** Injected in `<head>`, after the `<style>` block (e.g. OG tags, manifest link). */
  head?: string;
  /** Injected at the end of `<main>`, after all rendered sections (e.g. a bespoke section). */
  mainEnd?: string;
  /**
   * Injected before `</body>`, after the footer and contact script (e.g. an
   * analytics beacon). Inline scripts here require a CSP that allows them (see
   * the interface note) — the turnkey `script-src 'self'` would block them.
   */
  bodyEnd?: string;
}

/**
 * A section whose default rendering can be suppressed via
 * {@link RenderInput.omitSections}. One key per visible `<section>` the renderer
 * emits from the document (chrome like the header, links nav, and locale nav is
 * not suppressible).
 */
export type OmittableSection =
  | 'experience'
  | 'projects'
  | 'skills'
  | 'activity'
  | 'education'
  | 'certifications'
  | 'publications'
  | 'honors'
  | 'memberships'
  | 'volunteering'
  | 'courses'
  | 'patents'
  | 'testScores'
  | 'languages'
  | 'recommendations'
  | 'contact';

/** Section headings and chrome labels the caller can localize via {@link RenderInput.labels}. */
export interface SectionLabels {
  experience: string;
  projects: string;
  skills: string;
  activity: string;
  education: string;
  certifications: string;
  publications: string;
  honors: string;
  memberships: string;
  volunteering: string;
  courses: string;
  patents: string;
  testScores: string;
  languages: string;
  recommendations: string;
  contact: string;
  /** Visually-hidden skip-to-content link text. */
  skipLink: string;
  /** `aria-label` for the language switcher nav. */
  localeNav: string;
  /** `aria-label` for the featured-links nav. */
  featuredLinks: string;
  /** `aria-label` for the other-links nav. */
  otherLinks: string;
}

/** Built-in English defaults for {@link SectionLabels}; overridden per-key by {@link RenderInput.labels}. */
const DEFAULT_LABELS: SectionLabels = {
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  activity: 'Activity',
  education: 'Education',
  certifications: 'Certifications',
  publications: 'Publications',
  honors: 'Honors & awards',
  memberships: 'Memberships',
  volunteering: 'Volunteering',
  courses: 'Courses',
  patents: 'Patents',
  testScores: 'Test scores',
  languages: 'Languages',
  recommendations: 'Recommendations',
  contact: 'Contact',
  skipLink: 'Skip to main content',
  localeNav: 'Language',
  featuredLinks: 'Featured links',
  otherLinks: 'Links',
};

/** Unicode-escape `<`, `>`, `&` so a JSON-LD payload cannot break out of `<script>`. */
function escapeJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * Overridable design tokens (light). Every color and the font the renderer uses
 * is a named `--takuhon-*` custom property with a default here; owners re-skin
 * the page by overriding a subset via `settings.appearance` ({@link
 * buildTokenCss}). The static rules reference only these variables (and the
 * internal tokens below), never hard-coded colors or fonts, so an override
 * propagates everywhere.
 */
const DEFAULT_TOKENS: Record<string, string> = {
  '--takuhon-color-bg': '#ffffff',
  '--takuhon-color-surface': '#f6f7f9',
  '--takuhon-color-text': '#1f2933',
  '--takuhon-color-text-muted': '#52606d',
  '--takuhon-color-border': '#d8dee7',
  '--takuhon-color-primary': '#2563eb',
  '--takuhon-color-primary-contrast': '#ffffff',
  '--takuhon-color-accent': '#4f46e5',
  '--takuhon-font-family':
    "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
};

/**
 * Default dark palette, applied under `prefers-color-scheme: dark`. Only colors
 * flip in dark mode (the internal scale tokens are shared). Owner `colorsDark`
 * overrides merge over these, exactly as `colors` merges over the light set.
 */
const DEFAULT_TOKENS_DARK: Record<string, string> = {
  '--takuhon-color-bg': '#0f172a',
  '--takuhon-color-surface': '#1e293b',
  '--takuhon-color-text': '#e2e8f0',
  '--takuhon-color-text-muted': '#94a3b8',
  '--takuhon-color-border': '#334155',
  '--takuhon-color-primary': '#60a5fa',
  '--takuhon-color-primary-contrast': '#0f172a',
  '--takuhon-color-accent': '#818cf8',
};

/**
 * Internal design-scale tokens (spacing, radius, type scale, layout). These are
 * NOT part of the `settings.appearance` override contract — they are the
 * renderer's own layout vocabulary — so they are emitted in `:root` but not
 * exposed as overridable schema keys. Kept in sync between light and dark.
 */
const INTERNAL_TOKENS: Record<string, string> = {
  '--takuhon-space-1': '4px',
  '--takuhon-space-2': '8px',
  '--takuhon-space-3': '12px',
  '--takuhon-space-4': '16px',
  '--takuhon-space-5': '24px',
  '--takuhon-space-6': '32px',
  '--takuhon-radius-sm': '6px',
  '--takuhon-radius-md': '12px',
  '--takuhon-radius-full': '9999px',
  '--takuhon-tap-target': '44px',
  '--takuhon-font-size-sm': '14px',
  '--takuhon-font-size-base': '16px',
  '--takuhon-font-size-lg': '18px',
  '--takuhon-font-size-xl': '22px',
  '--takuhon-font-size-2xl': '28px',
  '--takuhon-line-height': '1.7',
  '--takuhon-max-content-width': '720px',
};

/** Map each `AppearanceColors` key to the CSS custom property it overrides. */
const COLOR_TOKEN_VARS: Record<keyof AppearanceColors, string> = {
  bg: '--takuhon-color-bg',
  surface: '--takuhon-color-surface',
  text: '--takuhon-color-text',
  textMuted: '--takuhon-color-text-muted',
  border: '--takuhon-color-border',
  accent: '--takuhon-color-accent',
  primary: '--takuhon-color-primary',
  primaryContrast: '--takuhon-color-primary-contrast',
};

/**
 * Defense in depth. The schema pattern-constrains these values, but data can
 * reach the renderer unvalidated (pre-1.2.0 documents, adapters that skip
 * `validate()`), so the renderer re-sanitizes every token with an allowlist
 * that mirrors the schema. An unsafe, non-string, or empty value is dropped and
 * the built-in default stands.
 *
 * Colors accept only a hex value, a bare keyword (named colors / currentColor /
 * transparent), or a known color function — never `url()`, `image-set()`,
 * `var()`, or anything else that could trigger an external request or escape
 * the inline `<style>`. A permissive "any char but `;{}<>`" filter is NOT
 * enough: `url(//evil/x.png)` carries none of those characters yet would make
 * the page fetch a third-party resource. These patterns mirror `CssColor` and
 * the font-family pattern in `@takuhon/core`'s takuhon.schema.json — keep them
 * in sync.
 */
const SAFE_COLOR =
  /^(?:#[0-9A-Fa-f]{3,8}|[A-Za-z]+|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([A-Za-z0-9.,%/\s-]*\))$/;
const SAFE_FONT = /^[A-Za-z0-9\s,'"._-]+$/;

function safeValue(value: unknown, pattern: RegExp, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v === '' || v.length > maxLength || !pattern.test(v)) return undefined;
  return v;
}

const safeColor = (value: unknown): string | undefined => safeValue(value, SAFE_COLOR, 64);
const safeFont = (value: unknown): string | undefined => safeValue(value, SAFE_FONT, 256);

/** Sanitized `[cssVar, value]` pairs for the color overrides that are present. */
function colorOverrides(colors: AppearanceColors | undefined): [string, string][] {
  if (!colors) return [];
  const out: [string, string][] = [];
  for (const key of Object.keys(COLOR_TOKEN_VARS) as (keyof AppearanceColors)[]) {
    const safe = safeColor(colors[key]);
    if (safe !== undefined) out.push([COLOR_TOKEN_VARS[key], safe]);
  }
  return out;
}

/** Serialize `[var, value]` pairs into a `:root{…}` declaration block. */
function rootBlock(pairs: Iterable<[string, string]>): string {
  return `:root{${[...pairs].map(([k, v]) => `${k}:${v}`).join(';')}}`;
}

/**
 * Build the token stylesheet:
 * - `:root` = internal scale tokens + the light color/font defaults, with any
 *   owner `colors`/`fontFamily` overrides merged on top.
 * - a `prefers-color-scheme: dark` block = the default dark palette with any
 *   owner `colorsDark` overrides merged on top.
 *
 * Only the fixed set of named tokens is ever emitted — never arbitrary CSS —
 * and every overridable value is sanitized ({@link safeColor} / {@link
 * safeFont}), so a value can neither escape the inline `<style>` nor trigger an
 * external request.
 */
function buildTokenCss(appearance: AppearanceSettings | undefined): string {
  const light = new Map<string, string>([
    ...Object.entries(INTERNAL_TOKENS),
    ...Object.entries(DEFAULT_TOKENS),
  ]);
  if (appearance) {
    const font = safeFont(appearance.fontFamily);
    if (font !== undefined) light.set('--takuhon-font-family', font);
    for (const [cssVar, value] of colorOverrides(appearance.colors)) {
      light.set(cssVar, value);
    }
  }

  const dark = new Map<string, string>(Object.entries(DEFAULT_TOKENS_DARK));
  for (const [cssVar, value] of colorOverrides(appearance?.colorsDark)) {
    dark.set(cssVar, value);
  }

  return `${rootBlock(light)}\n@media (prefers-color-scheme:dark){${rootBlock(dark)}}`;
}

const CSS = `*{box-sizing:border-box}
html{font-size:100%}
body{margin:0;color:var(--takuhon-color-text);background:var(--takuhon-color-bg);font-family:var(--takuhon-font-family);font-size:var(--takuhon-font-size-base);line-height:var(--takuhon-line-height);-webkit-text-size-adjust:100%}
main{max-width:var(--takuhon-max-content-width);margin:0 auto;padding:var(--takuhon-space-6) var(--takuhon-space-4)}
a{color:var(--takuhon-color-primary)}
a:focus-visible{outline:2px solid var(--takuhon-color-accent);outline-offset:2px;border-radius:var(--takuhon-radius-sm)}
.skip-link{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.skip-link:focus{position:fixed;left:var(--takuhon-space-2);top:var(--takuhon-space-2);width:auto;height:auto;padding:var(--takuhon-space-2) var(--takuhon-space-4);background:var(--takuhon-color-primary);color:var(--takuhon-color-primary-contrast);border-radius:var(--takuhon-radius-sm);z-index:100}
h1{font-size:var(--takuhon-font-size-2xl);font-weight:700;line-height:1.2;margin:0 0 var(--takuhon-space-2)}
h2{font-size:var(--takuhon-font-size-xl);margin:0 0 var(--takuhon-space-3);padding-bottom:var(--takuhon-space-2);border-bottom:1px solid var(--takuhon-color-border)}
h3{font-size:var(--takuhon-font-size-lg);font-weight:600;margin:0}
header{margin-bottom:var(--takuhon-space-6);display:flow-root}
header .avatar{width:96px;height:96px;border-radius:var(--takuhon-radius-full);object-fit:cover;float:left;margin:0 var(--takuhon-space-3) var(--takuhon-space-3) 0;shape-outside:circle();border:1px solid var(--takuhon-color-border)}
.tagline{font-size:var(--takuhon-font-size-lg);color:var(--takuhon-color-text-muted);margin:0 0 var(--takuhon-space-2)}
.location{font-size:var(--takuhon-font-size-sm);color:var(--takuhon-color-text-muted);margin:0}
.bio{margin:var(--takuhon-space-3) 0 0}
section{margin:0 0 var(--takuhon-space-6)}
ul{padding:0;margin:0;list-style:none}
.entries>li{margin:0 0 var(--takuhon-space-4)}
.entries--timeline>li{position:relative;display:flex;flex-direction:column;margin:0 0 0 var(--takuhon-space-2);padding:0 0 var(--takuhon-space-5) var(--takuhon-space-4);border-left:2px solid var(--takuhon-color-border)}
.entries--timeline>li:last-child{padding-bottom:0}
.entries--timeline>li::before{content:"";position:absolute;left:-7px;top:6px;width:12px;height:12px;border-radius:var(--takuhon-radius-full);background:var(--takuhon-color-primary)}
.entries--timeline>li.is-current::before{background:var(--takuhon-color-accent)}
.entries--timeline .meta{order:-1;margin:0 0 var(--takuhon-space-1)}
.entries--cards{display:grid;gap:var(--takuhon-space-3)}
.entries--cards>li{margin:0;padding:var(--takuhon-space-4);border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-md);background:var(--takuhon-color-surface)}
.entries--cards>li.is-highlighted{border-color:var(--takuhon-color-accent)}
.sub{margin:var(--takuhon-space-1) 0 0;font-weight:600}
.meta{margin:var(--takuhon-space-1) 0 0;color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm)}
.featured-links,.other-links{margin:0 0 var(--takuhon-space-6)}
.featured-links>ul,.other-links>ul{list-style:none;padding:0;margin:0;display:grid;gap:var(--takuhon-space-2)}
.featured-links>ul{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.featured-links a,.other-links a{display:flex;align-items:center;gap:var(--takuhon-space-2);min-height:var(--takuhon-tap-target);padding:var(--takuhon-space-2) var(--takuhon-space-3);background:var(--takuhon-color-surface);color:var(--takuhon-color-text);text-decoration:none;border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-md)}
.featured-links a:hover,.other-links a:hover{border-color:var(--takuhon-color-accent)}
.link-main{display:inline-flex;align-items:center;gap:var(--takuhon-space-2);min-width:0}
.brand-icon{width:1.15em;height:1.15em;flex:none;opacity:.85}
.skills,.tags{display:flex;flex-wrap:wrap;gap:var(--takuhon-space-2)}
.skills>li,.tags>li{background:var(--takuhon-color-surface);border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-full);padding:var(--takuhon-space-1) var(--takuhon-space-3);font-size:var(--takuhon-font-size-sm)}
.skills-groups{display:grid;gap:var(--takuhon-space-4)}
.skill-group h3{font-size:var(--takuhon-font-size-base);margin:0 0 var(--takuhon-space-2);color:var(--takuhon-color-text-muted);text-transform:uppercase;letter-spacing:.04em}
.rec{margin:0 0 var(--takuhon-space-4)}
.rec blockquote{margin:0;padding-left:var(--takuhon-space-3);border-left:3px solid var(--takuhon-color-border)}
.rec figcaption{color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm);margin-top:var(--takuhon-space-2)}
nav.locales{display:flex;gap:var(--takuhon-space-3);margin-bottom:var(--takuhon-space-4);font-size:var(--takuhon-font-size-sm)}
.activity svg{max-width:100%;height:auto}
footer.powered{max-width:var(--takuhon-max-content-width);margin:0 auto;padding:var(--takuhon-space-5) var(--takuhon-space-4);color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm)}`;

interface EntryView {
  heading: string;
  sub?: string;
  dates?: string;
  body?: string;
  url?: string;
  tags?: readonly string[];
  /**
   * Timeline-variant "ongoing" marker (from `career.isCurrent` etc.) → an
   * `is-current` class on the `<li>` so the timeline dot uses the accent color.
   */
  current?: boolean;
  /**
   * Card-variant highlight (from `project.highlighted`) → an `is-highlighted`
   * class on the `<li>` so the card gets an accent border.
   */
  highlighted?: boolean;
}

/**
 * Layout variant for a section's entry list. Undefined = the default flat list;
 * `timeline` decorates each `<li>` as a dotted left-border timeline row (dates
 * float to the top via CSS order); `cards` lays the entries out as bordered
 * surface cards (intentionally single-column within the reading-width column —
 * long descriptions stay readable — not a responsive multi-column grid). Only
 * the container/`<li>` decoration differs — the inner {@link renderEntry}
 * markup is identical across all three.
 */
type EntriesVariant = 'timeline' | 'cards';

function renderEntry(entry: EntryView): string {
  const href = entry.url ? safeUrl(entry.url) : undefined;
  const heading = href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(entry.heading)}</a>`
    : escapeHtml(entry.heading);
  const parts = [`<h3>${heading}</h3>`];
  if (entry.sub) parts.push(`<p class="sub">${escapeHtml(entry.sub)}</p>`);
  // `entry.dates` is already an escaped HTML fragment from `dateRange` (localized
  // <time> elements), so it is inserted raw rather than re-escaped.
  // NOTE: the `timeline` variant hoists this `.meta` above the heading via CSS
  // `order:-1`, which only works while `.meta` stays a *direct child* of the
  // entry `<li>`. Keep these entry parts as flat siblings — do not wrap them in
  // a container div, or the date-first timeline ordering silently breaks.
  if (entry.dates) parts.push(`<p class="meta">${entry.dates}</p>`);
  if (entry.body) parts.push(`<p>${escapeHtml(entry.body)}</p>`);
  if (entry.tags && entry.tags.length > 0) {
    parts.push(
      `<ul class="tags">${entry.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`,
    );
  }
  // Both markers come from real schema booleans; only the relevant one is ever
  // set per section (`current` for careers, `highlighted` for projects).
  const cls = [entry.current ? 'is-current' : '', entry.highlighted ? 'is-highlighted' : '']
    .filter(Boolean)
    .join(' ');
  return `<li${cls ? ` class="${cls}"` : ''}>${parts.join('')}</li>`;
}

/** Render a `<section>` of entries, or `''` when there are none. */
function entryList(title: string, entries: readonly EntryView[], variant?: EntriesVariant): string {
  if (entries.length === 0) return '';
  const cls = variant ? `entries entries--${variant}` : 'entries';
  return `<section><h2>${escapeHtml(title)}</h2><ul class="${cls}">${entries
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

type LocalizedLink = LocalizedTakuhon['links'][number];

/** Render one link as a pill: brand glyph (when the type has one) + label. */
function renderLinkItem(link: LocalizedLink): string {
  const label = escapeHtml(link.label ?? link.url);
  const main = `<span class="link-main">${brandIconSvg(link.type)}<span>${label}</span></span>`;
  const href = safeUrl(link.url);
  // rel="me" declares these as the owner's own profiles (IndieWeb / Mastodon
  // verification); noopener hardens the external navigation.
  return href
    ? `<li><a href="${escapeHtml(href)}" rel="me noopener">${main}</a></li>`
    : `<li>${main}</li>`;
}

/** Ascending by `order` (absent sorts as 0), preserving input order on ties. */
function byOrder(a: LocalizedLink, b: LocalizedLink): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Render the links as two groups — featured first, then the rest — each an
 * ordered pill list with an inline brand glyph for recognized types. Splitting
 * on `featured` and sorting on `order` uses only existing schema fields; an
 * empty group is omitted.
 */
function renderLinks(
  links: LocalizedTakuhon['links'],
  featuredLabel: string,
  otherLabel: string,
): string {
  if (links.length === 0) return '';
  const featured = links.filter((l) => l.featured === true).sort(byOrder);
  const others = links.filter((l) => l.featured !== true).sort(byOrder);
  const group = (cls: string, ariaLabel: string, items: LocalizedLink[]): string =>
    items.length === 0
      ? ''
      : `<nav class="${cls}" aria-label="${escapeHtml(ariaLabel)}"><ul>${items.map(renderLinkItem).join('')}</ul></nav>`;
  return [
    group('featured-links', featuredLabel, featured),
    group('other-links', otherLabel, others),
  ]
    .filter(Boolean)
    .join('\n');
}

type LocalizedSkill = LocalizedTakuhon['skills'][number];

/**
 * Render the Skills section. With no `settings.skillCategories` it stays a flat
 * chip list (the default). When categories are configured, skills are grouped
 * by their `category` under the configured localized headings in declared
 * order; any category present on a skill but not configured renders after, with
 * its raw key as the heading; and uncategorized skills fall into a final,
 * heading-less group — so no skill is ever dropped.
 */
function renderSkills(
  skills: LocalizedTakuhon['skills'],
  categories: LocalizedTakuhon['settings']['skillCategories'],
  heading: string,
): string {
  if (skills.length === 0) return '';
  const h = escapeHtml(heading);
  const chips = (list: readonly LocalizedSkill[]): string =>
    `<ul class="skills">${list.map((s) => `<li>${escapeHtml(s.label)}</li>`).join('')}</ul>`;

  if (!categories || categories.length === 0) {
    return `<section><h2>${h}</h2>${chips(skills)}</section>`;
  }

  // Bucket by category, preserving input order within each bucket. `category`
  // has minLength 1 in the schema, so '' is a safe marker for "uncategorized".
  const UNCAT = '';
  const buckets = new Map<string, LocalizedSkill[]>();
  for (const s of skills) {
    const key = s.category ?? UNCAT;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }

  const group = (heading: string | undefined, list: readonly LocalizedSkill[]): string =>
    `<div class="skill-group">${heading !== undefined ? `<h3>${escapeHtml(heading)}</h3>` : ''}${chips(list)}</div>`;

  const seen = new Set<string>();
  const groups: string[] = [];
  for (const cat of categories) {
    const list = buckets.get(cat.id);
    if (!list || list.length === 0) continue;
    seen.add(cat.id);
    groups.push(group(cat.label, list));
  }
  for (const [key, list] of buckets) {
    if (key === UNCAT || seen.has(key)) continue;
    groups.push(group(key, list));
  }
  const uncategorized = buckets.get(UNCAT);
  if (uncategorized && uncategorized.length > 0) groups.push(group(undefined, uncategorized));

  return `<section><h2>${h}</h2><div class="skills-groups">${groups.join('')}</div></section>`;
}

function renderLanguages(languages: LocalizedTakuhon['languages'], heading: string): string {
  if (languages.length === 0) return '';
  const items = languages
    .map((l) => `<li>${escapeHtml(`${l.displayName ?? l.language} — ${l.proficiency}`)}</li>`)
    .join('');
  return `<section><h2>${escapeHtml(heading)}</h2><ul class="entries">${items}</ul></section>`;
}

function renderRecommendations(recs: LocalizedTakuhon['recommendations'], heading: string): string {
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
  return `<section><h2>${escapeHtml(heading)}</h2>${items}</section>`;
}

function renderContact(contact: LocalizedTakuhon['contact'], heading: string): string {
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
  return `<section><h2>${escapeHtml(heading)}</h2><ul class="entries">${items.join('')}</ul></section>`;
}

/**
 * Render the developer-activity section from the synced snapshot, or `''`
 * when there is none (or it carries no metric data). The SVG is generated by
 * `@takuhon/core` from stored numbers only — no external badge image — so the
 * page works under an `img-src 'self'` CSP.
 */
function renderActivity(snapshot: ActivitySnapshot | undefined, heading: string): string {
  if (!snapshot) return '';
  const svg = renderActivitySvg(snapshot);
  if (svg === '') return '';
  return `<section class="activity"><h2>${escapeHtml(heading)}</h2>${svg}</section>`;
}

function renderJsonLdScript(data: LocalizedTakuhon): string {
  const payload = JSON.stringify(generateJsonLd(data));
  return `<script type="application/ld+json">${escapeJsonLd(payload)}</script>`;
}

function renderLocaleNav(localeNav: readonly LocaleLink[], ariaLabel: string): string {
  const items = localeNav
    .map((l) =>
      l.current
        ? `<span aria-current="true">${escapeHtml(l.locale)}</span>`
        : `<a href="${escapeHtml(l.href)}">${escapeHtml(l.locale)}</a>`,
    )
    .join('');
  return `<nav class="locales" aria-label="${escapeHtml(ariaLabel)}">${items}</nav>`;
}

/** Render a complete static HTML document for one locale-resolved profile. */
export function renderProfileHtml(input: RenderInput): string {
  const d = input.localized;
  const p = d.profile;
  const description = p.tagline ?? p.bio ?? '';

  // Section headings + chrome labels: English defaults, overridden per-key by
  // the caller for the resolved locale. `omit` suppresses a section's visible
  // rendering (never its JSON-LD, generated from the full document below).
  const L: SectionLabels = { ...DEFAULT_LABELS, ...input.labels };
  const omit = new Set<OmittableSection>(input.omitSections ?? []);
  const keep = (key: OmittableSection, html: string): string => (omit.has(key) ? '' : html);

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
    `<style>${buildTokenCss(d.settings.appearance)}\n${CSS}</style>`,
    // First-party <head> slot (raw, unescaped): OG tags, manifest link, etc.
    input.slots?.head ?? '',
  ]
    .filter(Boolean)
    .join('\n  ');

  const body = [
    input.localeNav.length > 1 ? renderLocaleNav(input.localeNav, L.localeNav) : '',
    renderHeader(p),
    renderLinks(d.links, L.featuredLinks, L.otherLinks),
    keep(
      'experience',
      entryList(
        L.experience,
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
          current: c.isCurrent,
        })),
        'timeline',
      ),
    ),
    keep(
      'projects',
      entryList(
        L.projects,
        d.projects.map((x) => ({
          heading: x.title,
          dates: dateRange(x.startDate, { end: x.endDate, locale: d.resolvedLocale }),
          body: x.description,
          url: x.url,
          tags: x.tags,
          highlighted: x.highlighted,
        })),
        'cards',
      ),
    ),
    keep('skills', renderSkills(d.skills, d.settings.skillCategories, L.skills)),
    keep('activity', renderActivity(input.activitySnapshot, L.activity)),
    keep(
      'education',
      entryList(
        L.education,
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
    ),
    keep(
      'certifications',
      entryList(
        L.certifications,
        d.certifications.map((c) => ({
          heading: c.title,
          sub: c.issuingOrganization,
          dates: dateRange(c.issueDate, { end: c.expirationDate, locale: d.resolvedLocale }),
          url: c.url,
        })),
      ),
    ),
    keep(
      'publications',
      entryList(
        L.publications,
        d.publications.map((x) => ({
          heading: x.title,
          sub: nonEmpty([x.publisher, x.coAuthors?.join(', ')], ' · '),
          dates: dateRange(x.date, { locale: d.resolvedLocale }),
          body: x.description,
          url: x.url ?? (x.doi ? `https://doi.org/${x.doi}` : undefined),
        })),
      ),
    ),
    keep(
      'honors',
      entryList(
        L.honors,
        d.honors.map((x) => ({
          heading: x.title,
          sub: x.issuer,
          dates: dateRange(x.date, { locale: d.resolvedLocale }),
          body: x.description,
          url: x.url,
        })),
      ),
    ),
    keep(
      'memberships',
      entryList(
        L.memberships,
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
    ),
    keep(
      'volunteering',
      entryList(
        L.volunteering,
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
    ),
    keep(
      'courses',
      entryList(
        L.courses,
        d.courses.map((x) => ({
          heading: x.title,
          sub: x.provider,
          dates: dateRange(x.completionDate, { locale: d.resolvedLocale }),
          body: x.description,
          url: x.certificateUrl,
        })),
      ),
    ),
    keep(
      'patents',
      entryList(
        L.patents,
        d.patents.map((x) => ({
          heading: x.title,
          sub: nonEmpty([x.patentNumber, x.office, x.status, x.coInventors?.join(', ')], ' · '),
          dates: dateRange(x.filingDate ?? x.grantDate, { locale: d.resolvedLocale }),
          body: x.description,
          url: x.url,
        })),
      ),
    ),
    keep(
      'testScores',
      entryList(
        L.testScores,
        d.testScores.map((x) => ({
          heading: `${x.title}: ${x.score}`,
          dates: dateRange(x.date, { locale: d.resolvedLocale }),
          body: x.description,
          url: x.url,
        })),
      ),
    ),
    keep('languages', renderLanguages(d.languages, L.languages)),
    keep('recommendations', renderRecommendations(d.recommendations, L.recommendations)),
    keep('contact', renderContact(d.contact, L.contact)),
    input.slots?.mainEnd ?? '',
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

  // Skip link (always on): a visually-hidden a11y affordance that becomes
  // visible on focus and jumps past the chrome to `<main id="main">`.
  const skipLink = `<a class="skip-link" href="#main">${escapeHtml(L.skipLink)}</a>\n`;
  // First-party pre-`</body>` slot (raw, unescaped): analytics beacon, SW
  // registration, etc.
  const bodyEnd = input.slots?.bodyEnd ?? '';

  return (
    `<!DOCTYPE html>\n<html lang="${escapeHtml(d.resolvedLocale)}">\n<head>\n  ${head}\n</head>\n` +
    `<body>\n${skipLink}<main id="main">\n${body}\n</main>\n${footer ? `${footer}\n` : ''}${contactScript}${bodyEnd}</body>\n</html>\n`
  );
}
