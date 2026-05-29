import { generateJsonLd, type LocalizedTakuhon } from '@takuhon/core';
import { useEffect } from 'react';

export interface TakuhonHeadProps {
  data: LocalizedTakuhon;
  siteUrl?: string;
  pageUrl?: string;
}

function primarySubtag(tag: string): string {
  const dash = tag.indexOf('-');
  return (dash === -1 ? tag : tag.slice(0, dash)).toLowerCase();
}

/**
 * Whether a leading path segment should be treated as a locale prefix.
 * Mirrors the server resolver's `matchAvailable` so the two surfaces agree:
 * an exact (case-insensitive) match, or a primary-subtag match so a
 * regional segment like `en-US` is recognized against an available `en`.
 */
function isLocaleSegment(segment: string, availableLocales: readonly string[]): boolean {
  const lower = segment.toLowerCase();
  const primary = primarySubtag(segment);
  return availableLocales.some(
    (loc) => loc.toLowerCase() === lower || primarySubtag(loc) === primary,
  );
}

/**
 * Remove a leading `/{locale}` path segment (when it is recognizable as a
 * locale per {@link isLocaleSegment}) and any legacy `?lang=` query,
 * yielding a locale-neutral base URL. This prevents stacking (`/ja/en/...`,
 * `/en/en-US/...`) when the current page is already locale-prefixed: the
 * existing segment is stripped before {@link withLocalePrefix} re-adds the
 * target locale.
 */
function localeNeutralUrl(pageUrl: string, availableLocales: readonly string[]): string {
  try {
    const url = new URL(pageUrl);
    url.searchParams.delete('lang');
    const segments = url.pathname.split('/');
    const first = segments[1];
    if (first !== undefined && first !== '' && isLocaleSegment(first, availableLocales)) {
      segments.splice(1, 1);
      url.pathname = segments.join('/') || '/';
    }
    return url.toString();
  } catch {
    return pageUrl;
  }
}

/**
 * Prepend a `/{locale}` path segment to a locale-neutral URL, producing
 * the canonical path form (`https://site/profile` → `https://site/ja/profile`,
 * `https://site/` → `https://site/ja/`). The path form is the advertised
 * URL; `?lang=` remains a resolution input but is never emitted here.
 *
 * This is deployment-agnostic: it inserts a locale segment into whatever
 * page URL `TakuhonHead` is given, regardless of how that page is routed.
 * The built-in `@takuhon/api` public app resolves the path prefix for its
 * own surfaces (`/`, `/api/profile`, `/api/jsonld`); the canonical
 * deployment serves the rendered profile at the site root, so its `/ja/`
 * form resolves out of the box. A deployment that serves the HTML profile
 * at another path is responsible for routing that locale-prefixed page.
 */
function withLocalePrefix(neutralUrl: string, locale: string): string {
  try {
    const url = new URL(neutralUrl);
    url.pathname = url.pathname === '/' ? `/${locale}/` : `/${locale}${url.pathname}`;
    return url.toString();
  } catch {
    return neutralUrl;
  }
}

function absolutizeUrl(url: string | undefined, base: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!base) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function detectSiteUrl(explicit: string | undefined): string | undefined {
  if (explicit) return explicit;
  if (typeof window !== 'undefined') return window.location.origin;
  return undefined;
}

function detectPageUrl(
  explicit: string | undefined,
  siteUrl: string | undefined,
): string | undefined {
  if (explicit) return explicit;
  if (typeof window !== 'undefined') {
    return window.location.origin + window.location.pathname;
  }
  return siteUrl;
}

export function TakuhonHead({ data, siteUrl, pageUrl }: TakuhonHeadProps): React.JSX.Element {
  const resolvedSiteUrl = detectSiteUrl(siteUrl);
  const resolvedPageUrl = detectPageUrl(pageUrl, resolvedSiteUrl);

  const { profile, settings, resolvedLocale } = data;
  const description = profile.bio ?? profile.tagline;
  const ogDescription = profile.tagline ?? profile.bio;
  const ogImage = absolutizeUrl(profile.avatar?.url, resolvedSiteUrl);
  const twitterCard = profile.avatar ? 'summary_large_image' : 'summary';

  // Locale-neutral base, so canonical/alternates emit one clean path form
  // per locale (`/ja/...`) and never stack when the current page is
  // already locale-prefixed.
  const neutralPageUrl = resolvedPageUrl
    ? localeNeutralUrl(resolvedPageUrl, settings.availableLocales)
    : undefined;

  const canonical = neutralPageUrl ? withLocalePrefix(neutralPageUrl, resolvedLocale) : undefined;
  const alternates = neutralPageUrl
    ? settings.availableLocales.map((loc) => ({
        locale: loc,
        href: withLocalePrefix(neutralPageUrl, loc),
      }))
    : [];
  const xDefaultHref = neutralPageUrl
    ? withLocalePrefix(neutralPageUrl, settings.defaultLocale)
    : undefined;

  const ogAlternates = settings.availableLocales.filter((loc) => loc !== resolvedLocale);

  const emitJsonLd = settings.enableJsonLd !== false;
  const jsonLdPayload = emitJsonLd ? JSON.stringify(generateJsonLd(data)) : null;

  useEffect(() => {
    if (!jsonLdPayload) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = jsonLdPayload;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [jsonLdPayload]);

  return (
    <>
      <title>{profile.displayName}</title>
      {description ? <meta name="description" content={description} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}

      <meta property="og:title" content={profile.displayName} />
      {ogDescription ? <meta property="og:description" content={ogDescription} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}
      <meta property="og:type" content="profile" />
      <meta property="og:locale" content={resolvedLocale} />
      {ogAlternates.map((loc) => (
        <meta key={loc} property="og:locale:alternate" content={loc} />
      ))}

      <meta name="twitter:card" content={twitterCard} />

      {alternates.map(({ locale, href }) => (
        <link key={locale} rel="alternate" hrefLang={locale} href={href} />
      ))}
      {xDefaultHref ? <link rel="alternate" hrefLang="x-default" href={xDefaultHref} /> : null}
    </>
  );
}
