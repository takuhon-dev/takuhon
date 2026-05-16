import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import { resolveLocale } from '../index.js';
import type { Ownport } from '../index.js';

function cloneExample(): Ownport {
  return JSON.parse(JSON.stringify(exampleJson)) as Ownport;
}

describe('resolveLocale() argument-driven chain', () => {
  it('uses the locale argument when it matches a populated entry', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to the fallbackLocale argument when locale has no match', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'fr', 'en');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('ignores invalid locale tags and continues the chain', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'zz_invalid', 'en');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });
});

describe('resolveLocale() settings-driven fallback', () => {
  it('falls through to settings.defaultLocale when arguments are absent', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'ja';
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to settings.fallbackLocale when defaultLocale has no match', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'fr';
    data.settings.fallbackLocale = 'ja';
    data.settings.availableLocales = ['en', 'ja'];
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('falls through to availableLocales[0] as the final settings step', () => {
    const data = cloneExample();
    data.settings.defaultLocale = 'fr';
    data.settings.fallbackLocale = 'de';
    data.settings.availableLocales = ['ja', 'en'];
    const resolved = resolveLocale(data);
    expect(resolved.profile.displayName).toBe('パット・リベラ');
    expect(resolved.resolvedLocale).toBe('ja');
  });
});

describe('resolveLocale() regional and case rules', () => {
  it('expands regional tags: en-US falls back to en when en-US is absent', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'en-US');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('compares locale tags case-insensitively (EN-us matches en)', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'EN-us');
    expect(resolved.profile.displayName).toBe('Pat Rivera');
  });
});

describe('resolveLocale() per-field fallback', () => {
  it('resolves each localized field independently when entries are sparse', () => {
    const data = cloneExample();
    data.profile.displayName = { ja: 'パット' };
    data.profile.tagline = { en: 'Engineer' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.displayName).toBe('パット');
    expect(resolved.profile.tagline).toBe('Engineer');
    expect(resolved.resolvedLocale).toBe('ja');
  });

  it('skips empty-string entries and continues to the next candidate', () => {
    const data = cloneExample();
    data.profile.displayName = { ja: '   ', en: 'Pat' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.displayName).toBe('Pat');
    expect(resolved.resolvedLocale).toBe('en');
  });

  it('drops optional localized fields entirely when no candidate matches', () => {
    const data = cloneExample();
    data.profile.tagline = { fr: 'Ingénieur' };
    const resolved = resolveLocale(data, 'ja', 'en');
    expect(resolved.profile.tagline).toBeUndefined();
  });
});

describe('resolveLocale() non-localized passthrough', () => {
  it('passes skills, contact, settings, and meta through unchanged', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    expect(resolved.skills).toEqual(data.skills);
    expect(resolved.contact).toEqual(data.contact);
    expect(resolved.settings).toEqual(data.settings);
    expect(resolved.meta).toEqual(data.meta);
  });

  it('preserves Career endDate:null and Project tags arrays verbatim', () => {
    const data = cloneExample();
    const resolved = resolveLocale(data, 'ja');
    const current = resolved.careers.find((c) => c.isCurrent === true);
    expect(current?.endDate).toBeNull();
    const firstProject = resolved.projects[0];
    expect(firstProject?.tags).toBeDefined();
    expect(Array.isArray(firstProject?.tags)).toBe(true);
  });
});

describe('resolveLocale() does not mutate input', () => {
  it('leaves the original document untouched after resolution', () => {
    const data = cloneExample();
    const snapshot = JSON.stringify(data);
    resolveLocale(data, 'ja');
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});
