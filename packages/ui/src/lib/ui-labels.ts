import {
  getPresentLabel,
  type LanguageProficiency,
  type LocaleTag,
  type PatentStatus,
} from '@takuhon/core';

// The ongoing-role "Present" marker is the single label shared with the static
// HTML / CV renderers in `@takuhon/api`, so it lives in `@takuhon/core` as the
// one source of truth. Re-export it here and source the `timeline.present`
// dictionary entries from it so the React UI never drifts from the HTML surface.
export { getPresentLabel };

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
/** Section heading identifiers — the `<h2>` of each profile section. */
type SectionKey =
  | 'activity'
  | 'career'
  | 'education'
  | 'certifications'
  | 'patents'
  | 'projects'
  | 'publications'
  | 'honors'
  | 'recommendations'
  | 'volunteering'
  | 'memberships'
  | 'courses'
  | 'languages'
  | 'testScores'
  | 'skills'
  | 'contact';

export type UILabelKey =
  | 'timeline.present'
  | 'certification.noExpiration'
  | 'patent.filed'
  | 'patent.granted'
  | 'patent.coInventorsPrefix'
  | 'publication.coAuthorsPrefix'
  | `proficiency.${LanguageProficiency}`
  | `patentStatus.${PatentStatus}`
  | `section.${SectionKey}`
  | 'a11y.statusPrefix'
  | 'a11y.causePrefix'
  | 'a11y.profileLinks'
  | 'a11y.tags'
  | 'a11y.skillsSuffix'
  | 'a11y.selectLanguage'
  | 'contact.formLink'
  | 'skills.uncategorized';

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
  'timeline.present': getPresentLabel('en'),
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
  'section.activity': 'Activity',
  'section.career': 'Career',
  'section.education': 'Education',
  'section.certifications': 'Certifications',
  'section.patents': 'Patents',
  'section.projects': 'Projects',
  'section.publications': 'Publications',
  'section.honors': 'Honors & Awards',
  'section.recommendations': 'Recommendations',
  'section.volunteering': 'Volunteering',
  'section.memberships': 'Memberships',
  'section.courses': 'Courses',
  'section.languages': 'Languages',
  'section.testScores': 'Test Scores',
  'section.skills': 'Skills',
  'section.contact': 'Contact',
  // a11y / chrome affixes. Status/Cause prefixes carry their trailing
  // separator (a space in English) so callers concatenate prefix + value.
  'a11y.statusPrefix': 'Status: ',
  'a11y.causePrefix': 'Cause: ',
  'a11y.profileLinks': 'Profile links',
  'a11y.tags': 'Tags',
  'a11y.skillsSuffix': 'skills',
  'a11y.selectLanguage': 'Select language',
  'contact.formLink': 'Contact form',
  'skills.uncategorized': 'Other',
};

/**
 * Japanese dictionary. The co-inventor / co-author prefixes end in a full-width
 * colon and no space (`共著者：`) — the conventional Japanese form — since
 * callers concatenate the prefix directly with the names list (`共著者：A, B`)
 * rather than using the English preposition (`with A, B`).
 */
const JA: LabelDictionary = {
  'timeline.present': getPresentLabel('ja'),
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
  'section.activity': 'アクティビティ',
  'section.career': '職歴',
  'section.education': '学歴',
  'section.certifications': '資格・認定',
  'section.patents': '特許',
  'section.projects': 'プロジェクト',
  'section.publications': '論文・出版',
  'section.honors': '受賞・栄誉',
  'section.recommendations': '推薦',
  'section.volunteering': 'ボランティア',
  'section.memberships': '所属',
  'section.courses': '講座',
  'section.languages': '言語',
  'section.testScores': 'テストスコア',
  'section.skills': 'スキル',
  'section.contact': '連絡先',
  // Status/Cause prefixes use a full-width colon (no trailing space), the
  // conventional Japanese form, mirroring the co-author prefix convention.
  'a11y.statusPrefix': 'ステータス：',
  'a11y.causePrefix': '分野：',
  'a11y.profileLinks': 'プロフィールリンク',
  'a11y.tags': 'タグ',
  'a11y.skillsSuffix': 'スキル',
  'a11y.selectLanguage': '言語を選択',
  'contact.formLink': 'お問い合わせフォーム',
  'skills.uncategorized': 'その他',
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
