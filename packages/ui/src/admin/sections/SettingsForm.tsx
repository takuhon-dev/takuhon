import type { LocaleTag, PublicVisibility, Settings } from '@takuhon/core';

import { getAdminLabel, type AdminLabelKey } from '../admin-labels.js';
import { NO_FIELD_ERRORS, collectErrorsUnder, errorsAt, type FieldErrorIndex } from '../errors.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { SelectField } from '../primitives/SelectField.js';
import { TextField } from '../primitives/TextField.js';

import styles from './sections.module.css';

export interface SettingsFormProps {
  value: Settings;
  onChange: (next: Settings) => void;
  errors?: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
}

/**
 * Content sections the owner can hide via `settings.publicVisibility`. The
 * order mirrors the public page; `profile` is intentionally absent because the
 * identity is always public (spec §6.2).
 */
const VISIBILITY_SECTIONS: { key: keyof PublicVisibility; label: AdminLabelKey }[] = [
  { key: 'links', label: 'field.publicVisibility.links' },
  { key: 'careers', label: 'field.publicVisibility.careers' },
  { key: 'projects', label: 'field.publicVisibility.projects' },
  { key: 'skills', label: 'field.publicVisibility.skills' },
  { key: 'certifications', label: 'field.publicVisibility.certifications' },
  { key: 'memberships', label: 'field.publicVisibility.memberships' },
  { key: 'volunteering', label: 'field.publicVisibility.volunteering' },
  { key: 'honors', label: 'field.publicVisibility.honors' },
  { key: 'education', label: 'field.publicVisibility.education' },
  { key: 'publications', label: 'field.publicVisibility.publications' },
  { key: 'languages', label: 'field.publicVisibility.languages' },
  { key: 'courses', label: 'field.publicVisibility.courses' },
  { key: 'patents', label: 'field.publicVisibility.patents' },
  { key: 'testScores', label: 'field.publicVisibility.testScores' },
  { key: 'recommendations', label: 'field.publicVisibility.recommendations' },
  { key: 'contact', label: 'field.publicVisibility.contact' },
];

function parseLocales(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/** Site settings: locales, theme, and feature toggles (spec §6.20 / §14.2). */
export function SettingsForm({
  value,
  onChange,
  errors = NO_FIELD_ERRORS,
  formatLocale,
}: SettingsFormProps): React.JSX.Element {
  const format = formatLocale ?? ((locale: LocaleTag) => locale);
  const localeOptions = value.availableLocales.map((locale) => ({
    value: locale,
    label: format(locale),
  }));
  const headingId = 'admin-section-settings';

  // Toggle a section's public visibility. Stored sparsely: only hidden
  // sections (`false`) are kept, and the block is dropped entirely once every
  // section is visible again, so the default (all-visible) stays absent.
  const setVisibility = (key: keyof PublicVisibility, visible: boolean): void => {
    const next: PublicVisibility = { ...value.publicVisibility };
    if (visible) {
      delete next[key];
    } else {
      next[key] = false;
    }
    const publicVisibility = Object.keys(next).length > 0 ? next : undefined;
    onChange({ ...value, publicVisibility });
  };

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        {getAdminLabel('section.settings')}
      </h2>

      <TextField
        label={getAdminLabel('field.settings.availableLocales')}
        value={value.availableLocales.join(', ')}
        onChange={(input) => {
          onChange({ ...value, availableLocales: parseLocales(input) });
        }}
        required
        hint={getAdminLabel('hint.locales')}
        errors={collectErrorsUnder(errors, '/settings/availableLocales')}
      />
      <SelectField
        label={getAdminLabel('field.settings.defaultLocale')}
        value={value.defaultLocale}
        options={localeOptions}
        onChange={(defaultLocale) => {
          onChange({ ...value, defaultLocale });
        }}
        required
        errors={errorsAt(errors, '/settings/defaultLocale')}
      />
      <SelectField
        label={getAdminLabel('field.settings.fallbackLocale')}
        value={value.fallbackLocale ?? ''}
        options={[{ value: '', label: getAdminLabel('option.none') }, ...localeOptions]}
        onChange={(fallbackLocale) => {
          onChange({ ...value, fallbackLocale: fallbackLocale || undefined });
        }}
        errors={errorsAt(errors, '/settings/fallbackLocale')}
      />
      <TextField
        label={getAdminLabel('field.settings.theme')}
        value={value.theme ?? ''}
        onChange={(theme) => {
          onChange({ ...value, theme: theme || undefined });
        }}
        errors={errorsAt(errors, '/settings/theme')}
      />

      <CheckboxField
        label={getAdminLabel('field.settings.showPoweredBy')}
        checked={value.showPoweredBy ?? true}
        onChange={(showPoweredBy) => {
          onChange({ ...value, showPoweredBy });
        }}
      />
      <CheckboxField
        label={getAdminLabel('field.settings.enableJsonLd')}
        checked={value.enableJsonLd ?? true}
        onChange={(enableJsonLd) => {
          onChange({ ...value, enableJsonLd });
        }}
      />
      <CheckboxField
        label={getAdminLabel('field.settings.enableApi')}
        checked={value.enableApi ?? true}
        onChange={(enableApi) => {
          onChange({ ...value, enableApi });
        }}
      />
      <CheckboxField
        label={getAdminLabel('field.settings.enableAnalytics')}
        checked={value.enableAnalytics ?? false}
        onChange={(enableAnalytics) => {
          onChange({ ...value, enableAnalytics });
        }}
      />

      <h3 className={styles.subheading}>{getAdminLabel('field.settings.publicVisibility')}</h3>
      <p className={styles.hint}>{getAdminLabel('hint.publicVisibility')}</p>
      {VISIBILITY_SECTIONS.map(({ key, label }) => (
        <CheckboxField
          key={key}
          label={getAdminLabel(label)}
          checked={value.publicVisibility?.[key] ?? true}
          onChange={(visible) => {
            setVisibility(key, visible);
          }}
        />
      ))}
    </section>
  );
}
