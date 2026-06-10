import { describe, expect, it } from 'vitest';

import {
  computeLanguagePercentages,
  deriveRankTier,
  formatCodingTime,
  isActivitySnapshot,
  RANK_FULL_CODING_HOURS,
  RANK_FULL_CONTRIBUTIONS,
  type ActivitySnapshot,
} from '../activity.js';

describe('computeLanguagePercentages', () => {
  it('computes one-decimal percentages and sorts by bytes descending', () => {
    const result = computeLanguagePercentages({ TypeScript: 750, CSS: 250 });
    expect(result).toEqual([
      { name: 'TypeScript', bytes: 750, percent: 75 },
      { name: 'CSS', bytes: 250, percent: 25 },
    ]);
  });

  it('rounds to one decimal place', () => {
    const result = computeLanguagePercentages({ A: 1, B: 2 });
    expect(result.map((r) => r.percent)).toEqual([66.7, 33.3]);
  });

  it('breaks byte-count ties by name for determinism', () => {
    const result = computeLanguagePercentages({ Zig: 100, Ada: 100 });
    expect(result.map((r) => r.name)).toEqual(['Ada', 'Zig']);
  });

  it('drops zero-byte languages and returns [] when nothing to attribute', () => {
    expect(computeLanguagePercentages({ Go: 100, Empty: 0 }).map((r) => r.name)).toEqual(['Go']);
    expect(computeLanguagePercentages({})).toEqual([]);
    expect(computeLanguagePercentages({ Empty: 0 })).toEqual([]);
  });
});

describe('formatCodingTime', () => {
  it('decomposes seconds into whole h/m/s', () => {
    // 1h 2m 3s
    expect(formatCodingTime(3723)).toEqual({
      totalSeconds: 3723,
      hours: 1,
      minutes: 2,
      seconds: 3,
    });
  });

  it('clamps negatives and floors fractional seconds to zero/whole', () => {
    expect(formatCodingTime(-10)).toEqual({ totalSeconds: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(formatCodingTime(59.9)).toEqual({ totalSeconds: 59, hours: 0, minutes: 0, seconds: 59 });
  });
});

describe('deriveRankTier', () => {
  it('returns D / score 0 with no signals', () => {
    expect(deriveRankTier({})).toEqual({ tier: 'D', score: 0 });
  });

  it('saturates a single maxed signal to 100 but averages only present signals', () => {
    // One signal at full saturation → sub-score 100, mean over 1 signal = 100 → S.
    expect(deriveRankTier({ contributions: RANK_FULL_CONTRIBUTIONS })).toEqual({
      tier: 'S',
      score: 100,
    });
  });

  it('averages present sub-scores (half + full → 75 → A)', () => {
    const result = deriveRankTier({
      contributions: RANK_FULL_CONTRIBUTIONS / 2, // sub-score 50
      codingSeconds: RANK_FULL_CODING_HOURS * 3600, // sub-score 100
    });
    expect(result.score).toBe(75);
    expect(result.tier).toBe('A');
  });

  it('clamps over-saturation and negatives', () => {
    expect(deriveRankTier({ contributions: RANK_FULL_CONTRIBUTIONS * 10 }).score).toBe(100);
    expect(deriveRankTier({ contributions: -5 }).score).toBe(0);
  });

  it('maps scores to tiers at the documented thresholds', () => {
    // contributions only → sub-score = mean → easy to target exact scores.
    const at = (score: number): number => (score / 100) * RANK_FULL_CONTRIBUTIONS;
    expect(deriveRankTier({ contributions: at(80) }).tier).toBe('S');
    expect(deriveRankTier({ contributions: at(60) }).tier).toBe('A');
    expect(deriveRankTier({ contributions: at(40) }).tier).toBe('B');
    expect(deriveRankTier({ contributions: at(20) }).tier).toBe('C');
    expect(deriveRankTier({ contributions: at(19) }).tier).toBe('D');
  });
});

describe('isActivitySnapshot', () => {
  const valid: ActivitySnapshot = {
    lastSyncedAt: '2026-06-10T00:00:00Z',
    languages: [{ name: 'TypeScript', bytes: 1, percent: 100 }],
    contributions: { total: 3, days: [{ date: '2026-06-09', count: 3 }] },
    codingTime: { totalSeconds: 60, hours: 0, minutes: 1, seconds: 0 },
    rank: { tier: 'A', score: 70 },
  };

  it('accepts a full valid snapshot', () => {
    expect(isActivitySnapshot(valid)).toBe(true);
  });

  it('accepts a minimal snapshot with only lastSyncedAt', () => {
    expect(isActivitySnapshot({ lastSyncedAt: '2026-06-10T00:00:00Z' })).toBe(true);
  });

  it('rejects non-objects and a missing/typed-wrong lastSyncedAt', () => {
    expect(isActivitySnapshot(null)).toBe(false);
    expect(isActivitySnapshot('x')).toBe(false);
    expect(isActivitySnapshot({})).toBe(false);
    expect(isActivitySnapshot({ lastSyncedAt: 123 })).toBe(false);
  });

  it('rejects malformed optional sections', () => {
    expect(isActivitySnapshot({ ...valid, languages: [{ name: 'X' }] })).toBe(false);
    expect(isActivitySnapshot({ ...valid, contributions: { total: 1 } })).toBe(false);
    expect(isActivitySnapshot({ ...valid, rank: { tier: 'Z', score: 1 } })).toBe(false);
    expect(isActivitySnapshot({ ...valid, codingTime: { totalSeconds: 1 } })).toBe(false);
  });
});
