/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import {
  executeMcpTool,
  generateJsonLd,
  normalize,
  readMcpResource,
  resolveLocale,
} from '../index.js';
import type { LocalizedTakuhon, Takuhon } from '../index.js';

/**
 * Locale-aware date rendering localizes the human-facing HTML / CV surfaces
 * only. The machine-readable surfaces — JSON-LD (including the free-text
 * `award` strings), MCP tools/resources, and the canonical document — must keep
 * raw ISO (`YYYY-MM`) regardless of the requested locale, so consuming machines
 * decide their own presentation. These tests pin that boundary with exact,
 * locale-independent assertions in both `en` and `ja`.
 */

/** A small controlled fixture with one dated entry per machine-readable shape. */
function fixture(): Takuhon {
  return {
    schemaVersion: '0.7.0',
    profile: { displayName: { en: 'Pat', ja: 'パット' } },
    links: [],
    careers: [],
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
    certifications: [
      {
        id: 'c1',
        title: { en: 'Cloud Architect', ja: 'クラウドアーキテクト' },
        issuingOrganization: { en: 'Cloud Org' },
        issueDate: '2019-05',
        expirationDate: '2025-05',
      },
    ],
    publications: [{ id: 'p1', title: { en: 'A Paper', ja: 'ある論文' }, date: '2018-09' }],
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
    recommendations: [],
    highlights: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: {
      contentLicense: { spdxId: 'CC0-1.0' },
      createdAt: '2023-01-15T09:00:00Z',
      updatedAt: '2024-02-20T08:30:00Z',
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function localized(locale: string): LocalizedTakuhon {
  return resolveLocale(normalize(fixture()), locale);
}

// `generateJsonLd` returns a single-element array `[ProfilePage]`; the dated
// sub-entities live on the `Person` inlined as `ProfilePage.mainEntity`.
function profilePage(locale: string): Record<string, unknown> {
  return asRecord(generateJsonLd(localized(locale))[0]);
}

function person(locale: string): Record<string, unknown> {
  return asRecord(profilePage(locale).mainEntity);
}

describe('JSON-LD keeps raw ISO dates (no localization leak)', () => {
  for (const locale of ['en', 'ja']) {
    it(`emits ISO date fields for ${locale}`, () => {
      const ld = profilePage(locale);
      const p = person(locale);

      const alumni = asRecord((p.alumniOf as unknown[])[0]);
      expect(alumni.startDate).toBe('2014-04');
      expect(alumni.endDate).toBe('2018-03');

      const credential = asRecord((p.hasCredential as unknown[])[0]);
      expect(credential.dateCreated).toBe('2019-05');
      expect(credential.expires).toBe('2025-05');

      const publication = (p.subjectOf as unknown[])
        .map(asRecord)
        .find((w) => w['@type'] === 'ScholarlyArticle');
      expect(publication?.datePublished).toBe('2018-09');

      // meta timestamps stay ISO 8601 verbatim (never localized).
      expect(ld.dateCreated).toBe('2023-01-15T09:00:00Z');
      expect(ld.dateModified).toBe('2024-02-20T08:30:00Z');
    });
  }

  // `buildAwards` interpolates the date into a free-text string — the single
  // place a localized date could silently slip into a machine field. Pin it
  // with an exact positive assertion in both locales (the en form omits `年`
  // and a `<time>` tag, so a negative substring check alone would not catch it).
  it('keeps the raw ISO date in the free-text award string (en + ja)', () => {
    expect(person('en').award).toEqual(['Best Paper Award (ACM, 2021-03)']);
    expect(person('ja').award).toEqual(['最優秀論文賞 (ACM, 2021-03)']);

    const en = (person('en').award as string[])[0];
    const ja = (person('ja').award as string[])[0];
    expect(en).toContain('2021-03');
    expect(ja).toContain('2021-03');
    expect(en).not.toMatch(/Mar 2021/); // no en-formatted leak
    expect(ja).not.toMatch(/2021年/); // no ja-formatted leak
  });
});

describe('MCP surfaces keep raw ISO dates', () => {
  for (const locale of ['en', 'ja']) {
    it(`get_profile returns ISO dates for ${locale}`, () => {
      const data = asRecord(executeMcpTool('get_profile', { lang: locale }, fixture()).data);
      const education = asRecord((data.education as unknown[])[0]);
      const honor = asRecord((data.honors as unknown[])[0]);
      expect(education.startDate).toBe('2014-04');
      expect(education.endDate).toBe('2018-03');
      expect(honor.date).toBe('2021-03');
    });
  }

  it('get_jsonld keeps the ISO date in the award string', () => {
    const personOf = (locale: string): Record<string, unknown> => {
      const ld = executeMcpTool('get_jsonld', { lang: locale }, fixture()).data as object[];
      return asRecord(asRecord(ld[0]).mainEntity);
    };
    expect(personOf('en').award).toEqual(['Best Paper Award (ACM, 2021-03)']);
    expect(personOf('ja').award).toEqual(['最優秀論文賞 (ACM, 2021-03)']);
  });

  it('the takuhon://profile resource keeps raw ISO dates', () => {
    const data = asRecord(readMcpResource('takuhon://profile', fixture()).data);
    const education = asRecord((data.education as unknown[])[0]);
    expect(education.startDate).toBe('2014-04');
    expect(education.endDate).toBe('2018-03');
  });
});

describe('localization boundary: formatDate / getPresentLabel stay out of the data layer', () => {
  // `formatDate` and `getPresentLabel` localize dates and labels and belong only
  // to the HTML/CV renderers in `@takuhon/api`. No machine-readable producer in
  // core may reference them — doing so would localize a surface that must stay
  // ISO. The definitions and the index re-export are the only allowed sites.
  // (Vite's `import.meta.glob` reads the sources as raw text — core has no Node
  // type definitions, so an `fs` walk is unavailable here.)
  const sources: Record<string, string> = import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const ALLOWED = new Set(['../date-format.ts', '../ui-labels.ts', '../index.ts']);

  it('no core module outside the helpers references the localizers', () => {
    const checked = Object.entries(sources).filter(
      // `./…` keys are this `__tests__` directory itself (the glob runs from
      // here); skip them along with the generated validator and the allowed
      // definition / re-export sites.
      ([path]) => !path.startsWith('./') && !path.includes('/generated/') && !ALLOWED.has(path),
    );
    expect(checked.length).toBeGreaterThan(5); // the glob actually found modules
    for (const [path, src] of checked) {
      expect(src, `${path} must not localize dates`).not.toMatch(
        /\b(formatDate|getPresentLabel)\b/,
      );
    }
  });
});
