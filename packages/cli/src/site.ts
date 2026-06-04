/**
 * Shared static-site generation for `takuhon build` and `takuhon dev`.
 *
 * {@link generateSite} turns one validated, normalized, privacy-filtered profile
 * into the full set of pages the static surface exposes: one per available
 * locale. `build` writes each page's {@link SitePage.file} to disk; `dev` serves
 * each page's {@link SitePage.route} from memory. Keeping the per-locale loop,
 * the locale switcher links, and the canonical/hreflang logic here means both
 * commands share a single source of truth for the site's structure — the only
 * difference between them is disk write vs. in-memory serve.
 *
 * This reuses `@takuhon/core` only (validate/normalize/resolve happen upstream;
 * this module just resolves each locale and renders), so it stays bundler-free
 * and unit-testable as a pure function.
 */

import type { NormalizedTakuhon } from '@takuhon/core';
import { resolveLocale } from '@takuhon/core';

import { renderProfileHtml, type Alternate, type LocaleLink } from './build-html.js';

/** One generated page: a serve route, a relative output file, and its HTML. */
export interface SitePage {
  /** URL path used by `dev` (default locale at `/`, others at `/<locale>/`). */
  readonly route: string;
  /** Output path used by `build`, relative to the output dir. */
  readonly file: string;
  /** Rendered HTML document. */
  readonly html: string;
}

export interface GenerateOptions {
  /**
   * Site origin (e.g. `https://me.example`). When set, pages carry absolute
   * canonical + hreflang links; when absent those are omitted (the human locale
   * switcher is always relative either way).
   */
  readonly baseUrl?: string;
}

/**
 * Generate every page for a profile: the default locale first, then the rest,
 * de-duplicated. Schema.org JSON-LD is emitted unless `settings.enableJsonLd`
 * is explicitly `false`.
 */
export function generateSite(
  profile: NormalizedTakuhon,
  options: GenerateOptions = {},
): SitePage[] {
  const { baseUrl } = options;
  const defaultLocale = profile.settings.defaultLocale;
  // Default locale first, then the rest, de-duplicated.
  const locales = [...new Set([defaultLocale, ...profile.settings.availableLocales])];
  const jsonLd = profile.settings.enableJsonLd !== false;

  return locales.map((locale) => {
    const localized = resolveLocale(profile, locale);
    const isDefault = locale === defaultLocale;

    const localeNav: LocaleLink[] = locales.map((to) => ({
      locale: to,
      href: localeHref(locale, to, defaultLocale),
      current: to === locale,
    }));
    const canonicalUrl = baseUrl ? absoluteUrl(baseUrl, locale, defaultLocale) : undefined;
    const alternates: Alternate[] = baseUrl ? buildAlternates(baseUrl, locales, defaultLocale) : [];

    const html = renderProfileHtml({ localized, canonicalUrl, alternates, localeNav, jsonLd });
    return {
      route: isDefault ? '/' : `/${locale}/`,
      file: isDefault ? 'index.html' : `${locale}/index.html`,
      html,
    };
  });
}

/** Absolute URL for a locale's page (default locale lives at the site root). */
function absoluteUrl(baseUrl: string, locale: string, defaultLocale: string): string {
  return locale === defaultLocale ? `${baseUrl}/` : `${baseUrl}/${locale}/`;
}

/** hreflang alternates for every locale plus an `x-default` pointing at the default. */
function buildAlternates(
  baseUrl: string,
  locales: readonly string[],
  defaultLocale: string,
): Alternate[] {
  const alternates: Alternate[] = locales.map((locale) => ({
    hreflang: locale,
    href: absoluteUrl(baseUrl, locale, defaultLocale),
  }));
  alternates.push({
    hreflang: 'x-default',
    href: absoluteUrl(baseUrl, defaultLocale, defaultLocale),
  });
  return alternates;
}

/**
 * Depth-correct relative link from the page for `from` to the page for `to`,
 * for the human locale switcher. Always relative (independent of `baseUrl`)
 * so the switcher works regardless of where the site is hosted: the default
 * locale lives at the root, every other locale one directory deep.
 */
function localeHref(from: string, to: string, defaultLocale: string): string {
  const fromRoot = from === defaultLocale;
  const toRoot = to === defaultLocale;
  if (fromRoot) return toRoot ? './' : `${to}/`;
  return toRoot ? '../' : `../${to}/`;
}
