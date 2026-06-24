/**
 * Schema-driven form engine.
 *
 * Renders an editable form for any takuhon section straight from its
 * {@link FieldKind} (see `field-classification.ts`), using the existing admin
 * primitives. The RFC 6901 `pointer` (with array indices, for error lookup) and
 * the registry `path` (without indices, for UI hints) are derived automatically
 * as the engine walks — so no section hand-wires field plumbing or pointer
 * strings. Presentation overrides come from the {@link FieldRegistry}
 * (decision A1); the data schema stays UI-free.
 *
 * Values are treated as `unknown` and narrowed per kind — the document has been
 * (or will be) validated against the schema, so each branch's cast is sound.
 */

import type { LocaleTag } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { errorsAt, NO_FIELD_ERRORS, type FieldErrorIndex } from '../errors.js';
import { makeId } from '../ids.js';
import { firstLocalized } from '../localized.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { type UploadAsset } from '../primitives/ImageField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { Repeater } from '../primitives/Repeater.js';
import { SelectField, type SelectOption } from '../primitives/SelectField.js';
import { TextField } from '../primitives/TextField.js';

import { type FieldEntry, type FieldKind } from './field-classification.js';
import {
  EMPTY_REGISTRY,
  hintAt,
  humanize,
  type CustomFieldContext,
  type FieldRegistry,
} from './field-registry.js';

export interface SchemaFormProps {
  /** Classified shape of the section (from `sectionFieldKind`). */
  kind: FieldKind;
  /** Current value for the section. */
  value: unknown;
  /** Receives the next value on any edit. */
  onChange: (next: unknown) => void;
  /** RFC 6901 pointer to this value, e.g. `/education`. */
  pointer: string;
  /** Registry path (no array indices). Defaults to the pointer sans leading slash. */
  path?: string;
  /** Heading for the section / object. */
  label: string;
  locales: readonly LocaleTag[];
  errors?: FieldErrorIndex;
  registry?: FieldRegistry;
  formatLocale?: (locale: LocaleTag) => string;
  /** Avatar upload, threaded to the avatar field's custom renderer. */
  uploadAsset?: UploadAsset;
  /** Whole document, so reference fields can list sibling-section ids. */
  document?: unknown;
}

interface RenderCtx {
  pointer: string;
  path: string;
  label: string;
  /** Help text shown under the control (registry hint), if any. */
  hint?: string;
  required: boolean;
  multiline: boolean;
  locales: readonly LocaleTag[];
  errors: FieldErrorIndex;
  registry: FieldRegistry;
  formatLocale?: (locale: LocaleTag) => string;
  uploadAsset?: UploadAsset;
  document?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asLocalized(value: unknown): Record<LocaleTag, string> | undefined {
  return value && typeof value === 'object' ? (value as Record<LocaleTag, string>) : undefined;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Set (or, with `undefined`, clear) one key, preserving the existing pattern of
 *  optional fields holding `undefined` rather than being deleted. */
function withKey(
  obj: Record<string, unknown>,
  name: string,
  next: unknown,
): Record<string, unknown> {
  return { ...obj, [name]: next };
}

function idOf(item: unknown): string | undefined {
  const id = asRecord(item).id;
  return typeof id === 'string' ? id : undefined;
}

function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] ?? path;
}

/** A blank value seeded with the kind's required fields (ids auto-generated). */
function blankValue(kind: FieldKind, takenIds: readonly string[], path: string): unknown {
  switch (kind.widget) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const field of kind.fields) {
        if (!field.required) continue;
        obj[field.name] =
          field.kind.widget === 'slug'
            ? makeId(lastSegment(path), takenIds)
            : blankValue(field.kind, [], `${path}.${field.name}`);
      }
      return obj;
    }
    case 'checkbox':
      return false;
    case 'integer':
      return 0;
    case 'localizedTitle':
    case 'localizedBody':
      return {};
    case 'select':
      return kind.options[0] ?? '';
    case 'array':
      return [];
    default:
      return '';
  }
}

/** A human caption for a repeater item: first localized title, else first text. */
function captionOf(item: unknown, itemKind: FieldKind, locales: readonly LocaleTag[]): string {
  if (itemKind.widget !== 'object') return asString(item);
  const obj = asRecord(item);
  for (const field of itemKind.fields) {
    if (field.kind.widget === 'localizedTitle') {
      const caption = firstLocalized(asLocalized(obj[field.name]), locales);
      if (caption) return caption;
    }
  }
  for (const field of itemKind.fields) {
    if (field.kind.widget === 'text' || field.kind.widget === 'select') {
      const value = asString(obj[field.name]);
      if (value) return value;
    }
  }
  return '';
}

function renderScalar(
  kind: FieldKind,
  value: unknown,
  onChange: (next: unknown) => void,
  ctx: RenderCtx,
): React.ReactNode {
  const errors = errorsAt(ctx.errors, ctx.pointer);
  switch (kind.widget) {
    case 'localizedTitle':
    case 'localizedBody':
      return (
        <LocaleTabs
          label={ctx.label}
          value={asLocalized(value)}
          locales={ctx.locales}
          onChange={(next) => {
            onChange(next);
          }}
          multiline={kind.widget === 'localizedBody' || ctx.multiline}
          required={ctx.required}
          pointer={ctx.pointer}
          errors={ctx.errors}
          formatLocale={ctx.formatLocale}
        />
      );
    case 'checkbox': {
      // A boolean with a schema default reflects that default when absent and is
      // stored explicitly (so `false` persists). A default-less boolean stays
      // sparse: unchecked when absent, dropped from the document when false.
      const hasDefault = kind.default !== undefined;
      const checked = value === undefined ? (kind.default ?? false) : value === true;
      return (
        <CheckboxField
          label={ctx.label}
          checked={checked}
          onChange={(next) => {
            onChange(hasDefault ? next : next || undefined);
          }}
        />
      );
    }
    case 'select':
    case 'localeTag': {
      // An optional locale select offers an explicit "(none)" so it can be
      // cleared; a required one (e.g. defaultLocale) does not.
      const localeOptions: readonly SelectOption[] = ctx.locales.map((locale) => ({
        value: locale,
        label: ctx.formatLocale ? ctx.formatLocale(locale) : locale,
      }));
      const options: readonly SelectOption[] =
        kind.widget === 'select'
          ? kind.options.map((option) => ({ value: option, label: option }))
          : ctx.required
            ? localeOptions
            : [{ value: '', label: getAdminLabel('option.none') }, ...localeOptions];
      return (
        <SelectField
          label={ctx.label}
          value={asString(value)}
          options={options}
          onChange={(next) => {
            onChange(next || undefined);
          }}
          required={ctx.required}
          errors={errors}
        />
      );
    }
    case 'integer':
      return (
        <TextField
          label={ctx.label}
          type="text"
          inputMode="numeric"
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(next) => {
            onChange(next === '' ? undefined : Number(next));
          }}
          required={ctx.required}
          hint={ctx.hint}
          errors={errors}
        />
      );
    default: {
      // text / url / email / month / date / datetime / slug → a text-like input.
      // TextField supports text|url|email|month; date/datetime/slug fall to text.
      const type =
        kind.widget === 'url'
          ? 'url'
          : kind.widget === 'email'
            ? 'email'
            : kind.widget === 'month'
              ? 'month'
              : 'text';
      // Year-month fields advertise the `YYYY-MM` format by default, the way the
      // bespoke career/project forms did, so every section stays consistent. A
      // registry hint still wins where one is set.
      const hint = ctx.hint ?? (kind.widget === 'month' ? getAdminLabel('hint.month') : undefined);
      return (
        <TextField
          label={ctx.label}
          type={type}
          value={asString(value)}
          onChange={(next) => {
            onChange(next || undefined);
          }}
          required={ctx.required}
          hint={hint}
          errors={errors}
        />
      );
    }
  }
}

function renderEntry(
  entry: FieldEntry,
  obj: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  ctx: RenderCtx,
): React.ReactNode {
  const path = ctx.path ? `${ctx.path}.${entry.name}` : entry.name;
  const hint = hintAt(ctx.registry, path);
  if (hint.hidden) return null;
  const childCtx: RenderCtx = {
    ...ctx,
    pointer: `${ctx.pointer}/${entry.name}`,
    path,
    label: hint.label ?? humanize(entry.name),
    hint: hint.hint,
    required: entry.required,
    multiline: hint.multiline ?? false,
  };
  const update = (next: unknown): void => {
    onChange(withKey(obj, entry.name, next));
  };
  if (hint.render) {
    const customCtx: CustomFieldContext = {
      value: obj[entry.name],
      onChange: update,
      pointer: childCtx.pointer,
      path: childCtx.path,
      label: childCtx.label,
      required: childCtx.required,
      locales: childCtx.locales,
      errors: childCtx.errors,
      formatLocale: childCtx.formatLocale,
      uploadAsset: childCtx.uploadAsset,
      document: childCtx.document,
    };
    return <div key={entry.name}>{hint.render(customCtx)}</div>;
  }
  return (
    <div key={entry.name}>
      {entry.kind.widget === 'object' ? (
        // Nested objects (location, the activity providers, meta.privacy) become
        // their own labelled fieldset, so same-named children (github.username
        // vs wakatime.username) stay distinguishable.
        <fieldset>
          <legend>{childCtx.label}</legend>
          {renderObjectFields(entry.kind, asRecord(obj[entry.name]), update, childCtx)}
        </fieldset>
      ) : entry.kind.widget === 'array' ? (
        renderArray(entry.kind, obj[entry.name], update, childCtx)
      ) : (
        renderScalar(entry.kind, obj[entry.name], update, childCtx)
      )}
    </div>
  );
}

function renderObjectFields(
  kind: Extract<FieldKind, { widget: 'object' }>,
  obj: Record<string, unknown>,
  onChange: (next: unknown) => void,
  ctx: RenderCtx,
): React.ReactNode {
  const update = (next: Record<string, unknown>): void => {
    onChange(next);
  };
  return kind.fields.map((entry) => renderEntry(entry, obj, update, ctx));
}

function renderArray(
  kind: Extract<FieldKind, { widget: 'array' }>,
  value: unknown,
  onChange: (next: unknown) => void,
  ctx: RenderCtx,
): React.ReactNode {
  const items: readonly unknown[] = Array.isArray(value) ? (value as readonly unknown[]) : [];
  const itemKind = kind.item;
  const takenIds = items.map(idOf).filter((id): id is string => id !== undefined);
  return (
    <Repeater<unknown>
      legend={ctx.label}
      items={items}
      onChange={(next) => {
        onChange(next);
      }}
      keyOf={(item, index) => idOf(item) ?? String(index)}
      itemLabel={(item, index) =>
        captionOf(item, itemKind, ctx.locales) || `${ctx.label} ${String(index + 1)}`
      }
      createItem={() => blankValue(itemKind, takenIds, ctx.path)}
      addLabel={getAdminLabel('action.add')}
      removeLabel={getAdminLabel('action.remove')}
      moveUpLabel={getAdminLabel('action.moveUp')}
      moveDownLabel={getAdminLabel('action.moveDown')}
      renderItem={(item, update, index) => {
        const itemCtx: RenderCtx = { ...ctx, pointer: `${ctx.pointer}/${String(index)}` };
        return itemKind.widget === 'object'
          ? renderObjectFields(itemKind, asRecord(item), update, itemCtx)
          : renderScalar(itemKind, item, update, itemCtx);
      }}
    />
  );
}

/**
 * Render a section's form from its schema-derived {@link FieldKind}. Array
 * sections become a {@link Repeater}; object sections a labelled fieldset;
 * scalars map to the matching primitive.
 */
export function SchemaForm(props: SchemaFormProps): React.JSX.Element {
  const ctx: RenderCtx = {
    pointer: props.pointer,
    path: props.path ?? props.pointer.replace(/^\//, '').replace(/\//g, '.'),
    label: props.label,
    required: true,
    multiline: false,
    locales: props.locales,
    errors: props.errors ?? NO_FIELD_ERRORS,
    registry: props.registry ?? EMPTY_REGISTRY,
    formatLocale: props.formatLocale,
    uploadAsset: props.uploadAsset,
    document: props.document,
  };

  if (props.kind.widget === 'array') {
    return <>{renderArray(props.kind, props.value, props.onChange, ctx)}</>;
  }
  if (props.kind.widget === 'object') {
    return (
      <fieldset>
        <legend>{props.label}</legend>
        {renderObjectFields(props.kind, asRecord(props.value), props.onChange, ctx)}
      </fieldset>
    );
  }
  return <>{renderScalar(props.kind, props.value, props.onChange, ctx)}</>;
}
