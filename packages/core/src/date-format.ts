import type { LocaleTag } from './types.js';

/**
 * Strict matcher for a `YYYY-MM` (`YearMonth`) or `YYYY-MM-DD` (full date)
 * value. The day group is optional, so the same pattern accepts both shapes in
 * one pass. Month (`01`-`12`) and day (`01`-`31`) digit ranges are enforced
 * here, so a value such as `2024-13`, `2024-00`, or a trailing `2024-` fails to
 * match and is returned raw. The pattern validates digit shape only, not
 * calendar validity (a schema-impossible `2024-02-30` would still match its
 * day group); schema-validated profile data is always month precision, so that
 * gap is unreachable in practice.
 */
const ISO_DATE = /^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;

/**
 * Format an ISO date (`YYYY-MM` or `YYYY-MM-DD`) as human-facing text in the
 * given locale — e.g. `2024-11` renders as `Nov 2024` (en) / `2024年11月` (ja),
 * and `2025-12-22` as `Dec 22, 2025` (en) / `2025年12月22日` (ja).
 *
 * This is the single date-formatting transform shared by the static HTML and CV
 * renderers in `@takuhon/api` (via their `dateRange`/`timeTag` helpers). The
 * machine-readable ISO value is never altered: the caller keeps it verbatim in
 * the enclosing `<time datetime>` attribute. The machine-readable surfaces
 * (JSON-LD, `/api/profile`, `takuhon.json`, MCP) must NOT call this — they emit
 * raw ISO so consuming machines decide their own presentation.
 *
 * The date is built with `setUTCFullYear` — not `Date.UTC`, which coerces years
 * 0-99 into 1900-1999 — and formatted in UTC, so a month-precision value keeps
 * its century and never slips to the previous month west of UTC (`new
 * Date('2024-05')` parses as midnight UTC and would render as the prior month).
 *
 * Every failure path is fail-safe (this never throws):
 * - A value that is not a well-formed `YYYY-MM`/`YYYY-MM-DD` (wrong shape, or an
 *   out-of-range month/day digit) is returned unchanged, never `Invalid Date`.
 * - An empty `locale` is replaced with `en` before the call, because
 *   `Intl.DateTimeFormat('')` throws a `RangeError`. A structurally invalid
 *   BCP-47 tag also throws and is caught, again falling back to `en`. A
 *   well-formed but unregistered tag (e.g. `zz`) does not throw — `Intl`
 *   negotiates it (typically to English) without entering the catch.
 */
export function formatDate(value: string, locale: LocaleTag): string {
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] !== undefined ? Number(match[3]) : undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day ?? 1);
  const options: Intl.DateTimeFormatOptions =
    day !== undefined
      ? { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { year: 'numeric', month: 'short', timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(locale || 'en', options).format(date);
  } catch {
    // A structurally invalid BCP-47 tag throws a RangeError; fall back to English.
    return new Intl.DateTimeFormat('en', options).format(date);
  }
}
