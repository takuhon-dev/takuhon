import { describe, expect, it } from 'vitest';

import { DARK_PALETTE, LIGHT_PALETTE, renderActivitySvg } from '../activity-svg.js';
import type { ActivitySnapshot } from '../activity.js';

const FULL: ActivitySnapshot = {
  lastSyncedAt: '2026-06-11T00:00:00.000Z',
  languages: [
    { name: 'TypeScript', bytes: 800, percent: 80 },
    { name: 'CSS', bytes: 200, percent: 20 },
  ],
  contributions: {
    total: 1234,
    days: [
      { date: '2026-06-08', count: 0 },
      { date: '2026-06-09', count: 2 },
      { date: '2026-06-10', count: 5 },
    ],
  },
  codingTime: { totalSeconds: 451800, hours: 125, minutes: 30, seconds: 0 },
  rank: { tier: 'A', score: 62 },
};

function rectCount(svg: string): number {
  return (svg.match(/<rect/g) ?? []).length;
}

describe('renderActivitySvg()', () => {
  it('returns an empty string for a snapshot with no metric data', () => {
    expect(renderActivitySvg({ lastSyncedAt: '2026-06-11T00:00:00.000Z' })).toBe('');
  });

  it('renders a self-contained, accessible svg with every present section', () => {
    const svg = renderActivitySvg(FULL);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>Developer activity</title>');
    expect(svg).toContain('Languages');
    expect(svg).toContain('TypeScript 80%');
    expect(svg).toContain('CSS 20%');
    expect(svg).toContain('Contributions · 1,234 · last 12 months');
    expect(svg).toContain('Coding time · last 12 months');
    expect(svg).toContain('125h 30m');
    expect(svg).toContain('Rank');
    expect(svg).toContain('score 62');
    expect(svg).toContain('>A</text>');
    expect(svg).toContain('Last synced 2026-06-11');
    // No external reference of any kind: the card must not need a CSP change.
    expect(svg).not.toMatch(/href|xlink|http:\/\/(?!www\.w3\.org)/);
  });

  it('draws one bar segment and one legend chip per language, one cell per day', () => {
    // 1 opaque background + 2 bar segments + 2 legend chips + 3 calendar cells.
    expect(rectCount(renderActivitySvg(FULL))).toBe(8);
  });

  it('renders sections independently when fields are absent', () => {
    const svg = renderActivitySvg({
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      codingTime: { totalSeconds: 60, hours: 0, minutes: 1, seconds: 0 },
    });
    expect(svg).toContain('Coding time · last 12 months');
    expect(svg).toContain('0h 1m');
    expect(svg).not.toContain('Languages');
    expect(svg).not.toContain('Contributions');
    expect(svg).not.toContain('Rank');
    // Only the opaque background rect; coding time and the footer use <text>.
    expect(rectCount(svg)).toBe(1);
  });

  it('captions the time-windowed figures with the measurement period, and only those', () => {
    const svg = renderActivitySvg(FULL);
    expect(svg).toContain('Contributions · 1,234 · last 12 months');
    expect(svg).toContain('Coding time · last 12 months');
    // The period applies only to the two time-windowed metrics — the language
    // breakdown and the rank are point-in-time, so they carry no period suffix.
    expect(svg).not.toContain('Languages · last 12 months');
    expect(svg).not.toContain('Rank · last 12 months');
    // Exactly the two figures above are captioned with the period.
    expect((svg.match(/last 12 months/g) ?? []).length).toBe(2);
  });

  it('XML-escapes externally-sourced language names', () => {
    const svg = renderActivitySvg({
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      languages: [{ name: '<img src=x onerror=alert(1)>', bytes: 10, percent: 100 }],
    });
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('folds languages beyond the top six into an "Other" segment', () => {
    const languages = Array.from({ length: 8 }, (_, i) => ({
      name: `Lang${String(i)}`,
      bytes: 100 - i,
      percent: 12.5,
    }));
    const svg = renderActivitySvg({ lastSyncedAt: '2026-06-11T00:00:00.000Z', languages });
    expect(svg).toContain('Lang5 12.5%');
    expect(svg).not.toContain('Lang6');
    expect(svg).toContain('Other 25%');
  });

  it('caps the contribution calendar at the most recent 371 days', () => {
    const days = Array.from({ length: 400 }, (_, i) => ({
      date: `day-${String(i)}`,
      count: i % 5,
    }));
    const svg = renderActivitySvg({
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      contributions: { total: 1234567, days },
    });
    // 371 calendar cells + 1 opaque background.
    expect(rectCount(svg)).toBe(372);
    expect(svg).toContain('Contributions · 1,234,567');
  });

  it('is deterministic: the same snapshot renders the same markup', () => {
    expect(renderActivitySvg(FULL)).toBe(renderActivitySvg(FULL));
  });

  it('paints an opaque background as the first shape, full card width', () => {
    const svg = renderActivitySvg(FULL);
    const firstRect = /<rect[^>]*\/>/.exec(svg)?.[0] ?? '';
    expect(firstRect).toContain('x="0" y="0"');
    expect(firstRect).toContain('width="520"');
    expect(firstRect).toContain(`fill="${LIGHT_PALETTE.background}"`);
    // The background precedes the title-following content, so content sits on top.
    expect(svg.indexOf(firstRect)).toBeLessThan(svg.indexOf('Languages'));
  });

  it('defaults to the light palette and is equivalent to passing it explicitly', () => {
    expect(renderActivitySvg(FULL)).toBe(renderActivitySvg(FULL, { palette: LIGHT_PALETTE }));
    expect(renderActivitySvg(FULL)).toContain(`fill="${LIGHT_PALETTE.text}"`);
  });

  it('renders a dark variant when given the dark palette', () => {
    const dark = renderActivitySvg(FULL, { palette: DARK_PALETTE });
    expect(dark).toContain(`fill="${DARK_PALETTE.background}"`);
    expect(dark).toContain(`fill="${DARK_PALETTE.text}"`);
    // The light card's near-black text colour must not leak into the dark card.
    // (The rank-tier glyph is white on the accent disc in both palettes, so the
    // light background colour is not a safe negative assertion here.)
    expect(dark).not.toContain(`fill="${LIGHT_PALETTE.text}"`);
    // Still deterministic and self-contained.
    expect(dark).toBe(renderActivitySvg(FULL, { palette: DARK_PALETTE }));
    expect(dark).not.toMatch(/href|xlink|http:\/\/(?!www\.w3\.org)/);
  });
});
