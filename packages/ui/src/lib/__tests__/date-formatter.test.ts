import { describe, expect, it } from 'vitest';

import { formatYearMonth } from '../date-formatter.js';

describe('formatYearMonth', () => {
  it('formats a YearMonth in English (short month + numeric year)', () => {
    expect(formatYearMonth('2024-05', 'en')).toBe('May 2024');
    expect(formatYearMonth('2024-09', 'en')).toBe('Sep 2024');
  });

  it('formats a YearMonth in Japanese', () => {
    expect(formatYearMonth('2024-05', 'ja')).toBe('2024年5月');
  });

  it('keeps the month inside the UTC boundary (no off-by-one shift)', () => {
    // Regression guard for the new Date('YYYY-MM') timezone trap: January and
    // December must stay in their own month/year regardless of the host TZ.
    expect(formatYearMonth('2024-01', 'en')).toBe('Jan 2024');
    expect(formatYearMonth('2024-12', 'en')).toBe('Dec 2024');
    expect(formatYearMonth('2024-01', 'ja')).toBe('2024年1月');
    expect(formatYearMonth('2024-12', 'ja')).toBe('2024年12月');
  });

  it('resolves a regional tag through Intl (ja-JP -> Japanese)', () => {
    expect(formatYearMonth('2024-05', 'ja-JP')).toBe('2024年5月');
  });

  it('returns the raw value unchanged when it is not a well-formed YearMonth', () => {
    expect(formatYearMonth('not-a-date', 'en')).toBe('not-a-date');
    expect(formatYearMonth('2024-13', 'en')).toBe('2024-13'); // month out of range
    expect(formatYearMonth('2024', 'en')).toBe('2024'); // year only
    expect(formatYearMonth('', 'ja')).toBe('');
  });

  it('keeps sub-1000 years in their own century (no Date.UTC 0-99 coercion)', () => {
    expect(formatYearMonth('0099-12', 'en')).toBe('Dec 99');
    expect(formatYearMonth('0001-01', 'en')).toBe('Jan 1');
  });

  it('falls back to English when the locale tag is invalid (no throw)', () => {
    expect(formatYearMonth('2024-05', 'invalid!!')).toBe('May 2024');
  });
});
