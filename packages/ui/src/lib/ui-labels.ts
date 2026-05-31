import type { LanguageProficiency, LocaleTag, PatentStatus } from '@takuhon/core';

/**
 * Keys for UI-generated fixed labels — text the UI emits itself, as opposed to
 * profile data resolved by `@takuhon/core`. These are localized via
 * {@link getUILabel}, keyed by a `LocalizedTakuhon.resolvedLocale`. See spec
 * §8.5 (Phase 2+ i18n).
 *
 * The proficiency / patent-status members are derived from the corresponding
 * core enums so the dictionaries below stay in lockstep with the schema: adding
 * a value to either enum turns the missing dictionary entry into a type error.
 */
export type UILabelKey =
  | 'timeline.present'
  | 'certification.noExpiration'
  | 'patent.filed'
  | 'patent.granted'
  | 'patent.coInventorsPrefix'
  | 'publication.coAuthorsPrefix'
  | `proficiency.${LanguageProficiency}`
  | `patentStatus.${PatentStatus}`;

type LabelDictionary = Record<UILabelKey, string>;

/**
 * English dictionary. Also the fallback for any locale without its own
 * dictionary, so it MUST remain exhaustive — the `LabelDictionary` type
 * enforces that every `UILabelKey` is present.
 *
 * The co-inventor / co-author prefixes end in a trailing space (`with `):
 * callers concatenate the prefix directly with the names list, so the
 * separator between label and names is locale-specific and lives here, not at
 * the call site.
 */
const EN: LabelDictionary = {
  'timeline.present': 'Present',
  'certification.noExpiration': 'No expiration',
  'patent.filed': 'Filed',
  'patent.granted': 'Granted',
  'patent.coInventorsPrefix': 'with ',
  'publication.coAuthorsPrefix': 'with ',
  'proficiency.native': 'Native',
  'proficiency.fluent': 'Fluent',
  'proficiency.professional': 'Professional working',
  'proficiency.intermediate': 'Intermediate',
  'proficiency.basic': 'Basic',
  'patentStatus.pending': 'Pending',
  'patentStatus.issued': 'Issued',
  'patentStatus.expired': 'Expired',
  'patentStatus.abandoned': 'Abandoned',
};

/**
 * Japanese dictionary. The co-inventor / co-author prefixes end in a full-width
 * colon and no space (`共著者：`) — the conventional Japanese form — since
 * callers concatenate the prefix directly with the names list (`共著者：A, B`)
 * rather than using the English preposition (`with A, B`).
 */
const JA: LabelDictionary = {
  'timeline.present': '現在',
  'certification.noExpiration': '無期限',
  'patent.filed': '出願',
  'patent.granted': '登録',
  'patent.coInventorsPrefix': '共同発明者：',
  'publication.coAuthorsPrefix': '共著者：',
  'proficiency.native': 'ネイティブ',
  'proficiency.fluent': '流暢',
  'proficiency.professional': '実務レベル',
  'proficiency.intermediate': '中級',
  'proficiency.basic': '初級',
  'patentStatus.pending': '出願中',
  'patentStatus.issued': '登録済',
  'patentStatus.expired': '失効',
  'patentStatus.abandoned': '放棄',
};

const DICTIONARIES: Record<LocaleTag, LabelDictionary> = {
  en: EN,
  ja: JA,
};

/**
 * Resolve a UI label for the given locale. Tries the exact tag first, then the
 * base language subtag (so a resolved `ja-JP` still finds the `ja` dictionary,
 * mirroring the regional-subtag expansion in core's `resolveLocale`), and
 * finally falls back to English. Callers pass `LocalizedTakuhon.resolvedLocale`.
 */
export function getUILabel(key: UILabelKey, locale: LocaleTag): string {
  const base = locale.split('-')[0] ?? locale;
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES[base]?.[key] ?? EN[key];
}
