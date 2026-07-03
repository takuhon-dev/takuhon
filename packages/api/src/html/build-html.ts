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

import { generateJsonLd, renderActivitySvg, SECTION_KEYS } from '@takuhon/core';
import type {
  ActivitySnapshot,
  AppearanceColors,
  AppearanceSettings,
  LabelKey,
  LocalizedTakuhon,
  SectionKey,
} from '@takuhon/core';

import { brandIconForLink, brandIconForPlatform } from './brand-icons.js';
import { dateRange, escapeHtml, nonEmpty, safeUrl, timeTag } from './html-helpers.js';

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
   * Copyright year for the footer license line (`© {year} {name} — {spdx}`).
   * The renderer is pure, so the clock lives with the caller: a server/CLI
   * passes `new Date().getFullYear()`; a test passes a fixed value. When absent,
   * the license line omits the year (`© {name} — {spdx}`) so output stays
   * deterministic by default.
   */
  year?: number;
  /**
   * First-party composition slots: raw HTML injected verbatim at three fixed
   * points so a host can extend the page without forking the renderer (a page
   * `<head>`, a trailing `<main>` section, a pre-`</body>` block). Unlike every
   * other input, slot content is NOT escaped — it is the caller's own trusted
   * markup (e.g. an og:image tag, a PWA manifest link, an analytics beacon, a
   * bespoke section), never profile/user data. Absent slots emit nothing, so
   * passing no slots is byte-identical to passing empty slots. See {@link
   * RenderSlots}.
   */
  slots?: RenderSlots;
  /**
   * Localized overrides for the section headings and chrome labels, merged over
   * the built-in pack chosen for the resolved locale ({@link pickLabelPack}: a
   * Japanese base-language locale gets the Japanese pack, everything else
   * English). A host supplies overrides only for the strings it wants to change
   * (e.g. a bespoke heading); an absent field takes the pack default.
   */
  labels?: Partial<SectionLabels>;
  /**
   * Sections whose DEFAULT rendering to suppress in the visible body — so a host
   * can replace one with its own markup via {@link RenderSlots.mainEnd} without
   * it appearing twice. This affects the visible body ONLY: the embedded JSON-LD
   * is still generated from the complete document, so structured data never
   * loses a suppressed section. Absent / empty = every section renders.
   */
  omitSections?: readonly SectionKey[];
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
  /**
   * Injected in `<head>`, after the `<style>` block (e.g. OG image tags, a PWA
   * manifest link, theme-color). NOTE: the renderer already owns the data-derived
   * Open Graph tags (`og:type`/`og:title`/`og:description`/`og:url`); a host slot
   * should supply only the asset tags it owns (`og:image`, `twitter:image`, …)
   * and MUST NOT re-inject the renderer-owned ones, or they appear twice.
   */
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
 * Section headings (one per {@link SectionKey}) plus chrome labels (skip link,
 * nav aria-labels, the other-links heading, the footer credit lead-in) the
 * caller can localize. The full key set is the core {@link LabelKey} taxonomy,
 * so this type, `settings.sectionLabels`, and {@link RenderInput.labels} stay in
 * lock-step. The renderer ships Japanese and English packs and picks one by the
 * resolved locale ({@link pickLabelPack}); `settings.sectionLabels` then
 * `labels` override individual strings on top.
 */
export type SectionLabels = Record<LabelKey, string>;

/** Built-in English label pack. */
const LABELS_EN: SectionLabels = {
  about: 'About',
  careers: 'Experience',
  projects: 'Projects',
  volunteering: 'Volunteering',
  skills: 'Skills',
  activity: 'Developer activity',
  education: 'Education',
  certifications: 'Certifications',
  publications: 'Publications',
  honors: 'Honors & awards',
  memberships: 'Memberships',
  courses: 'Courses',
  patents: 'Patents',
  testScores: 'Test scores',
  languages: 'Languages',
  recommendations: 'Recommendations',
  highlights: 'Selected posts',
  contact: 'Contact',
  skipLink: 'Skip to main content',
  localeNav: 'Language',
  featuredLinks: 'Featured links',
  otherLinks: 'Links',
  poweredBy: 'Powered by',
};

/** Built-in Japanese label pack. */
const LABELS_JA: SectionLabels = {
  about: '自己紹介',
  careers: '経歴',
  projects: 'プロジェクト',
  volunteering: 'ボランティア',
  skills: 'スキル',
  activity: '開発アクティビティ',
  education: '学歴',
  certifications: '資格・認定',
  publications: '出版物',
  honors: '受賞・栄誉',
  memberships: '所属',
  courses: '講座',
  patents: '特許',
  testScores: 'テストスコア',
  languages: '言語',
  recommendations: '推薦',
  highlights: 'ピックアップ投稿',
  contact: '連絡先',
  skipLink: 'メインコンテンツへスキップ',
  localeNav: '言語',
  featuredLinks: '主要リンク',
  otherLinks: 'その他のリンク',
  poweredBy: 'Powered by',
};

/**
 * Choose a built-in label pack by the resolved locale's base language: a
 * Japanese locale (`ja`, `ja-JP`, …) gets the Japanese pack, everything else the
 * English pack. The renderer used to ship English only and leave localization to
 * the caller; shipping a Japanese pack and auto-selecting is deliberate (a
 * Japanese turnkey site should not show English headings). A caller can still
 * override any string via {@link RenderInput.labels}.
 */
/**
 * Base-language test: true for `ja`, `ja-JP`, … The primary language subtag is
 * compared exactly (so a different language that merely starts with "ja" does
 * not match). Drives both the label pack and the date-range separator.
 */
function isJapaneseLocale(resolvedLocale: string): boolean {
  return resolvedLocale.toLowerCase().split(/[-_]/)[0] === 'ja';
}

function pickLabelPack(resolvedLocale: string): SectionLabels {
  return isJapaneseLocale(resolvedLocale) ? LABELS_JA : LABELS_EN;
}

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
section{margin:0 0 var(--takuhon-space-6)}
.bio-body h3{font-size:var(--takuhon-font-size-lg);font-weight:600;margin:var(--takuhon-space-5) 0 var(--takuhon-space-2)}
.bio-body h4{font-size:var(--takuhon-font-size-base);font-weight:600;margin:var(--takuhon-space-4) 0 var(--takuhon-space-2)}
.bio-body p{margin:0 0 var(--takuhon-space-3)}
.bio-body ul{list-style:disc;margin:0 0 var(--takuhon-space-3);padding-left:var(--takuhon-space-5)}
.bio-body li{margin:0 0 var(--takuhon-space-1)}
.bio-body hr{border:0;border-top:1px solid var(--takuhon-color-border);margin:var(--takuhon-space-5) 0}
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
.entries h3 a{color:inherit;text-decoration:none}
.entries h3 a:hover{color:var(--takuhon-color-primary);text-decoration:underline}
.sub{margin:var(--takuhon-space-1) 0 0;color:var(--takuhon-color-text-muted)}
.sub a{color:inherit;text-decoration:none}
.sub a:hover{color:var(--takuhon-color-primary);text-decoration:underline}
.role-badge{margin:var(--takuhon-space-1) 0 0;font-size:var(--takuhon-font-size-sm);font-weight:600;letter-spacing:.02em;color:var(--takuhon-color-accent)}
.desc{margin:var(--takuhon-space-2) 0 0}
.entries--timeline .desc{white-space:pre-wrap}
.external-icon{width:.72em;height:.72em;margin-left:.35em;vertical-align:-.05em;opacity:.55}
.meta{margin:var(--takuhon-space-1) 0 0;color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm)}
.featured-links,.other-links{margin:0 0 var(--takuhon-space-6)}
.featured-links>ul,.other-links>ul{list-style:none;padding:0;margin:0;display:grid;gap:var(--takuhon-space-2)}
.featured-links>ul{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.featured-links a,.other-links a{display:flex;align-items:center;justify-content:space-between;gap:var(--takuhon-space-2);min-height:var(--takuhon-tap-target);padding:var(--takuhon-space-2) var(--takuhon-space-3);background:var(--takuhon-color-surface);color:var(--takuhon-color-text);text-decoration:none;border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-md)}
.featured-links a:hover,.other-links a:hover{border-color:var(--takuhon-color-accent)}
.link-main{display:inline-flex;align-items:center;gap:var(--takuhon-space-2);min-width:0}
.link-type{font-size:var(--takuhon-font-size-sm);color:var(--takuhon-color-text-muted)}
.brand-icon{width:1.15em;height:1.15em;flex:none;opacity:.85}
.skills,.tags{display:flex;flex-wrap:wrap;gap:var(--takuhon-space-2)}
.skills>li,.tags>li{background:var(--takuhon-color-surface);border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-full);padding:var(--takuhon-space-1) var(--takuhon-space-3);font-size:var(--takuhon-font-size-sm)}
.skills-groups{display:grid;gap:var(--takuhon-space-4)}
.skill-group h3{font-size:var(--takuhon-font-size-base);margin:0 0 var(--takuhon-space-2);color:var(--takuhon-color-text-muted);text-transform:uppercase;letter-spacing:.04em}
.vol-list{display:grid;gap:var(--takuhon-space-2)}
.vol{padding:var(--takuhon-space-3) 0;border-bottom:1px solid var(--takuhon-color-border)}
.vol:last-child{border-bottom:0}
.vol-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--takuhon-space-1) var(--takuhon-space-3)}
.vol-org{font-size:var(--takuhon-font-size-lg)}
.vol-org a{color:inherit;text-decoration:none}
.vol-org a:hover{color:var(--takuhon-color-primary);text-decoration:underline}
.vol-role{color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm)}
.vol-desc{margin:var(--takuhon-space-1) 0 0;font-size:var(--takuhon-font-size-sm)}
.rec{margin:0 0 var(--takuhon-space-4)}
.rec blockquote{margin:0;padding-left:var(--takuhon-space-3);border-left:3px solid var(--takuhon-color-border)}
.rec figcaption{color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm);margin-top:var(--takuhon-space-2)}
nav.locales{display:flex;justify-content:flex-end;gap:var(--takuhon-space-3);margin-bottom:var(--takuhon-space-4);font-size:var(--takuhon-font-size-sm)}
.activity svg{max-width:100%;height:auto}
footer.powered{max-width:var(--takuhon-max-content-width);margin:var(--takuhon-space-6) auto 0;padding:var(--takuhon-space-4) var(--takuhon-space-4) var(--takuhon-space-6);border-top:1px solid var(--takuhon-color-border);text-align:center;color:var(--takuhon-color-text-muted);font-size:var(--takuhon-font-size-sm)}
footer.powered p{margin:0 0 var(--takuhon-space-2)}
footer.powered p:last-child{margin-bottom:0}
footer.powered .powered-by a{color:var(--takuhon-color-primary);text-decoration:none}
footer.powered .powered-by a:hover{text-decoration:underline}
.highlights .highlights-intro{color:var(--takuhon-color-text-muted);margin:0 0 var(--takuhon-space-3)}
.highlights-track{display:flex;gap:var(--takuhon-space-3);list-style:none;margin:0;padding:0 0 var(--takuhon-space-2);overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:var(--takuhon-space-1);-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.highlight-card{position:relative;flex:0 0 85%;scroll-snap-align:start;display:flex;flex-direction:column;background:var(--takuhon-color-surface);border:1px solid var(--takuhon-color-border);border-radius:var(--takuhon-radius-md);overflow:hidden}
@media (min-width:640px){.highlight-card{flex-basis:calc((100% - var(--takuhon-space-3)) / 2)}}
@media (min-width:960px){.highlight-card{flex-basis:calc((100% - 2 * var(--takuhon-space-3)) / 3)}}
.highlight-card:hover{border-color:var(--takuhon-color-accent)}
.highlight-card:focus-within{outline:2px solid var(--takuhon-color-accent);outline-offset:2px}
.highlight-thumb{aspect-ratio:1 / 1;background:var(--takuhon-color-bg)}
.highlight-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.highlight-body{padding:var(--takuhon-space-3);display:flex;flex-direction:column;gap:var(--takuhon-space-2)}
.highlight-body>*{margin:0}
.highlight-badge{display:inline-flex;align-items:center;gap:var(--takuhon-space-1);font-size:var(--takuhon-font-size-sm);color:var(--takuhon-color-text-muted)}
.highlight-badge .brand-icon{width:1em;height:1em;opacity:.85}
.highlight-title{font-size:var(--takuhon-font-size-base);font-weight:600}
.highlight-title a{color:var(--takuhon-color-text);text-decoration:none}
.highlight-title a:hover{color:var(--takuhon-color-primary)}
.highlight-title a::after{content:"";position:absolute;inset:0}
.highlight-title a:focus-visible{outline:none}
.highlight-date{font-size:var(--takuhon-font-size-sm);color:var(--takuhon-color-text-muted)}
.highlight-desc{font-size:var(--takuhon-font-size-sm)}
.highlight-cta{font-size:var(--takuhon-font-size-sm);font-weight:600;color:var(--takuhon-color-primary)}`;

interface EntryView {
  heading: string;
  /**
   * An accent "role" badge shown directly under the heading (a project's role).
   * Distinct from {@link sub}, which is a muted secondary line.
   */
  role?: string;
  sub?: string;
  /**
   * When set, {@link sub} renders as an external link (e.g. a career's
   * organization site) with the external-link affordance icon.
   */
  subUrl?: string;
  dates?: string;
  body?: string;
  /**
   * When set, the heading renders as an external link (e.g. a project's site)
   * with the external-link affordance icon.
   */
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
 * External-link affordance icon appended to a linked heading or sub, so on touch
 * devices (no hover) it is clear the link opens another site. A vetted static
 * literal (Feather "external-link"), never user input.
 */
const EXTERNAL_ICON =
  '<svg class="external-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/** An external link wrapping already-escaped inner HTML, with the affordance icon. */
function externalLink(url: string, innerEscaped: string): string {
  return `<a href="${escapeHtml(url)}" rel="noopener">${innerEscaped}${EXTERNAL_ICON}</a>`;
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
  const headHref = entry.url ? safeUrl(entry.url) : undefined;
  const heading = headHref
    ? externalLink(headHref, escapeHtml(entry.heading))
    : escapeHtml(entry.heading);
  const parts = [`<h3>${heading}</h3>`];
  if (entry.role) parts.push(`<p class="role-badge">${escapeHtml(entry.role)}</p>`);
  if (entry.sub) {
    const subHref = entry.subUrl ? safeUrl(entry.subUrl) : undefined;
    const sub = subHref ? externalLink(subHref, escapeHtml(entry.sub)) : escapeHtml(entry.sub);
    parts.push(`<p class="sub">${sub}</p>`);
  }
  // `entry.dates` is already an escaped HTML fragment from `dateRange` (localized
  // <time> elements), so it is inserted raw rather than re-escaped.
  // NOTE: the `timeline` variant hoists this `.meta` above the heading via CSS
  // `order:-1`, which only works while `.meta` stays a *direct child* of the
  // entry `<li>`. Keep these entry parts as flat siblings — do not wrap them in
  // a container div, or the date-first timeline ordering silently breaks.
  if (entry.dates) parts.push(`<p class="meta">${entry.dates}</p>`);
  if (entry.body) parts.push(`<p class="desc">${escapeHtml(entry.body)}</p>`);
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

/**
 * Render a `**bold**` inline run. Text is HTML-escaped FIRST, then the `**`
 * markers (plain ASCII, untouched by escaping) are turned into `<strong>` — so
 * escaped user content can never inject a tag. Non-greedy, non-nesting.
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
 */
function renderMarkdown(input: string): string {
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

/**
 * Render the "About" section from `profile.bio` as a Markdown-subset block
 * ({@link renderMarkdown}). Returns `''` when there is no bio. The section
 * carries a heading so it reads consistently with the other sections; a plain
 * prose bio still renders (as a single paragraph).
 */
function renderBio(bio: string | undefined, heading: string): string {
  if (!bio) return '';
  return `<section class="bio"><h2>${escapeHtml(heading)}</h2><div class="bio-body">${renderMarkdown(bio)}</div></section>`;
}

function renderHeader(p: LocalizedProfile, localeNavHtml: string): string {
  const parts: string[] = [];
  // The locale switcher sits at the very top of the header (right-aligned via
  // CSS) rather than as a separate pre-header nav.
  if (localeNavHtml) parts.push(localeNavHtml);
  const avatarSrc = p.avatar?.url ? safeUrl(p.avatar.url) : undefined;
  if (avatarSrc) {
    parts.push(
      `<img class="avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.avatar?.alt ?? '')}">`,
    );
  }
  parts.push(`<h1>${escapeHtml(p.displayName)}</h1>`);
  if (p.tagline) parts.push(`<p class="tagline">${escapeHtml(p.tagline)}</p>`);
  if (p.location?.display) parts.push(`<p class="location">${escapeHtml(p.location.display)}</p>`);
  // `p.bio` is no longer rendered here: it is now its own Markdown "About"
  // section ({@link renderBio}) placed after the links. It still feeds the
  // `<meta name="description">` fallback and the JSON-LD, both built from the
  // document rather than this markup.
  return `<header>${parts.join('')}</header>`;
}

type LocalizedLink = LocalizedTakuhon['links'][number];

/** Human display names for the built-in link types, used for the type pill. */
const LINK_TYPE_DISPLAY: Partial<Record<LocalizedLink['type'], string>> = {
  website: 'Website',
  blog: 'Blog',
  github: 'GitHub',
  gitlab: 'GitLab',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  instagram: 'Instagram',
  youtube: 'YouTube',
  threads: 'Threads',
  facebook: 'Facebook',
  email: 'Email',
  rss: 'RSS',
};

/**
 * A small muted type pill (e.g. "GitHub") shown at the trailing edge of a link,
 * so a link whose label is a handle still names its platform. Omitted for
 * `custom` links (no canonical name) and when the type name would just repeat
 * the visible label.
 */
function linkTypePill(link: LocalizedLink, label: string): string {
  const display = LINK_TYPE_DISPLAY[link.type];
  if (!display || display === label) return '';
  return `<span class="link-type">${escapeHtml(display)}</span>`;
}

/** Render one link as a pill: brand glyph (when resolvable) + label + type pill. */
function renderLinkItem(link: LocalizedLink): string {
  const label = link.label ?? link.url;
  const main = `<span class="link-main">${brandIconForLink(link)}<span>${escapeHtml(label)}</span></span>`;
  const pill = linkTypePill(link, label);
  const href = safeUrl(link.url);
  // rel="me" declares these as the owner's own profiles (IndieWeb / Mastodon
  // verification); noopener hardens the external navigation.
  return href
    ? `<li><a href="${escapeHtml(href)}" rel="me noopener">${main}${pill}</a></li>`
    : `<li>${main}${pill}</li>`;
}

/** Ascending by `order` (absent sorts as 0), preserving input order on ties. */
function byOrder(a: LocalizedLink, b: LocalizedLink): number {
  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * The featured links — a top-of-page pill grid (a `<nav>`, no visible heading).
 * Sorted by `order`; `''` when there are no featured links.
 */
function renderFeaturedLinks(links: LocalizedTakuhon['links'], ariaLabel: string): string {
  const featured = links.filter((l) => l.featured === true).sort(byOrder);
  if (featured.length === 0) return '';
  return `<nav class="featured-links" aria-label="${escapeHtml(ariaLabel)}"><ul>${featured
    .map(renderLinkItem)
    .join('')}</ul></nav>`;
}

/**
 * The remaining links — a bottom-of-page `<section>` with a visible heading.
 * Sorted by `order`; `''` when every link is featured. This section is pinned
 * to the bottom of the page (below the reorderable content sections).
 */
function renderOtherLinks(links: LocalizedTakuhon['links'], heading: string): string {
  const others = links.filter((l) => l.featured !== true).sort(byOrder);
  if (others.length === 0) return '';
  return `<section class="other-links"><h2>${escapeHtml(heading)}</h2><ul>${others
    .map(renderLinkItem)
    .join('')}</ul></section>`;
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

type LocalizedVolunteering = LocalizedTakuhon['volunteering'][number];

/**
 * Render the Volunteering section as a compact list of one-line-head entries:
 * the organization (linked, when a URL is present, with the external-link icon)
 * and the role on a single wrapping line, then an optional description. Dates
 * are intentionally not shown — this reads as an "involved with" list rather
 * than a dated timeline. Returns `''` when there are none.
 */
function renderVolunteering(items: readonly LocalizedVolunteering[], heading: string): string {
  if (items.length === 0) return '';
  const li = (v: LocalizedVolunteering): string => {
    const orgHref = v.url ? safeUrl(v.url) : undefined;
    const org = orgHref
      ? externalLink(orgHref, escapeHtml(v.organization))
      : escapeHtml(v.organization);
    const role = v.role ? `<span class="vol-role">${escapeHtml(v.role)}</span>` : '';
    const desc = v.description ? `<p class="vol-desc">${escapeHtml(v.description)}</p>` : '';
    return `<li class="vol"><div class="vol-head"><span class="vol-org">${org}</span>${role}</div>${desc}</li>`;
  };
  return `<section><h2>${escapeHtml(heading)}</h2><ul class="vol-list">${items
    .map(li)
    .join('')}</ul></section>`;
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

type LocalizedHighlight = LocalizedTakuhon['highlights'][number];

/**
 * Human display names for common highlight platforms. `highlights[].platform` is
 * a free-form string (not an enum), so an unknown platform shows its raw value.
 */
const PLATFORM_DISPLAY: Record<string, string> = {
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  gitlab: 'GitLab',
  youtube: 'YouTube',
  threads: 'Threads',
  facebook: 'Facebook',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  zenn: 'Zenn',
  qiita: 'Qiita',
  note: 'note',
  blog: 'Blog',
  event: 'Event',
  artwork: 'Artwork',
  project: 'Project',
};

/** A platform's display label: a curated name for known keys, else the raw value. */
function platformDisplay(platform: string): string {
  // `platform` is free-form, so a `typeof` guard on the looked-up value both
  // narrows away `undefined` (noUncheckedIndexedAccess) and rejects an inherited
  // Object.prototype member (e.g. "constructor" / "toString" resolve to
  // functions, not strings) — falling back to the raw value in either case.
  const label = PLATFORM_DISPLAY[platform.trim().toLowerCase()];
  return typeof label === 'string' ? label : platform;
}

/** The platform badge: brand glyph (when resolvable) + platform name. */
function highlightBadge(h: LocalizedHighlight): string {
  return `<span class="highlight-badge">${brandIconForPlatform(h.platform, h.url)}<span>${escapeHtml(platformDisplay(h.platform))}</span></span>`;
}

/**
 * Render one highlight ("selected post") card: a square self-hosted thumbnail,
 * a platform badge, the title (a stretched link over the whole card when a URL
 * is present), an optional date/description/tags, and a decorative CTA. The
 * whole-card link uses the CSS stretched-link pattern (`.highlight-title
 * a::after`), so there is exactly one focusable link per card and the heading
 * semantics are preserved; the CTA is `aria-hidden` since the link's aria-label
 * already carries it.
 */
function renderHighlightCard(h: LocalizedHighlight, locale: string): string {
  const imgSrc = h.image ? safeUrl(h.image) : undefined;
  const img = imgSrc
    ? `<div class="highlight-thumb"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(h.alt)}" loading="lazy" decoding="async"></div>`
    : '';
  const href = h.url ? safeUrl(h.url) : undefined;
  const name = platformDisplay(h.platform);
  const cta = isJapaneseLocale(locale) ? `${name}で見る` : `View on ${name}`;
  const title = escapeHtml(h.title);
  const titleEl = href
    ? `<h3 class="highlight-title"><a href="${escapeHtml(href)}" rel="noopener" aria-label="${escapeHtml(`${h.title} — ${cta}`)}">${title}</a></h3>`
    : `<h3 class="highlight-title">${title}</h3>`;
  // `timeTag` returns an already-escaped <time> fragment, so it is inserted raw.
  const date = h.postedAt ? `<p class="highlight-date">${timeTag(h.postedAt, locale)}</p>` : '';
  const desc = h.description ? `<p class="highlight-desc">${escapeHtml(h.description)}</p>` : '';
  const tags =
    h.tags && h.tags.length > 0
      ? `<ul class="tags">${h.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';
  const ctaEl = href
    ? `<span class="highlight-cta" aria-hidden="true">${escapeHtml(cta)} →</span>`
    : '';
  return `<li class="highlight-card">${img}<div class="highlight-body">${highlightBadge(h)}${titleEl}${date}${desc}${tags}${ctaEl}</div></li>`;
}

/**
 * Render the curated highlights ("selected posts") carousel: a CSS scroll-snap
 * track of cards (no JS, no autoplay), with an optional intro line under the
 * heading. Returns `''` when there are no highlights, so the section is omitted.
 */
function renderHighlights(
  items: readonly LocalizedHighlight[],
  heading: string,
  intro: string | undefined,
  locale: string,
): string {
  if (items.length === 0) return '';
  const introEl = intro ? `<p class="highlights-intro">${escapeHtml(intro)}</p>` : '';
  const cards = items.map((h) => renderHighlightCard(h, locale)).join('');
  return `<section class="highlights"><h2>${escapeHtml(heading)}</h2>${introEl}<ul class="highlights-track" role="list">${cards}</ul></section>`;
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

/**
 * Date-range separators, chosen by locale: a wave dash for Japanese
 * (`2020 〜 2024`, the convention on the canonical site) and a spaced en-dash
 * for everything else (`2020 – 2024`, the international convention and the CV /
 * `dateRange` default). Static literals, never user data.
 */
const DATE_SEPARATOR_JA = ' 〜 ';
const DATE_SEPARATOR_DEFAULT = ' – ';

/** Render a complete static HTML document for one locale-resolved profile. */
export function renderProfileHtml(input: RenderInput): string {
  const d = input.localized;
  const p = d.profile;
  const locale = d.resolvedLocale;
  const description = p.tagline ?? p.bio ?? '';

  // Section headings + chrome labels, merged in precedence order: the built-in
  // pack for the resolved locale, then the owner's `settings.sectionLabels`
  // (data-driven overrides), then the caller's per-request `labels` (code seam).
  // `omit` suppresses a section's visible rendering (never its JSON-LD, generated
  // from the full document below).
  const L: SectionLabels = {
    ...pickLabelPack(locale),
    ...(d.settings.sectionLabels ?? {}),
    ...input.labels,
  };
  const omit = new Set<SectionKey>(input.omitSections ?? []);
  const keep = (key: SectionKey, html: string): string => (omit.has(key) ? '' : html);

  // Every date range on the page uses the locale-appropriate separator (wave
  // dash for Japanese, en-dash otherwise) and the resolved locale; this closure
  // keeps the per-section maps below terse.
  const dateSeparator = isJapaneseLocale(locale) ? DATE_SEPARATOR_JA : DATE_SEPARATOR_DEFAULT;
  const dates = (
    start: string | undefined,
    opts: { end?: string | null; isCurrent?: boolean },
  ): string => dateRange(start, { ...opts, locale, separator: dateSeparator });

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(p.displayName)}</title>`,
    description
      ? `<meta name="description" content="${escapeHtml(description.slice(0, 300))}">`
      : '',
    // Data-derived Open Graph tags (the renderer owns these; asset tags like
    // og:image and PWA/theme-color are the host's, via the `head` slot).
    '<meta property="og:type" content="profile">',
    `<meta property="og:title" content="${escapeHtml(p.displayName)}">`,
    description
      ? `<meta property="og:description" content="${escapeHtml(description.slice(0, 300))}">`
      : '',
    input.canonicalUrl
      ? `<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}">`
      : '',
    input.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">` : '',
    ...input.alternates.map(
      (a) =>
        `<link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}">`,
    ),
    input.jsonLd ? renderJsonLdScript(d) : '',
    input.contact ? '<link rel="stylesheet" href="/contact-widget.css">' : '',
    `<style>${buildTokenCss(d.settings.appearance)}\n${CSS}</style>`,
    // First-party <head> slot (raw, unescaped): OG image tags, manifest link, etc.
    input.slots?.head ?? '',
  ]
    .filter(Boolean)
    .join('\n  ');

  // Rendered HTML for every content section, keyed by its canonical
  // {@link SectionKey}. Assembled in the default order below.
  const sections: Record<SectionKey, string> = {
    about: renderBio(p.bio, L.about),
    careers: entryList(
      L.careers,
      d.careers.map((c) => ({
        heading: c.role,
        sub: c.organization,
        subUrl: c.url,
        dates: dates(c.startDate, { end: c.endDate, isCurrent: c.isCurrent }),
        body: c.description,
        current: c.isCurrent,
      })),
      'timeline',
    ),
    projects: entryList(
      L.projects,
      d.projects.map((x) => ({
        heading: x.title,
        url: x.url,
        role: x.role,
        dates: dates(x.startDate, { end: x.endDate }),
        body: x.description,
        tags: x.tags,
        highlighted: x.highlighted,
      })),
      'cards',
    ),
    volunteering: renderVolunteering(d.volunteering, L.volunteering),
    skills: renderSkills(d.skills, d.settings.skillCategories, L.skills),
    activity: renderActivity(input.activitySnapshot, L.activity),
    education: entryList(
      L.education,
      d.education.map((e) => {
        const degree = nonEmpty([e.degree, e.fieldOfStudy], ', ');
        return {
          heading: degree ?? e.institution,
          sub: degree ? e.institution : undefined,
          dates: dates(e.startDate, { end: e.endDate, isCurrent: e.isCurrent }),
          body: e.description,
          url: e.url,
        };
      }),
    ),
    certifications: entryList(
      L.certifications,
      d.certifications.map((c) => ({
        heading: c.title,
        sub: c.issuingOrganization,
        dates: dates(c.issueDate, { end: c.expirationDate }),
        url: c.url,
      })),
    ),
    publications: entryList(
      L.publications,
      d.publications.map((x) => ({
        heading: x.title,
        sub: nonEmpty([x.publisher, x.coAuthors?.join(', ')], ' · '),
        dates: dates(x.date, {}),
        body: x.description,
        url: x.url ?? (x.doi ? `https://doi.org/${x.doi}` : undefined),
      })),
    ),
    honors: entryList(
      L.honors,
      d.honors.map((x) => ({
        heading: x.title,
        sub: x.issuer,
        dates: dates(x.date, {}),
        body: x.description,
        url: x.url,
      })),
    ),
    memberships: entryList(
      L.memberships,
      d.memberships.map((x) => ({
        heading: x.role ?? x.organization,
        sub: x.role ? x.organization : undefined,
        dates: dates(x.startDate, { end: x.endDate, isCurrent: x.isCurrent }),
        body: x.description,
        url: x.url,
      })),
    ),
    courses: entryList(
      L.courses,
      d.courses.map((x) => ({
        heading: x.title,
        sub: x.provider,
        dates: dates(x.completionDate, {}),
        body: x.description,
        url: x.certificateUrl,
      })),
    ),
    patents: entryList(
      L.patents,
      d.patents.map((x) => ({
        heading: x.title,
        sub: nonEmpty([x.patentNumber, x.office, x.status, x.coInventors?.join(', ')], ' · '),
        dates: dates(x.filingDate ?? x.grantDate, {}),
        body: x.description,
        url: x.url,
      })),
    ),
    testScores: entryList(
      L.testScores,
      d.testScores.map((x) => ({
        heading: `${x.title}: ${x.score}`,
        dates: dates(x.date, {}),
        body: x.description,
        url: x.url,
      })),
    ),
    languages: renderLanguages(d.languages, L.languages),
    recommendations: renderRecommendations(d.recommendations, L.recommendations),
    highlights: renderHighlights(d.highlights, L.highlights, d.settings.highlightsIntro, locale),
    contact: renderContact(d.contact, L.contact),
  };

  const localeNavHtml =
    input.localeNav.length > 1 ? renderLocaleNav(input.localeNav, L.localeNav) : '';

  // Resolve the section order: the owner's `settings.sectionOrder` first (valid,
  // de-duplicated keys only), then every remaining section in the default order,
  // so a partial list reorders what it names and leaves the rest untouched.
  const seenKeys = new Set<SectionKey>();
  const orderedKeys: SectionKey[] = [];
  for (const key of d.settings.sectionOrder ?? []) {
    if (SECTION_KEYS.includes(key) && !seenKeys.has(key)) {
      seenKeys.add(key);
      orderedKeys.push(key);
    }
  }
  for (const key of SECTION_KEYS) {
    if (!seenKeys.has(key)) orderedKeys.push(key);
  }

  const body = [
    renderHeader(p, localeNavHtml),
    // Featured links at the top; the remaining links are a fixed bottom section.
    renderFeaturedLinks(d.links, L.featuredLinks),
    ...orderedKeys.map((key) => keep(key, sections[key])),
    renderOtherLinks(d.links, L.otherLinks),
    input.slots?.mainEnd ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  // Footer (default on): a copyright/license line plus a "Powered by Takuhon"
  // credit unless the owner opted out (`showPoweredBy: false`).
  const spdx = d.meta?.contentLicense?.spdxId;
  // Defense in depth: `year` is typed `number`, but an untyped/JS caller could
  // pass anything; only a finite number reaches the raw-interpolated line.
  const year =
    typeof input.year === 'number' && Number.isFinite(input.year) ? input.year : undefined;
  const licenseText =
    year !== undefined
      ? `© ${year} ${escapeHtml(p.displayName)} — ${escapeHtml(spdx ?? '')}`
      : `© ${escapeHtml(p.displayName)} — ${escapeHtml(spdx ?? '')}`;
  const licenseLine = spdx ? `<p class="license">${licenseText}</p>` : '';
  const poweredByLine =
    d.settings.showPoweredBy !== false
      ? `<p class="powered-by">${escapeHtml(L.poweredBy)} <a href="https://takuhon.org/" rel="noopener">Takuhon</a></p>`
      : '';
  const footerInner = `${licenseLine}${poweredByLine}`;
  const footer = footerInner ? `<footer class="powered">${footerInner}</footer>` : '';

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
