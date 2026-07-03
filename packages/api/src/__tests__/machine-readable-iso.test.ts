/// <reference types="vite/client" />
import type { Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { createPublicApp } from '../public-app.js';
import { FakeStorage } from '../test-utils/fake-storage.js';

/**
 * Locale-aware date rendering localizes the human-facing surfaces only. The
 * public machine-readable endpoints — `/api/profile`, `/api/jsonld` (including
 * the free-text `award` strings), and the canonical `/takuhon.json` — must emit
 * raw ISO regardless of the requested locale, so consuming machines decide
 * their own presentation. These tests fetch each endpoint in both `en` and `ja`
 * and assert the dates are identical, locale-independent ISO.
 */

/** A controlled profile with known dates in each machine-readable shape. */
function fixture(): Takuhon {
  return {
    schemaVersion: '0.7.0',
    profile: { displayName: { en: 'Pat', ja: 'パット' } },
    links: [],
    careers: [
      {
        id: 'job',
        organization: { en: 'Acme', ja: 'アクメ' },
        role: { en: 'Engineer', ja: 'エンジニア' },
        startDate: '2020-01',
        endDate: '2022-06',
        isCurrent: false,
      },
    ],
    projects: [],
    skills: [],
    education: [
      {
        id: 'e1',
        institution: { en: 'State University', ja: '州立大学' },
        degree: { en: 'BSc' },
        startDate: '2014-04',
        endDate: '2018-03',
        isCurrent: false,
      },
    ],
    certifications: [],
    honors: [
      {
        id: 'h1',
        title: { en: 'Best Paper Award', ja: '最優秀論文賞' },
        issuer: { en: 'ACM', ja: 'ACM' },
        date: '2021-03',
      },
    ],
    memberships: [],
    volunteering: [],
    languages: [],
    courses: [],
    patents: [],
    testScores: [],
    publications: [],
    recommendations: [],
    highlights: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  };
}

function makeApp(): ReturnType<typeof createPublicApp> {
  return createPublicApp({ storage: new FakeStorage(), fallback: () => fixture() });
}

function get(app: ReturnType<typeof createPublicApp>, path: string): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://app.example${path}`)));
}

const ISO_YEAR_MONTH = /^\d{4}-\d{2}$/;

describe('public machine-readable endpoints keep raw ISO dates', () => {
  it('GET /api/profile returns locale-independent ISO dates', async () => {
    const app = makeApp();
    // /api/profile wraps the locale-resolved document under `data`.
    const en = ((await (await get(app, '/api/profile')).json()) as Record<string, any>).data;
    const ja = ((await (await get(app, '/ja/api/profile')).json()) as Record<string, any>).data;

    expect(en.careers[0].startDate).toBe('2020-01');
    expect(en.careers[0].endDate).toBe('2022-06');
    expect(en.careers[0].startDate).toMatch(ISO_YEAR_MONTH);
    // Dates are locale-independent: the ja response carries byte-identical ISO.
    expect(ja.careers[0].startDate).toBe('2020-01');
    expect(ja.careers[0].endDate).toBe('2022-06');
  });

  it('GET /api/jsonld keeps raw ISO in date fields and award strings', async () => {
    const app = makeApp();
    // /api/jsonld returns a single-element array `[ProfilePage]`; the dated
    // Person sub-entities live under `ProfilePage.mainEntity`.
    const en = ((await (await get(app, '/api/jsonld')).json()) as Record<string, any>[])[0]!
      .mainEntity;
    const ja = ((await (await get(app, '/ja/api/jsonld')).json()) as Record<string, any>[])[0]!
      .mainEntity;

    // The award free text is the one place a localized date could slip into a
    // machine field — pin the exact ISO form in both locales.
    expect(en.award).toEqual(['Best Paper Award (ACM, 2021-03)']);
    expect(ja.award).toEqual(['最優秀論文賞 (ACM, 2021-03)']);
    for (const award of [...en.award, ...ja.award] as string[]) {
      expect(award).toMatch(/, \d{4}-\d{2}\)$/); // ends with a raw ISO YearMonth
      expect(award).not.toMatch(/\d{4}年/); // no ja-formatted leak
    }

    // A structured date field stays ISO and identical across locales.
    expect(en.alumniOf[0].startDate).toBe('2014-04');
    expect(ja.alumniOf[0].startDate).toBe('2014-04');
  });

  it('GET /takuhon.json keeps raw ISO dates', async () => {
    const app = makeApp();
    const body = (await (await get(app, '/takuhon.json')).json()) as Record<string, any>;
    expect(body.careers[0].startDate).toBe('2020-01');
    expect(body.careers[0].endDate).toBe('2022-06');
  });
});

describe('localization boundary: formatDate / getPresentLabel stay in the choke point', () => {
  // The only place `@takuhon/api` may localize a date is the `html-helpers`
  // choke point (`dateRange`/`timeTag`/`presentLabel`). No other api module —
  // including the public-app data routes — may reference the localizers, so a
  // leak into `/api/profile` / `/api/jsonld` / `/takuhon.json` is impossible.
  // Vite's `import.meta.glob` reads the sources as raw text (the package has no
  // Node type definitions, so an `fs` walk is unavailable here).
  const sources: Record<string, string> = import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const ALLOWED = new Set(['../html/html-helpers.ts']);

  it('no api module outside html-helpers references the localizers', () => {
    const checked = Object.entries(sources).filter(
      // `./…` keys are this `__tests__` directory itself (the glob runs from
      // here); skip them along with the allowed choke-point helper.
      ([path]) => !path.startsWith('./') && !ALLOWED.has(path),
    );
    expect(checked.length).toBeGreaterThan(5); // the glob actually found modules
    for (const [path, src] of checked) {
      expect(src, `${path} must not localize dates`).not.toMatch(
        /\b(formatDate|getPresentLabel)\b/,
      );
    }
  });
});
