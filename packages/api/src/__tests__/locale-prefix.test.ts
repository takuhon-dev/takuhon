import { describe, expect, it } from 'vitest';

import { LOCALE_AWARE_REMAINDERS, pathLocaleFromUrl, stripLocalePrefix } from '../locale-prefix.js';

describe('stripLocalePrefix', () => {
  it('strips a locale prefix before a locale-aware remainder', () => {
    expect(stripLocalePrefix('/ja/api/profile')).toEqual({ locale: 'ja', path: '/api/profile' });
    expect(stripLocalePrefix('/en/api/jsonld')).toEqual({ locale: 'en', path: '/api/jsonld' });
  });

  it('normalizes a bare /{locale} and /{locale}/ to the landing remainder', () => {
    expect(stripLocalePrefix('/ja')).toEqual({ locale: 'ja', path: '/' });
    expect(stripLocalePrefix('/ja/')).toEqual({ locale: 'ja', path: '/' });
  });

  it('preserves a primary-subtag-with-region locale token', () => {
    expect(stripLocalePrefix('/en-US/api/profile')).toEqual({
      locale: 'en-US',
      path: '/api/profile',
    });
  });

  it('does not strip when the remainder is not locale-aware (the api collision guard)', () => {
    // `api` satisfies the BCP-47 [a-z]{2,3} shape, so only the remainder
    // allowlist prevents `/api/schema` being read as locale `api`.
    expect(stripLocalePrefix('/api/schema')).toEqual({ path: '/api/schema' });
    expect(stripLocalePrefix('/api/profile')).toEqual({ path: '/api/profile' });
  });

  it('does not strip locale-agnostic single-segment paths', () => {
    expect(stripLocalePrefix('/health')).toEqual({ path: '/health' });
    expect(stripLocalePrefix('/takuhon.json')).toEqual({ path: '/takuhon.json' });
  });

  it('does not read the reserved `api` namespace as a locale (bare /api and /api/)', () => {
    // `api` passes the BCP-47 [a-z]{2,3} shape, so without the reserved-
    // segment guard a bare /api (remainder defaults to landing /) would
    // alias the landing page. It must stay unstripped so /api 404s.
    expect(stripLocalePrefix('/api')).toEqual({ path: '/api' });
    expect(stripLocalePrefix('/api/')).toEqual({ path: '/api/' });
  });

  it('does not strip when a shaped prefix precedes an agnostic remainder', () => {
    // /ja/health: remainder /health is not locale-aware → no strip → 404 downstream.
    expect(stripLocalePrefix('/ja/health')).toEqual({ path: '/ja/health' });
    // Admin isolation: /ja/api/admin must not become locale ja + /api/admin.
    expect(stripLocalePrefix('/ja/api/admin')).toEqual({ path: '/ja/api/admin' });
    expect(stripLocalePrefix('/ja/.well-known/takuhon.json')).toEqual({
      path: '/ja/.well-known/takuhon.json',
    });
  });

  it('strips an unknown-but-shaped locale prefix (availableLocales filtered downstream)', () => {
    // `/fr/` on an en/ja document strips structurally; matchAvailable drops
    // `fr` later, falling through to the next tier with a 200 (not a 404).
    expect(stripLocalePrefix('/fr/api/profile')).toEqual({ locale: 'fr', path: '/api/profile' });
  });

  it('does not strip when the first segment is not BCP-47-shaped', () => {
    expect(stripLocalePrefix('/123/api/profile')).toEqual({ path: '/123/api/profile' });
    expect(stripLocalePrefix('/toolong/api/profile')).toEqual({ path: '/toolong/api/profile' });
  });

  it('returns the root path unchanged', () => {
    expect(stripLocalePrefix('/')).toEqual({ path: '/' });
  });

  it('keeps LOCALE_AWARE_REMAINDERS in sync with the public routes it guards', () => {
    expect(LOCALE_AWARE_REMAINDERS).toEqual(['/', '/api/profile', '/api/jsonld']);
  });
});

describe('pathLocaleFromUrl', () => {
  it('extracts the locale token from a full request URL', () => {
    expect(pathLocaleFromUrl('https://app.example/ja/api/profile')).toBe('ja');
    expect(pathLocaleFromUrl('https://app.example/ja/api/profile?lang=en')).toBe('ja');
  });

  it('returns undefined when there is no locale prefix', () => {
    expect(pathLocaleFromUrl('https://app.example/api/profile')).toBeUndefined();
    expect(pathLocaleFromUrl('https://app.example/api/schema')).toBeUndefined();
  });
});
