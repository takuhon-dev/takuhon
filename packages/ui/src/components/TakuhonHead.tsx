import { generateJsonLd, type LocalizedOwnport } from '@takuhon/core';
import { useEffect } from 'react';

export interface OwnportHeadProps {
  data: LocalizedOwnport;
  siteUrl?: string;
  pageUrl?: string;
}

function buildLocaleUrl(pageUrl: string, locale: string): string {
  try {
    const url = new URL(pageUrl);
    url.searchParams.set('lang', locale);
    return url.toString();
  } catch {
    return pageUrl;
  }
}

function stripLangParam(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    url.searchParams.delete('lang');
    return url.toString();
  } catch {
    return pageUrl;
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
  if (explicit) return stripLangParam(explicit);
  if (typeof window !== 'undefined') {
    return window.location.origin + window.location.pathname;
  }
  return siteUrl;
}

export function OwnportHead({ data, siteUrl, pageUrl }: OwnportHeadProps): React.JSX.Element {
  const resolvedSiteUrl = detectSiteUrl(siteUrl);
  const resolvedPageUrl = detectPageUrl(pageUrl, resolvedSiteUrl);

  const { profile, settings, resolvedLocale } = data;
  const description = profile.bio ?? profile.tagline;
  const ogDescription = profile.tagline ?? profile.bio;
  const ogImage = absolutizeUrl(profile.avatar?.url, resolvedSiteUrl);
  const twitterCard = profile.avatar ? 'summary_large_image' : 'summary';

  const canonical = resolvedPageUrl ? buildLocaleUrl(resolvedPageUrl, resolvedLocale) : undefined;
  const alternates = resolvedPageUrl
    ? settings.availableLocales.map((loc) => ({
        locale: loc,
        href: buildLocaleUrl(resolvedPageUrl, loc),
      }))
    : [];
  const xDefaultHref = resolvedPageUrl
    ? buildLocaleUrl(resolvedPageUrl, settings.defaultLocale)
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
