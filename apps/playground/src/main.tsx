import { resolveLocale, validate, type LocaleTag, type Meport } from '@meport/core';
import { LocaleSwitcher, MeportProfile } from '@meport/ui';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import exampleJson from '../../../examples/personal-profile/meport.json' with { type: 'json' };

const COOKIE_NAME = 'meport_locale';
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

function resolveInitialLocale(meport: Meport): LocaleTag {
  const available = meport.settings.availableLocales;
  const query = new URLSearchParams(window.location.search).get(QUERY_PARAM);
  if (query && available.includes(query)) return query;
  const cookie = readCookie(COOKIE_NAME);
  if (cookie && available.includes(cookie)) return cookie;
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined;
  if (nav && available.includes(nav)) return nav;
  const navBase = nav?.split('-')[0];
  if (navBase && available.includes(navBase)) return navBase;
  return meport.settings.defaultLocale;
}

function App({ meport }: { meport: Meport }): React.JSX.Element {
  const [locale, setLocale] = useState<LocaleTag>(() => resolveInitialLocale(meport));
  const localized = useMemo(() => resolveLocale(meport, locale), [meport, locale]);

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
      <LocaleSwitcher
        availableLocales={meport.settings.availableLocales}
        currentLocale={locale}
        onSelect={handleSelect}
      />
      <MeportProfile data={localized} />
    </>
  );
}

const result = validate(exampleJson);
if (!result.ok) {
  throw new Error(
    `Example meport.json failed validation: ${result.errors
      .map((e) => `${e.pointer} ${e.message}`)
      .join('; ')}`,
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App meport={result.data} />
  </StrictMode>,
);
