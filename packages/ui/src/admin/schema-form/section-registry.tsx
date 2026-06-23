/**
 * The admin editor's single source of truth for which sections to render and how.
 *
 * {@link ADMIN_SECTIONS} lists every top-level section in display order; the
 * {@link SchemaForm} engine renders each one from the schema. {@link SECTION_REGISTRY}
 * is the UI-hint layer (decision A1): bespoke renderers for the few fields a
 * generic widget cannot capture (avatar, comma-separated lists, the visibility
 * matrix), plus curated labels and help text. The data schema stays UI-free.
 */

import { type Takuhon } from '@takuhon/core';

import { getAdminLabel, type AdminLabelKey } from '../admin-labels.js';

import { csvListRenderer, renderAvatar, renderVisibilityMatrix } from './custom-fields.js';
import { type FieldRegistry } from './field-registry.js';

export interface AdminSection {
  key: keyof Takuhon;
  label: AdminLabelKey;
}

/**
 * All editable sections, in display order. The first six were once bespoke
 * forms; they now share the schema-driven engine with the rest, so every section
 * is a form (spec §14.2 Phase 5, no more raw-JSON-only sections).
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: 'profile', label: 'section.profile' },
  { key: 'links', label: 'section.links' },
  { key: 'careers', label: 'section.careers' },
  { key: 'projects', label: 'section.projects' },
  { key: 'skills', label: 'section.skills' },
  { key: 'settings', label: 'section.settings' },
  { key: 'education', label: 'section.education' },
  { key: 'certifications', label: 'section.certifications' },
  { key: 'publications', label: 'section.publications' },
  { key: 'honors', label: 'section.honors' },
  { key: 'volunteering', label: 'section.volunteering' },
  { key: 'memberships', label: 'section.memberships' },
  { key: 'languages', label: 'section.languages' },
  { key: 'courses', label: 'section.courses' },
  { key: 'patents', label: 'section.patents' },
  { key: 'testScores', label: 'section.testScores' },
  { key: 'recommendations', label: 'section.recommendations' },
  { key: 'contact', label: 'section.contact' },
  { key: 'meta', label: 'section.meta' },
] as const satisfies readonly AdminSection[];

/**
 * UI hints keyed by section-relative dot path (no array indices). Covers the
 * three bespoke widgets, curated labels for fields whose humanized name reads
 * poorly, help text, and the auto-managed meta fields that stay hidden.
 */
export const SECTION_REGISTRY: FieldRegistry = {
  // Profile — avatar is the URL/upload/Gravatar trio.
  'profile.avatar': { render: renderAvatar },
  'profile.location.country': { hint: getAdminLabel('hint.country') },
  'profile.location.display': { label: getAdminLabel('field.location.display') },

  // Links.
  'links.url': { label: getAdminLabel('field.link.url') },
  'links.iconUrl': { label: getAdminLabel('field.link.iconUrl') },

  // Careers.
  'careers.startDate': {
    label: getAdminLabel('field.career.startDate'),
    hint: getAdminLabel('hint.month'),
  },
  'careers.endDate': {
    label: getAdminLabel('field.career.endDate'),
    hint: getAdminLabel('hint.month'),
  },
  'careers.isCurrent': { label: getAdminLabel('field.career.isCurrent') },
  'careers.url': { label: getAdminLabel('field.career.url') },

  // Projects — tags are a comma-separated list.
  'projects.tags': { render: csvListRenderer({ hint: 'hint.tags', emptyToUndefined: true }) },
  'projects.url': { label: getAdminLabel('field.project.url') },
  'projects.startDate': { hint: getAdminLabel('hint.month') },
  'projects.endDate': { hint: getAdminLabel('hint.month') },

  // Settings — locales are comma-separated, visibility is the inverted matrix.
  'settings.availableLocales': {
    render: csvListRenderer({ hint: 'hint.locales', emptyToUndefined: false }),
  },
  'settings.theme': { label: getAdminLabel('field.settings.theme') },
  'settings.showPoweredBy': { label: getAdminLabel('field.settings.showPoweredBy') },
  'settings.enableJsonLd': { label: getAdminLabel('field.settings.enableJsonLd') },
  'settings.enableApi': { label: getAdminLabel('field.settings.enableApi') },
  'settings.enableAnalytics': { label: getAdminLabel('field.settings.enableAnalytics') },
  'settings.activity.github': { label: 'GitHub' },
  'settings.activity.wakatime': { label: 'WakaTime' },
  'settings.publicVisibility': { render: renderVisibilityMatrix },

  // Languages — disambiguate from the profile's "Display name".
  'languages.displayName': { label: 'Language name' },

  // Metadata — auto-managed, never hand-edited.
  'meta.createdAt': { hidden: true },
  'meta.updatedAt': { hidden: true },
  'meta.generator': { hidden: true },
};
