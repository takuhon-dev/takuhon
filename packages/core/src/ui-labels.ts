import type { LocaleTag } from './types.js';

/**
 * Locale-resolved UI labels that the renderers emit themselves, as opposed to
 * profile data resolved from a document. Promoted here from `@takuhon/ui` so the
 * React UI (`@takuhon/ui` `getUILabel`) and the static HTML / CV renderers
 * (`@takuhon/api`) resolve the same strings from one source — no drift between
 * the React and HTML surfaces.
 *
 * Only the timeline "Present" marker is shared today (the ongoing-role label
 * shown in date ranges when there is no end date). The rest of the UI labels
 * still live in `@takuhon/ui`; this module is where they land if more are
 * promoted later (e.g. section headings — see spec §8.5 i18n).
 */

/**
 * The ongoing-role marker rendered in place of an end date: en `Present`,
 * ja `現在`. English is the ultimate fallback for any other locale.
 */
const PRESENT_LABELS: Record<string, string> = {
  en: 'Present',
  ja: '現在',
};

/**
 * Resolve the "Present" timeline label for the given locale. Tries the exact
 * tag, then the base language subtag (so a resolved `ja-JP` still finds `ja`,
 * mirroring core's regional-subtag fallback), then English. Callers pass a
 * `LocalizedTakuhon.resolvedLocale`.
 */
export function getPresentLabel(locale: LocaleTag): string {
  const base = locale.split('-')[0] ?? locale;
  return PRESENT_LABELS[locale] ?? PRESENT_LABELS[base] ?? 'Present';
}
