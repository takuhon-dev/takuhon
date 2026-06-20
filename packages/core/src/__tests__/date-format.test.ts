import { describe, expect, it } from 'vitest';

import { formatDate } from '../date-format.js';

describe('formatDate', () => {
  it('formats a YearMonth in English (short month + numeric year)', () => {
    expect(formatDate('2020-01', 'en')).toBe('Jan 2020');
    expect(formatDate('2024-05', 'en')).toBe('May 2024');
    expect(formatDate('2024-11', 'en')).toBe('Nov 2024');
  });

  it('formats a YearMonth in Japanese', () => {
    expect(formatDate('2020-01', 'ja')).toBe('2020年1月');
    expect(formatDate('2024-11', 'ja')).toBe('2024年11月');
  });

  it('formats a full date (YYYY-MM-DD) with the day included', () => {
    expect(formatDate('2025-12-22', 'en')).toBe('Dec 22, 2025');
    expect(formatDate('2025-12-22', 'ja')).toBe('2025年12月22日');
  });

  it('keeps the month inside the UTC boundary (no off-by-one shift)', () => {
    // Regression guard for the new Date('YYYY-MM') timezone trap: January and
    // December must stay in their own month/year regardless of the host TZ.
    expect(formatDate('2024-01', 'en')).toBe('Jan 2024');
    expect(formatDate('2024-12', 'en')).toBe('Dec 2024');
    expect(formatDate('2024-01', 'ja')).toBe('2024年1月');
    expect(formatDate('2024-12', 'ja')).toBe('2024年12月');
  });

  it('resolves a regional tag through Intl (ja-JP -> Japanese)', () => {
    expect(formatDate('2024-05', 'ja-JP')).toBe('2024年5月');
  });

  it('keeps sub-1000 years in their own century (no Date.UTC 0-99 coercion)', () => {
    expect(formatDate('0099-12', 'en')).toBe('Dec 99');
    expect(formatDate('0001-01', 'en')).toBe('Jan 1');
  });

  it('returns out-of-range months unchanged in any locale', () => {
    for (const locale of ['en', 'ja']) {
      expect(formatDate('2024-13', locale)).toBe('2024-13');
      expect(formatDate('2024-00', locale)).toBe('2024-00');
    }
  });

  it('returns out-of-range or zero days unchanged (strict day group)', () => {
    expect(formatDate('2024-01-00', 'en')).toBe('2024-01-00');
    expect(formatDate('2024-01-32', 'en')).toBe('2024-01-32');
    expect(formatDate('2024-01-00', 'ja')).toBe('2024-01-00');
  });

  it('returns malformed values unchanged rather than risking an Invalid Date', () => {
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatDate('2024', 'en')).toBe('2024'); // year only
    expect(formatDate('2024-', 'en')).toBe('2024-'); // trailing dash
    expect(formatDate('', 'ja')).toBe('');
    // A hostile value never reaches Intl: the strict pattern rejects it raw.
    expect(formatDate('2024-<script>', 'en')).toBe('2024-<script>');
  });

  it('falls back to English when the locale is empty (Intl throws on "")', () => {
    expect(formatDate('2024-11', '')).toBe('Nov 2024');
  });

  it('falls back to English when the locale tag is structurally invalid (no throw)', () => {
    expect(formatDate('2024-11', 'invalid!!')).toBe('Nov 2024');
  });

  it('negotiates a well-formed but unregistered tag without throwing (no catch)', () => {
    // `zz` is a valid BCP-47 shape but not a registered language; Intl negotiates
    // it (typically to English) instead of throwing, so it never hits the catch.
    expect(() => formatDate('2024-11', 'zz')).not.toThrow();
    expect(formatDate('2024-11', 'zz')).toContain('2024');
  });
});
