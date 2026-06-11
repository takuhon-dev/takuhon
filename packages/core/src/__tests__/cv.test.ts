import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import {
  applyPublicPrivacyFilter,
  deriveCv,
  normalize,
  resolveLocale,
  validate,
} from '../index.js';
import type { CvSectionKind, LocalizedTakuhon } from '../index.js';

/** Run the same upstream pipeline the public render path uses. */
function localized(locale = 'en'): LocalizedTakuhon {
  const result = validate(exampleJson);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return resolveLocale(applyPublicPrivacyFilter(normalize(result.data)), locale);
}

/** A minimal localized document with empty sections, for emptiness behavior. */
function emptyLocalized(): LocalizedTakuhon {
  const result = validate({
    schemaVersion: '0.5.0',
    profile: { displayName: { en: 'Solo Dev' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  });
  if (!result.ok) throw new Error('minimal fixture invalid');
  return resolveLocale(normalize(result.data), 'en');
}

describe('deriveCv()', () => {
  it('builds the header from profile and contact', () => {
    const cv = deriveCv(localized());
    expect(cv.resolvedLocale).toBe('en');
    expect(cv.header.displayName).toBe('Pat Rivera');
    expect(cv.header.tagline).toBeTruthy();
  });

  it('emits non-empty sections in the fixed résumé order', () => {
    const kinds = deriveCv(localized()).sections.map((s) => s.kind);
    const ORDER: CvSectionKind[] = [
      'experience',
      'education',
      'skills',
      'certifications',
      'publications',
      'honors',
      'courses',
      'patents',
      'languages',
      'volunteering',
      'memberships',
    ];
    // The emitted kinds are a subsequence of the canonical order (order
    // preserved, gaps allowed where a section was empty).
    let cursor = -1;
    for (const kind of kinds) {
      const next = ORDER.indexOf(kind, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    // The fixture populates experience and education at least.
    expect(kinds).toContain('experience');
    expect(kinds).toContain('education');
  });

  it('omits web-page-only sections (links, recommendations, activity, test scores)', () => {
    const kinds = deriveCv(localized()).sections.map((s) => s.kind) as string[];
    expect(kinds).not.toContain('links');
    expect(kinds).not.toContain('recommendations');
    expect(kinds).not.toContain('testScores');
    expect(kinds).not.toContain('activity');
  });

  it('drops empty sections entirely', () => {
    const cv = deriveCv(emptyLocalized());
    expect(cv.sections).toEqual([]);
    expect(cv.header.displayName).toBe('Solo Dev');
    expect(cv.header.email).toBeUndefined();
  });

  it('preserves entry order within a section (no re-sorting)', () => {
    const loc = localized();
    const cv = deriveCv(loc);
    const experience = cv.sections.find((s) => s.kind === 'experience');
    expect(experience?.entries.map((e) => ('id' in e ? e.id : ''))).toEqual(
      loc.careers.map((c) => c.id),
    );
  });

  it('honors the privacy filter applied upstream (email hidden by default)', () => {
    // The example hides email by default, so the projected header omits it.
    expect(deriveCv(localized()).header.email).toBeUndefined();
  });

  it('carries email through when the owner exposed it', () => {
    const result = validate(exampleJson);
    if (!result.ok) throw new Error('fixture invalid');
    const withEmail = JSON.parse(JSON.stringify(result.data));
    withEmail.contact = { email: 'pat@example.com', showEmail: true };
    const loc = resolveLocale(applyPublicPrivacyFilter(normalize(withEmail)), 'en');
    expect(deriveCv(loc).header.email).toBe('pat@example.com');
  });

  it('resolves localized content (ja)', () => {
    const cv = deriveCv(localized('ja'));
    expect(cv.resolvedLocale).toBe('ja');
    expect(cv.header.displayName).toBe('パット・リベラ');
  });

  it('is deterministic: same input yields a deep-equal document', () => {
    expect(deriveCv(localized())).toEqual(deriveCv(localized()));
  });
});
