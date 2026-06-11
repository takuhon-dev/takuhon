import { applyPublicPrivacyFilter } from '@takuhon/api';
import {
  resolveLocale,
  validate,
  type ActivitySnapshot,
  type LocaleTag,
  type Takuhon,
} from '@takuhon/core';
import { LocaleSwitcher, TakuhonHead, TakuhonProfile } from '@takuhon/ui';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import exampleJson from '../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import './index.css';

const COOKIE_NAME = 'takuhon_locale';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const QUERY_PARAM = 'lang';

/**
 * Demo activity snapshot. In a real deployment this is the sibling document a
 * sync step maintains (`GET /api/activity` / `activity.json`); the playground
 * inlines a static sample so the section renders without any sync having run.
 */
const DEMO_ACTIVITY: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T03:00:00.000Z',
  languages: [
    { name: 'TypeScript', bytes: 1520000, percent: 58.4 },
    { name: 'Rust', bytes: 410000, percent: 15.7 },
    { name: 'Python', bytes: 280000, percent: 10.8 },
    { name: 'CSS', bytes: 180000, percent: 6.9 },
    { name: 'Go', bytes: 120000, percent: 4.6 },
    { name: 'Shell', bytes: 90000, percent: 3.6 },
  ],
  contributions: {
    total: 1834,
    // A deterministic 53-week wave pattern, so the heatmap has visible texture.
    days: Array.from({ length: 371 }, (_, i) => ({
      date: `2025-W${String(Math.floor(i / 7))}-${String(i % 7)}`,
      count: (i * 7) % 11 === 0 ? 0 : (i * 13) % 9,
    })),
  },
  codingTime: { totalSeconds: 451800, hours: 125, minutes: 30, seconds: 0 },
  rank: { tier: 'A', score: 68 },
};

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

// Read a leading `/{locale}` path segment when it matches an available
// locale. This recognizes the lowercase path form the playground itself
// writes (see `syncLocalePath`); unlike the server's `matchAvailable`, it
// does not do case-insensitive or primary-subtag matching — sufficient for
// a demo that only ever generates exact-case locale segments.
function pathLocale(available: readonly string[]): LocaleTag | undefined {
  const seg = window.location.pathname.split('/')[1];
  if (seg && available.includes(seg)) return seg;
  return undefined;
}

// Rewrite the URL to the path form `/{locale}/...`, replacing an existing
// leading locale segment or inserting one, and dropping any legacy
// `?lang=`. Relies on the Vite dev server's SPA fallback to serve `/ja/`
// from index.html on a hard reload; this is a demo surface, not the
// product's own routing.
function syncLocalePath(locale: LocaleTag, available: readonly string[]): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(QUERY_PARAM);
  const segments = url.pathname.split('/');
  const first = segments[1];
  if (first !== undefined && available.includes(first)) {
    segments[1] = locale;
  } else {
    segments.splice(1, 0, locale);
  }
  url.pathname = segments.join('/') || `/${locale}/`;
  window.history.replaceState({}, '', url);
}

function resolveInitialLocale(takuhon: Takuhon): LocaleTag {
  const available = takuhon.settings.availableLocales;
  const query = new URLSearchParams(window.location.search).get(QUERY_PARAM);
  if (query && available.includes(query)) return query;
  const fromPath = pathLocale(available);
  if (fromPath) return fromPath;
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
    syncLocalePath(next, takuhon.settings.availableLocales);
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
        <TakuhonProfile data={localized} activitySnapshot={DEMO_ACTIVITY} />
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
const filteredTakuhon = applyPublicPrivacyFilter(result.data);

// The example profile does not opt into the activity dashboard; enable it
// here so the demo snapshot passes TakuhonProfile's opt-in gate.
const publicTakuhon: Takuhon = {
  ...filteredTakuhon,
  settings: {
    ...filteredTakuhon.settings,
    activity: { enabled: true, github: { username: 'octocat' } },
  },
};

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App takuhon={publicTakuhon} />
  </StrictMode>,
);
