import { describe, expect, it } from 'vitest';

import {
  expandRegional,
  isValidBcp47,
  localeMatches,
  lookupCaseInsensitive,
} from '../locale-tag.js';

describe('lookupCaseInsensitive', () => {
  it('returns a direct hit when the key matches verbatim', () => {
    const map = { ja: '日本', en: 'English' };
    expect(lookupCaseInsensitive(map, 'ja')).toBe('日本');
    expect(lookupCaseInsensitive(map, 'en')).toBe('English');
  });

  it('finds entries regardless of ASCII case (en-US matches EN-us, en-us, etc.)', () => {
    const map = { 'en-US': 'American English', 'zh-Hant': 'Traditional Chinese' };
    expect(lookupCaseInsensitive(map, 'EN-US')).toBe('American English');
    expect(lookupCaseInsensitive(map, 'en-us')).toBe('American English');
    expect(lookupCaseInsensitive(map, 'ZH-hant')).toBe('Traditional Chinese');
  });

  it('returns undefined when no key matches and tolerates an undefined map', () => {
    expect(lookupCaseInsensitive({ ja: '日本' }, 'fr')).toBeUndefined();
    expect(lookupCaseInsensitive(undefined, 'ja')).toBeUndefined();
  });
});

describe('isValidBcp47', () => {
  it('accepts well-formed primary, region, and script-region tags', () => {
    expect(isValidBcp47('en')).toBe(true);
    expect(isValidBcp47('ja')).toBe(true);
    expect(isValidBcp47('en-US')).toBe(true);
    expect(isValidBcp47('pt-BR')).toBe(true);
    expect(isValidBcp47('zh-Hant')).toBe(true);
    expect(isValidBcp47('zh-Hant-TW')).toBe(true);
  });

  it('rejects empty, underscore-separated, or non-letter primary subtags', () => {
    expect(isValidBcp47('')).toBe(false);
    expect(isValidBcp47('_')).toBe(false);
    expect(isValidBcp47('en_US')).toBe(false);
    expect(isValidBcp47('123')).toBe(false);
    expect(isValidBcp47('a')).toBe(false);
  });
});

describe('expandRegional', () => {
  it('drops trailing subtags one at a time', () => {
    expect(expandRegional('en-US')).toEqual(['en-US', 'en']);
    expect(expandRegional('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh']);
  });

  it('returns the input unchanged for single-subtag tags', () => {
    expect(expandRegional('en')).toEqual(['en']);
    expect(expandRegional('ja')).toEqual(['ja']);
  });

  it('returns an empty array for malformed tags', () => {
    expect(expandRegional('zz_invalid')).toEqual([]);
    expect(expandRegional('')).toEqual([]);
    expect(expandRegional('_')).toEqual([]);
  });
});

describe('localeMatches', () => {
  it('compares tags case-insensitively', () => {
    expect(localeMatches('en-US', 'EN-us')).toBe(true);
    expect(localeMatches('zh-Hant', 'ZH-HANT')).toBe(true);
  });

  it('returns false when the canonical forms differ', () => {
    expect(localeMatches('en', 'en-US')).toBe(false);
    expect(localeMatches('ja', 'en')).toBe(false);
  });
});
