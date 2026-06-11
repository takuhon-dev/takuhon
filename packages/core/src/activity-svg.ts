/**
 * Self-owned inline SVG rendering of an {@link ActivitySnapshot}.
 *
 * The dashboard is drawn from the stored snapshot only — no external badge
 * image, no network access — so a page embedding it keeps a strict
 * `img-src 'self'` Content-Security-Policy. The output is a deterministic pure
 * string: no clock, no randomness, no locale-dependent formatting — the same
 * snapshot always renders the same markup, so both rendering surfaces (the
 * static HTML export and the React profile) and their tests stay in lockstep.
 *
 * Every snapshot-derived string (language names, dates) is XML-escaped before
 * it reaches the markup: language names come from an external API and are
 * treated as untrusted. An empty snapshot (no metric fields) renders to `''`
 * so callers can omit the section with a truthiness check.
 */

import type { ActivitySnapshot, LanguageBreakdown } from './activity.js';

const WIDTH = 520;
const PAD = 16;
const INNER = WIDTH - PAD * 2;

const TEXT_COLOR = '#1a1a1a';
const MUTED_COLOR = '#666666';
const ACCENT_COLOR = '#0b5fff';
const FONT_FAMILY = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

/** Fixed, order-based palette for the language bar; the last entry is "Other". */
const LANGUAGE_COLORS = ['#0b5fff', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
const OTHER_COLOR = '#9ca3af';

/** Languages shown individually before the remainder is folded into "Other". */
const MAX_LANGUAGES = 6;

/** Five-step heat scale for the contribution calendar (zero first). */
const HEAT_COLORS = ['#ebedf0', '#cce0ff', '#99c2ff', '#4d8aff', '#0b5fff'];

/** Contribution cells: 7 px square on a 9 px pitch, 7 rows (days per column). */
const CELL = 7;
const CELL_PITCH = 9;
const CALENDAR_ROWS = 7;
/** Most recent days shown — 53 columns fit the card width. */
const MAX_CALENDAR_DAYS = 53 * CALENDAR_ROWS;

/** Escape text for use in SVG element content or double-quoted attributes. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Group an integer's digits with commas, independent of the host locale. */
function groupDigits(value: number): string {
  const digits = String(Math.trunc(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `-${grouped}` : grouped;
}

/** Round to at most two decimals without locale formatting. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface TextOptions {
  size: number;
  fill: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
}

function text(x: number, y: number, content: string, opts: TextOptions): string {
  const weight = opts.weight !== undefined ? ` font-weight="${String(opts.weight)}"` : '';
  const anchor = opts.anchor !== undefined ? ` text-anchor="${opts.anchor}"` : '';
  return (
    `<text x="${String(x)}" y="${String(y)}" font-family="${FONT_FAMILY}" ` +
    `font-size="${String(opts.size)}" fill="${opts.fill}"${weight}${anchor}>` +
    `${escapeXml(content)}</text>`
  );
}

function caption(x: number, y: number, label: string): string {
  return text(x, y, label, { size: 12, fill: MUTED_COLOR, weight: 600 });
}

function rect(x: number, y: number, w: number, h: number, fill: string, rx = 0): string {
  const corner = rx > 0 ? ` rx="${String(rx)}"` : '';
  return (
    `<rect x="${String(round2(x))}" y="${String(y)}" width="${String(round2(w))}" ` +
    `height="${String(h)}" fill="${fill}"${corner}/>`
  );
}

interface LanguageSegment {
  name: string;
  percent: number;
  color: string;
}

/** Top languages with their palette colors; the tail is folded into "Other". */
function languageSegments(languages: readonly LanguageBreakdown[]): LanguageSegment[] {
  const segments = languages.slice(0, MAX_LANGUAGES).map((l, i) => ({
    name: l.name,
    percent: l.percent,
    color: LANGUAGE_COLORS[i] ?? OTHER_COLOR,
  }));
  const rest = languages.slice(MAX_LANGUAGES);
  if (rest.length > 0) {
    const percent = round2(rest.reduce((sum, l) => sum + l.percent, 0));
    segments.push({ name: 'Other', percent, color: OTHER_COLOR });
  }
  return segments.filter((s) => s.percent > 0);
}

/** Map a day's count to a heat level: 0 stays 0, the rest scale against `max`. */
function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

/**
 * Render the activity snapshot as a self-contained `<svg>` string, or `''`
 * when the snapshot carries no metric data (so callers can omit the section).
 * Sections render independently — whatever the snapshot holds is shown, the
 * rest is left out — and `lastSyncedAt`'s date is always stamped in the footer
 * so staleness stays visible.
 */
export function renderActivitySvg(snapshot: ActivitySnapshot): string {
  const hasLanguages = snapshot.languages !== undefined && snapshot.languages.length > 0;
  const hasContributions =
    snapshot.contributions !== undefined && snapshot.contributions.days.length > 0;
  const hasCodingTime = snapshot.codingTime !== undefined;
  const hasRank = snapshot.rank !== undefined;
  if (!hasLanguages && !hasContributions && !hasCodingTime && !hasRank) return '';

  const parts: string[] = [];
  let y = PAD;

  if (hasLanguages && snapshot.languages) {
    const segments = languageSegments(snapshot.languages);
    const total = segments.reduce((sum, s) => sum + s.percent, 0);

    parts.push(caption(PAD, y + 11, 'Languages'));
    y += 22;

    let x = PAD;
    for (const segment of segments) {
      const w = (segment.percent / total) * INNER;
      parts.push(rect(x, y, w, 12, segment.color));
      x += w;
    }
    y += 22;

    const columnWidth = INNER / 2;
    segments.forEach((segment, i) => {
      const cx = PAD + (i % 2) * columnWidth;
      const cy = y + Math.floor(i / 2) * 18;
      parts.push(rect(cx, cy, 10, 10, segment.color, 2));
      parts.push(
        text(cx + 16, cy + 9, `${segment.name} ${String(segment.percent)}%`, {
          size: 12,
          fill: TEXT_COLOR,
        }),
      );
    });
    y += Math.ceil(segments.length / 2) * 18 + 10;
  }

  if (hasContributions && snapshot.contributions) {
    const days = snapshot.contributions.days.slice(-MAX_CALENDAR_DAYS);
    const max = days.reduce((m, d) => Math.max(m, d.count), 1);

    parts.push(
      caption(PAD, y + 11, `Contributions · ${groupDigits(snapshot.contributions.total)}`),
    );
    y += 22;

    days.forEach((day, i) => {
      const column = Math.floor(i / CALENDAR_ROWS);
      const row = i % CALENDAR_ROWS;
      const fill = HEAT_COLORS[heatLevel(day.count, max)] ?? HEAT_COLORS[0]!;
      parts.push(rect(PAD + column * CELL_PITCH, y + row * CELL_PITCH, CELL, CELL, fill, 1.5));
    });
    y += CALENDAR_ROWS * CELL_PITCH - (CELL_PITCH - CELL) + 12;
  }

  if (hasCodingTime || hasRank) {
    const rankX = PAD + INNER - 120;
    if (hasCodingTime && snapshot.codingTime) {
      const t = snapshot.codingTime;
      parts.push(caption(PAD, y + 11, 'Coding time'));
      parts.push(
        text(PAD, y + 38, `${groupDigits(t.hours)}h ${String(t.minutes)}m`, {
          size: 22,
          fill: TEXT_COLOR,
          weight: 700,
        }),
      );
    }
    if (hasRank && snapshot.rank) {
      const rank = snapshot.rank;
      parts.push(caption(rankX, y + 11, 'Rank'));
      const centerY = y + 32;
      parts.push(
        `<circle cx="${String(rankX + 14)}" cy="${String(centerY)}" r="14" fill="${ACCENT_COLOR}"/>`,
      );
      parts.push(
        `<text x="${String(rankX + 14)}" y="${String(centerY)}" font-family="${FONT_FAMILY}" ` +
          `font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle" ` +
          `dominant-baseline="central">${escapeXml(rank.tier)}</text>`,
      );
      parts.push(
        text(rankX + 36, centerY + 4, `score ${String(rank.score)}`, {
          size: 12,
          fill: MUTED_COLOR,
        }),
      );
    }
    y += 50;
  }

  // `lastSyncedAt` is an ISO-8601 timestamp; the date prefix is shown verbatim
  // (no Date parsing, no timezone math) so rendering stays deterministic.
  parts.push(
    text(WIDTH - PAD, y + 11, `Last synced ${snapshot.lastSyncedAt.slice(0, 10)}`, {
      size: 11,
      fill: MUTED_COLOR,
      anchor: 'end',
    }),
  );
  y += 22;

  const height = y + PAD - 12;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(WIDTH)}" height="${String(height)}" ` +
    `viewBox="0 0 ${String(WIDTH)} ${String(height)}" role="img" aria-label="Developer activity">` +
    `<title>Developer activity</title>${parts.join('')}</svg>`
  );
}
