/**
 * Field-spec registry — the UI-hint layer the data schema deliberately does not
 * carry (design decision A1). Keyed by a section-relative dot path *without*
 * array indices (e.g. `education.institution`, `meta.createdAt`), it overrides
 * or augments the schema-derived classification with presentation concerns:
 * labels, help text, hiding auto-managed fields, forcing a widget.
 *
 * Keeping these out of `takuhon.schema.json` leaves the data contract pure
 * (consumers / validators see no UI noise) and means this track changes no
 * `schemaVersion`.
 */

import type { LocaleTag } from '@takuhon/core';

import type { FieldErrorIndex } from '../errors.js';
import type { UploadAsset } from '../primitives/ImageField.js';

import type { FieldKind } from './field-classification.js';

/**
 * Everything a custom field renderer needs. The engine builds this as it walks,
 * so a bespoke widget (avatar, comma-separated list, visibility matrix) plugs in
 * without re-deriving its pointer/path or re-threading locales and errors. This
 * is the escape hatch for the handful of fields a generic widget cannot capture
 * (design §8 "generic default + targeted craft").
 */
export interface CustomFieldContext {
  /** Current value at this path. */
  value: unknown;
  /** Write the next value for this field back into the document. */
  onChange: (next: unknown) => void;
  /** RFC 6901 pointer (with array indices) for error lookup. */
  pointer: string;
  /** Registry path (no array indices). */
  path: string;
  /** Resolved label (registry override or humanized field name). */
  label: string;
  /** Listed in the parent object's `required`. */
  required: boolean;
  locales: readonly LocaleTag[];
  errors: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
  /** Avatar upload, threaded from the host; absent means URL-only. */
  uploadAsset?: UploadAsset;
  /**
   * The whole document (root value), so a field can read sibling sections —
   * e.g. a reference selector listing `careers[]` / `education[]` ids. Typed
   * `unknown` to keep the engine schema-generic; renderers narrow it.
   */
  document?: unknown;
}

/** Presentation overrides for a single field, looked up by its schema path. */
export interface FieldHint {
  /** Replace the humanized field name. */
  label?: string;
  /** Help text shown under the control. */
  hint?: string;
  /** Omit from the form (the value is still preserved in the document). */
  hidden?: boolean;
  /** Render this widget instead of the schema-derived one. */
  widget?: FieldKind['widget'];
  /** Force multiline for a localized/text field. */
  multiline?: boolean;
  /**
   * Render a bespoke control for this field instead of the schema-derived
   * widget. Used for the few fields no generic widget captures (avatar,
   * comma-separated lists, the public-visibility matrix).
   */
  render?: (ctx: CustomFieldContext) => React.ReactNode;
}

/** Schema-path → hint. Paths use dots and never include array indices. */
export type FieldRegistry = Readonly<Record<string, FieldHint>>;

export const EMPTY_REGISTRY: FieldRegistry = {};

/**
 * Acronyms that read poorly when title-cased: a humanized `url` should be `URL`,
 * not `Url`, and `credentialId` should end in `ID`, not `id`. Matched per word
 * (after camelCase splitting), so only a whole segment is uppercased. Extend as
 * the schema grows; the registry can still override any label outright.
 */
const ACRONYMS = new Set(['url', 'id', 'doi']);

/**
 * Humanize a property name for a default label: `fieldOfStudy` → `Field of
 * study`, `credentialId` → `Credential ID`, `url` → `URL`. Known acronyms stay
 * uppercased. The registry overrides this where a better label is needed.
 */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ');
  return words
    .map((word, index) =>
      ACRONYMS.has(word)
        ? word.toUpperCase()
        : index === 0
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word,
    )
    .join(' ');
}

/** The hint at `path`, or an empty hint when none is registered. */
export function hintAt(registry: FieldRegistry, path: string): FieldHint {
  return registry[path] ?? {};
}
