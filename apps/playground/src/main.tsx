import { applyPublicPrivacyFilter } from '@takuhon/api';
import { resolveLocale, validate, type LocaleTag, type Takuhon } from '@takuhon/core';
import { LocaleSwitcher, TakuhonHead, TakuhonProfile } from '@takuhon/ui';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import exampleJson from '../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import './index.css';

const COOKIE_NAME = 'takuhon_locale';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const QUERY_PARAM = 'lang';

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`);
  const match = re.exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

function persistLocaleCookie(locale: LocaleTag): void {
  const value = encodeURIComponent(locale);
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function syncLocaleQuery(locale: LocaleTag): void {
  const url = new URL(window.location.href);
  url.searchParams.set(QUERY_PARAM, locale);
  window.history.replaceState({}, '', url);
}

function resolveInitialLocale(takuhon: Takuhon): LocaleTag {
  const available = takuhon.settings.availableLocales;
  const query = new URLSearchParams(window.location.search).get(QUERY_PARAM);
  if (query && available.includes(query)) return query;
  const cookie = readCookie(COOKIE_NAME);
  if (cookie && available.includes(cookie)) return cookie;
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined;
  if (nav && available.includes(nav)) return nav;
  const navBase = nav?.split('-')[0];
  if (navBase && available.includes(navBase)) return navBase;
  return takuhon.settings.defaultLocale;
}

function App({ takuhon }: { takuhon: Takuhon }): React.JSX.Element {
  const [locale, setLocale] = useState<LocaleTag>(() => resolveInitialLocale(takuhon));
  const localized = useMemo(() => resolveLocale(takuhon, locale), [takuhon, locale]);

  useEffect(() => {
    document.documentElement.lang = localized.resolvedLocale;
  }, [localized.resolvedLocale]);

  const handleSelect = (next: LocaleTag): void => {
    setLocale(next);
    persistLocaleCookie(next);
    syncLocaleQuery(next);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <TakuhonHead data={localized} />
      <LocaleSwitcher
        availableLocales={takuhon.settings.availableLocales}
        currentLocale={locale}
        onSelect={handleSelect}
      />
      <main id="main-content">
        <TakuhonProfile data={localized} />
      </main>
    </>
  );
}

const result = validate(exampleJson);
if (!result.ok) {
  throw new Error(
    `Example takuhon.json failed validation: ${result.errors
      .map((e) => `${e.pointer} ${e.message}`)
      .join('; ')}`,
  );
}

// The playground stands in for the public surface (`/`, `/api/profile`,
// `/api/jsonld`), so strip privacy-marked fields before render to match
// what real public readers would see. Admin paths would skip this filter.
const publicTakuhon = applyPublicPrivacyFilter(result.data);

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App takuhon={publicTakuhon} />
  </StrictMode>,
);
