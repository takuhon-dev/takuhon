import { describe, expect, it } from 'vitest';

import { lookupCaseInsensitive } from '../locale-tag.js';

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
