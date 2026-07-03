/**
 * Bespoke field renderers for the schema-driven form — the handful of fields a
 * generic schema-derived widget cannot capture (design §8). Each is plugged in
 * through the {@link FieldRegistry}'s `render` hook (decision A1), keyed by
 * schema path, so the engine stays generic and the data schema stays UI-free.
 *
 * These reproduce, one-for-one, the behavior the former hand-written section
 * forms had: the avatar's URL/upload/Gravatar trio, comma-separated lists, and
 * the inverted-and-sparse public-visibility matrix.
 */

import type { LocaleTag, PublicVisibility } from '@takuhon/core';

import { getAdminLabel, type AdminLabelKey } from '../admin-labels.js';
import { collectErrorsUnder, errorsAt } from '../errors.js';
import { firstLocalized } from '../localized.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { GravatarField } from '../primitives/GravatarField.js';
import { ImageField } from '../primitives/ImageField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { SelectField, type SelectOption } from '../primitives/SelectField.js';
import { TextField } from '../primitives/TextField.js';

import styles from './custom-fields.module.css';
import type { CustomFieldContext } from './field-registry.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asLocalized(value: unknown): Record<LocaleTag, string> | undefined {
  return value && typeof value === 'object' ? (value as Record<LocaleTag, string>) : undefined;
}

function isEmptyRecord(record: Record<LocaleTag, string> | undefined): boolean {
  return !record || Object.keys(record).length === 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function idOf(item: unknown): string {
  const id = asRecord(item).id;
  return typeof id === 'string' ? id : '';
}

/**
 * Avatar: a URL input (with optional file upload), a "Use Gravatar" control, and
 * localized alt text. The avatar object is created only once a URL or alt text
 * exists and dropped back to `undefined` when both are empty — matching the
 * former ProfileForm exactly.
 */
export function renderAvatar(ctx: CustomFieldContext): React.ReactNode {
  const avatar = asRecord(ctx.value);
  const url = typeof avatar.url === 'string' ? avatar.url : '';

  const updateAvatar = (patch: { url?: string; alt?: Record<LocaleTag, string> }): void => {
    const merged: Record<string, unknown> = { url: '', ...avatar, ...patch };
    const keep = merged.url !== '' || !isEmptyRecord(asLocalized(merged.alt));
    ctx.onChange(keep ? merged : undefined);
  };

  return (
    <>
      <ImageField
        label={getAdminLabel('field.avatarUrl')}
        value={url}
        onChange={(next) => {
          updateAvatar({ url: next });
        }}
        hint={getAdminLabel(ctx.uploadAsset ? 'hint.avatarUpload' : 'hint.avatarNoUpload')}
        errors={errorsAt(ctx.errors, `${ctx.pointer}/url`)}
        uploadAsset={ctx.uploadAsset}
      />
      <GravatarField
        onApply={(next) => {
          updateAvatar({ url: next });
        }}
      />
      <LocaleTabs
        label={getAdminLabel('field.avatarAlt')}
        value={asLocalized(avatar.alt)}
        locales={ctx.locales}
        onChange={(next) => {
          updateAvatar({ alt: next });
        }}
        pointer={`${ctx.pointer}/alt`}
        errors={ctx.errors}
        formatLocale={ctx.formatLocale}
      />
    </>
  );
}

/** Split a comma-separated input into trimmed, non-empty entries. */
function parseCsv(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * A comma-separated list editor for short string arrays (tags, locales) — a
 * single text input rather than a repeater, matching the former forms. `hint`
 * names the help text; `emptyToUndefined` drops the key when the list is empty
 * (optional arrays) versus keeping `[]` (required arrays).
 */
export function csvListRenderer(options: {
  hint: AdminLabelKey;
  emptyToUndefined: boolean;
}): (ctx: CustomFieldContext) => React.ReactNode {
  return function renderCsvList(ctx: CustomFieldContext): React.ReactNode {
    const items = Array.isArray(ctx.value) ? (ctx.value as readonly unknown[]) : [];
    const text = items.filter((item): item is string => typeof item === 'string').join(', ');
    return (
      <TextField
        label={ctx.label}
        value={text}
        onChange={(input) => {
          const next = parseCsv(input);
          ctx.onChange(options.emptyToUndefined && next.length === 0 ? undefined : next);
        }}
        required={ctx.required}
        hint={getAdminLabel(options.hint)}
        errors={collectErrorsUnder(ctx.errors, ctx.pointer)}
      />
    );
  };
}

/**
 * Content sections the owner can hide via `settings.publicVisibility`. The order
 * mirrors the public page; `profile` is intentionally absent because the
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
  { key: 'highlights', label: 'field.publicVisibility.highlights' },
  { key: 'contact', label: 'field.publicVisibility.contact' },
];

/**
 * The public-visibility matrix: a checkbox per content section, checked = public.
 * Stored sparsely — only hidden sections (`false`) are kept, and the whole block
 * is dropped once every section is visible again, so the default (all-visible)
 * stays absent. This inversion is why a generic boolean checkbox cannot stand in.
 */
export function renderVisibilityMatrix(ctx: CustomFieldContext): React.ReactNode {
  const visibility = asRecord(ctx.value) as Partial<Record<keyof PublicVisibility, boolean>>;

  const setVisibility = (key: keyof PublicVisibility, visible: boolean): void => {
    const next: Partial<Record<keyof PublicVisibility, boolean>> = { ...visibility };
    if (visible) {
      delete next[key];
    } else {
      next[key] = false;
    }
    ctx.onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <>
      <h3 className={styles.subheading}>{getAdminLabel('field.settings.publicVisibility')}</h3>
      <p className={styles.hint}>{getAdminLabel('hint.publicVisibility')}</p>
      {VISIBILITY_SECTIONS.map(({ key, label }) => (
        <CheckboxField
          key={key}
          label={getAdminLabel(label)}
          checked={visibility[key] ?? true}
          onChange={(visible) => {
            setVisibility(key, visible);
          }}
        />
      ))}
    </>
  );
}

/**
 * A cross-section reference selector (decision C): a dropdown of a sibling
 * section's items (e.g. `projects.relatedCareerId` → `careers[]`), each option
 * labelled by the item's caption and id. The stored value is the referenced
 * `id`. An optional reference offers "(none)"; a value with no matching item
 * (a dangling reference) is preserved as its own option rather than silently
 * dropped, so a stale id stays visible until the owner fixes it.
 */
export function referenceSelect(spec: {
  /** Sibling section to draw candidates from, e.g. `'careers'`. */
  section: string;
  /** Localized field used as the option caption, e.g. `'organization'`. */
  captionField: string;
}): (ctx: CustomFieldContext) => React.ReactNode {
  return function renderReferenceSelect(ctx: CustomFieldContext): React.ReactNode {
    const value = asString(ctx.value);
    const items = (() => {
      const list = asRecord(ctx.document)[spec.section];
      return Array.isArray(list) ? (list as readonly unknown[]) : [];
    })();

    const candidates: SelectOption[] = items
      .map((item) => {
        const id = idOf(item);
        const caption = firstLocalized(asLocalized(asRecord(item)[spec.captionField]), ctx.locales);
        return { value: id, label: caption ? `${caption} (${id})` : id };
      })
      .filter((option) => option.value !== '');

    const danglingId = value !== '' && !candidates.some((option) => option.value === value);
    const options: SelectOption[] = [
      ...(ctx.required ? [] : [{ value: '', label: getAdminLabel('option.none') }]),
      ...candidates,
      // Keep an unrecognized current value selectable so it is never dropped.
      ...(danglingId ? [{ value, label: value }] : []),
    ];

    return (
      <SelectField
        label={ctx.label}
        value={value}
        options={options}
        onChange={(next) => {
          ctx.onChange(next || undefined);
        }}
        required={ctx.required}
        errors={errorsAt(ctx.errors, ctx.pointer)}
      />
    );
  };
}
