/**
 * Developer-activity snapshot: types, a runtime type-guard, and the pure,
 * network-free transforms that turn raw GitHub / WakaTime figures into the
 * stored, render-ready shape.
 *
 * This module is deliberately dependency-free and platform-independent — it
 * never performs I/O or network access. Fetching the raw figures from GitHub /
 * WakaTime lives in a separate, runtime-aware package (`@takuhon/activity`);
 * core only owns the data shape and the deterministic transforms, so every
 * runtime renders identical output from the same snapshot.
 *
 * The {@link ActivitySnapshot} is NOT part of the canonical `takuhon.json`
 * document. It is machine-written by a sync step (a CLI command or a scheduled
 * job), persisted in a sibling document via {@link ActivityStorage}, and read
 * by the renderer. Keeping it out of the canonical, owner-curated identity
 * document is intentional: externally-sourced, volatile metrics must not enter
 * the single source of truth a profile owner hand-maintains.
 */

/** One language's share of analyzed source, derived from byte counts. */
export interface LanguageBreakdown {
  /** Language name as reported by the source (e.g. `"TypeScript"`). */
  name: string;
  /** Total bytes attributed to this language across analyzed repositories. */
  bytes: number;
  /** Share of the analyzed total, 0–100, rounded to one decimal place. */
  percent: number;
}

/** A single day in a contribution calendar. */
export interface ContributionDay {
  /** ISO-8601 calendar date (`YYYY-MM-DD`). */
  date: string;
  /** Contribution count on that day. */
  count: number;
}

/** Contribution activity over a window (e.g. the trailing year). */
export interface ContributionCalendar {
  /** Total contributions across the window. */
  total: number;
  /** Per-day counts, in chronological order. */
  days: ContributionDay[];
}

/** Coding time decomposed into whole hours/minutes/seconds plus the raw total. */
export interface CodingTime {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Coarse activity tier label, highest (`S`) to lowest (`D`). */
export type RankTierLabel = 'S' | 'A' | 'B' | 'C' | 'D';

/** A derived activity rank: a tier label plus the 0–100 score it came from. */
export interface RankTier {
  tier: RankTierLabel;
  /** Normalized 0–100 activity score the tier was derived from. */
  score: number;
}

/**
 * A point-in-time snapshot of externally-sourced developer-activity metrics
 * (GitHub languages / contributions, WakaTime coding time, and a derived rank).
 *
 * Every metric field is optional so the snapshot degrades gracefully when a
 * source is unconfigured or temporarily unavailable: the renderer shows what is
 * present and omits the rest. Only {@link lastSyncedAt} is required so staleness
 * is always displayable.
 */
export interface ActivitySnapshot {
  /** ISO-8601 timestamp of when this snapshot was produced. */
  lastSyncedAt: string;
  languages?: LanguageBreakdown[];
  contributions?: ContributionCalendar;
  codingTime?: CodingTime;
  rank?: RankTier;
}

// --- runtime type-guard -----------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLanguageBreakdown(value: unknown): value is LanguageBreakdown {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    typeof value.bytes === 'number' &&
    typeof value.percent === 'number'
  );
}

function isContributionCalendar(value: unknown): value is ContributionCalendar {
  return (
    isObject(value) &&
    typeof value.total === 'number' &&
    Array.isArray(value.days) &&
    value.days.every(
      (d: unknown) => isObject(d) && typeof d.date === 'string' && typeof d.count === 'number',
    )
  );
}

function isCodingTime(value: unknown): value is CodingTime {
  return (
    isObject(value) &&
    typeof value.totalSeconds === 'number' &&
    typeof value.hours === 'number' &&
    typeof value.minutes === 'number' &&
    typeof value.seconds === 'number'
  );
}

function isRankTier(value: unknown): value is RankTier {
  return (
    isObject(value) &&
    typeof value.score === 'number' &&
    (value.tier === 'S' ||
      value.tier === 'A' ||
      value.tier === 'B' ||
      value.tier === 'C' ||
      value.tier === 'D')
  );
}

/**
 * Validate that an unknown value (e.g. one read back from storage) is a
 * well-formed {@link ActivitySnapshot}. A lightweight runtime guard is
 * sufficient here — the snapshot is machine-written and self-owned, so it does
 * not warrant a full JSON Schema validator like `takuhon.json`. A malformed or
 * truncated snapshot fails the guard and the renderer treats it as absent.
 */
export function isActivitySnapshot(value: unknown): value is ActivitySnapshot {
  if (!isObject(value) || typeof value.lastSyncedAt !== 'string') return false;
  if (value.languages !== undefined) {
    if (!Array.isArray(value.languages) || !value.languages.every(isLanguageBreakdown)) {
      return false;
    }
  }
  if (value.contributions !== undefined && !isContributionCalendar(value.contributions)) {
    return false;
  }
  if (value.codingTime !== undefined && !isCodingTime(value.codingTime)) return false;
  if (value.rank !== undefined && !isRankTier(value.rank)) return false;
  return true;
}

// --- pure transforms --------------------------------------------------------

/**
 * Turn per-language byte counts (as GitHub's `repos/.../languages` reports) into
 * sorted percentage breakdowns. Languages with zero bytes are dropped; the
 * result is sorted by bytes descending, ties broken by name, so the output is
 * deterministic. Percentages are rounded to one decimal place and need not sum
 * to exactly 100. Returns `[]` when there is nothing to attribute.
 */
export function computeLanguagePercentages(
  bytesByLanguage: Readonly<Record<string, number>>,
): LanguageBreakdown[] {
  const entries = Object.entries(bytesByLanguage).filter(([, bytes]) => bytes > 0);
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (total === 0) return [];
  return entries
    .map(([name, bytes]) => ({ name, bytes, percent: Math.round((bytes / total) * 1000) / 10 }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
}

/** Decompose a total number of seconds into whole h/m/s (negatives clamp to 0). */
export function formatCodingTime(totalSeconds: number): CodingTime {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    totalSeconds: safe,
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

/** Inputs to {@link deriveRankTier}; any field may be absent. */
export interface RankInput {
  /** Contributions in the trailing window (e.g. the past year). */
  contributions?: number;
  /** Total coding time, in seconds. */
  codingSeconds?: number;
}

/** Contribution count that saturates the contribution sub-score at 100. */
export const RANK_FULL_CONTRIBUTIONS = 2000;
/** Coding hours that saturate the coding-time sub-score at 100. */
export const RANK_FULL_CODING_HOURS = 2000;
/**
 * Inclusive lower bounds for each tier on the 0–100 score (anything below `C`
 * is `D`). These are a deliberately generic, transparent default — not tuned to
 * any individual — and may be revisited.
 */
export const RANK_TIER_THRESHOLDS = { S: 80, A: 60, B: 40, C: 20 } as const;

function tierForScore(score: number): RankTierLabel {
  if (score >= RANK_TIER_THRESHOLDS.S) return 'S';
  if (score >= RANK_TIER_THRESHOLDS.A) return 'A';
  if (score >= RANK_TIER_THRESHOLDS.B) return 'B';
  if (score >= RANK_TIER_THRESHOLDS.C) return 'C';
  return 'D';
}

/**
 * Derive a coarse activity {@link RankTier} from the available signals. Each
 * present signal is mapped to a 0–100 sub-score via linear saturation
 * ({@link RANK_FULL_CONTRIBUTIONS} / {@link RANK_FULL_CODING_HOURS} reach 100);
 * the final score is the mean of the present sub-scores, so a profile is not
 * penalized for leaving a source unconfigured. With no signals the score is 0
 * (`D`). The function is deterministic — no clock or randomness — so renders are
 * reproducible.
 */
export function deriveRankTier(input: RankInput): RankTier {
  const subScores: number[] = [];
  if (input.contributions !== undefined) {
    const c = Math.max(0, input.contributions);
    subScores.push(100 * Math.min(1, c / RANK_FULL_CONTRIBUTIONS));
  }
  if (input.codingSeconds !== undefined) {
    const hours = Math.max(0, input.codingSeconds) / 3600;
    subScores.push(100 * Math.min(1, hours / RANK_FULL_CODING_HOURS));
  }
  const score =
    subScores.length === 0
      ? 0
      : Math.round(subScores.reduce((sum, s) => sum + s, 0) / subScores.length);
  return { tier: tierForScore(score), score };
}
