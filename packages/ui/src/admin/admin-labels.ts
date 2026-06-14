/**
 * UI strings for the admin editor.
 *
 * The admin surface is operator-only, so a single English dictionary ships
 * today; the lookup mirrors `getUILabel` (exact locale → base subtag →
 * English) so locales can be added later without touching call sites. Keys are
 * derived from the English dictionary, so every key is guaranteed to resolve.
 */
import type { LocaleTag } from '@takuhon/core';

const EN = {
  'app.title': 'takuhon admin',
  'toolbar.label': 'Editor actions',
  'mode.label': 'Editing mode',
  'mode.form': 'Form',
  'mode.advanced': 'Advanced (JSON)',

  'action.save': 'Save',
  'action.reload': 'Reload',
  'action.export': 'Export',
  'action.import': 'Import',
  'action.add': 'Add',
  'action.remove': 'Remove',
  'action.moveUp': 'Move up',
  'action.moveDown': 'Move down',

  'status.saving': 'Saving…',
  'status.saved': 'Saved.',
  'status.loading': 'Loading…',
  'status.conflict':
    'The profile changed on the server since it was loaded. Reload, then reapply the edits.',
  'status.invalid': 'Some fields need attention before saving.',
  'status.fixSummary': 'Please fix the following:',
  'status.error': 'Something went wrong. Please try again.',
  'status.imported': 'Imported. Review the fields, then save to apply.',
  'status.importInvalid': 'The imported file is not a valid takuhon document.',
  'status.uploading': 'Uploading…',
  'status.uploadError': 'Upload failed. Please try again.',

  'section.profile': 'Profile',
  'section.about': 'About',
  'section.links': 'Links',
  'section.careers': 'Experience',
  'section.projects': 'Projects',
  'section.skills': 'Skills',
  'section.settings': 'Settings',

  'field.displayName': 'Display name',
  'field.tagline': 'Tagline',
  'field.bio': 'Bio',
  'field.avatarUrl': 'Avatar URL',
  'field.avatarUpload': 'Upload image',
  'field.avatarAlt': 'Avatar alternative text',
  'field.gravatarEmail': 'Gravatar email',
  'field.gravatarApply': 'Use Gravatar',
  'field.location.country': 'Country',
  'field.location.region': 'Region',
  'field.location.locality': 'Locality',
  'field.location.display': 'Location (display)',

  'field.link.type': 'Type',
  'field.link.url': 'URL',
  'field.link.label': 'Label',
  'field.link.iconUrl': 'Icon URL',
  'field.link.featured': 'Featured',

  'field.career.organization': 'Organization',
  'field.career.role': 'Role',
  'field.career.description': 'Description',
  'field.career.startDate': 'Start',
  'field.career.endDate': 'End',
  'field.career.isCurrent': 'Current position',
  'field.career.url': 'URL',

  'field.project.title': 'Title',
  'field.project.description': 'Description',
  'field.project.url': 'URL',
  'field.project.tags': 'Tags',
  'field.project.highlighted': 'Highlighted',
  'field.project.startDate': 'Start',
  'field.project.endDate': 'End',

  'field.skill.label': 'Label',
  'field.skill.category': 'Category',

  'field.settings.defaultLocale': 'Default locale',
  'field.settings.fallbackLocale': 'Fallback locale',
  'field.settings.availableLocales': 'Available locales',
  'field.settings.theme': 'Theme',
  'field.settings.showPoweredBy': 'Show the "Powered by takuhon" footer',
  'field.settings.enableJsonLd': 'Emit Schema.org JSON-LD',
  'field.settings.enableApi': 'Expose the public read API',
  'field.settings.enableAnalytics': 'Enable first-party analytics',

  'field.settings.publicVisibility': 'Public sections',
  'field.publicVisibility.links': 'Links',
  'field.publicVisibility.careers': 'Experience',
  'field.publicVisibility.projects': 'Projects',
  'field.publicVisibility.skills': 'Skills',
  'field.publicVisibility.certifications': 'Certifications',
  'field.publicVisibility.memberships': 'Memberships',
  'field.publicVisibility.volunteering': 'Volunteering',
  'field.publicVisibility.honors': 'Honors & awards',
  'field.publicVisibility.education': 'Education',
  'field.publicVisibility.publications': 'Publications',
  'field.publicVisibility.languages': 'Languages',
  'field.publicVisibility.courses': 'Courses',
  'field.publicVisibility.patents': 'Patents',
  'field.publicVisibility.testScores': 'Test scores',
  'field.publicVisibility.recommendations': 'Recommendations',
  'field.publicVisibility.contact': 'Contact',

  'item.link': 'Link',
  'item.career': 'Position',
  'item.project': 'Project',
  'item.skill': 'Skill',

  'empty.links': 'No links yet.',
  'empty.careers': 'No positions yet.',
  'empty.projects': 'No projects yet.',
  'empty.skills': 'No skills yet.',

  'hint.avatarNoUpload': 'Paste an image URL. Uploading image files is not available yet.',
  'hint.avatarUpload': 'Paste an image URL, or upload a JPEG, PNG, WebP, or GIF.',
  'hint.gravatar':
    'Enter an email to generate a Gravatar avatar URL. The email is not saved — only the resulting URL is stored.',
  'hint.month': 'Format: YYYY-MM (e.g. 2024-03).',
  'hint.country': 'ISO 3166-1 alpha-2 code, e.g. US.',
  'hint.tags': 'Comma-separated.',
  'hint.locales': 'Comma-separated BCP-47 tags, e.g. en, ja. Drives the language tabs above.',
  'hint.publicVisibility':
    'Unchecked sections are hidden from every public surface (page, API, JSON-LD). All sections are public by default.',
  'advanced.hint': 'Edit the entire document as JSON. Edits apply only while the JSON is valid.',
  'advanced.invalid': 'The JSON is not a valid takuhon document:',

  'option.none': '(none)',
} as const;

/** Every label key understood by {@link getAdminLabel}. */
export type AdminLabelKey = keyof typeof EN;

const DICTIONARIES: Partial<Record<LocaleTag, Partial<Record<AdminLabelKey, string>>>> = {
  en: EN,
};

/**
 * Resolve an admin label for a locale, falling back to the base language
 * subtag and then English. English is always present, so the return is always
 * a string.
 */
export function getAdminLabel(key: AdminLabelKey, locale: LocaleTag = 'en'): string {
  const exact = DICTIONARIES[locale]?.[key];
  if (exact !== undefined) return exact;
  const base = locale.split('-')[0];
  const baseMatch = base ? DICTIONARIES[base]?.[key] : undefined;
  return baseMatch ?? EN[key];
}
