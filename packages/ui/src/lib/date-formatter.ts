import type { LocaleTag } from '@takuhon/core';

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Format a `YYYY-MM` (`YearMonth`) value for display in the given locale — e.g.
 * `2024-05` renders as `May 2024` (en) or `2024年5月` (ja). This is the
 * human-facing text only; the machine-readable value belongs in the enclosing
 * `<time dateTime>` attribute, which keeps the raw ISO string.
 *
 * The date is constructed via `setUTCFullYear` — not `Date.UTC`, which coerces
 * years 0-99 into 1900-1999 — and formatted in UTC, so a `YearMonth` keeps its
 * century and never slips to the previous month (`new Date('2024-05')` parses
 * as midnight UTC and would render as the prior month west of UTC).
 *
 * `Intl` performs its own locale negotiation, so a regional tag such as `ja-JP`
 * resolves to Japanese without extra handling; an invalid BCP-47 tag falls back
 * to English instead of throwing. A value that is not a well-formed `YearMonth`
 * is returned unchanged rather than risking an `Invalid Date`.
 */
export function formatYearMonth(value: string, locale: LocaleTag): string {
  const match = YEAR_MONTH.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, 1);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  };
  try {
    return new Intl.DateTimeFormat(locale || 'en', options).format(date);
  } catch {
    // An invalid BCP-47 tag throws a RangeError; fall back to English.
    return new Intl.DateTimeFormat('en', options).format(date);
  }
}
