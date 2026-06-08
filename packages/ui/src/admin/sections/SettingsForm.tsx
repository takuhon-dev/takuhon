import type { LocaleTag, Settings } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
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
    </section>
  );
}
