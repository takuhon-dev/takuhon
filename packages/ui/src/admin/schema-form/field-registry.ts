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

import type { FieldKind } from './field-classification.js';

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
}

/** Schema-path → hint. Paths use dots and never include array indices. */
export type FieldRegistry = Readonly<Record<string, FieldHint>>;

export const EMPTY_REGISTRY: FieldRegistry = {};

/**
 * Humanize a property name for a default label: `fieldOfStudy` → `Field of
 * study`, `url` → `Url`. The registry overrides this where a better label is
 * needed.
 */
export function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The hint at `path`, or an empty hint when none is registered. */
export function hintAt(registry: FieldRegistry, path: string): FieldHint {
  return registry[path] ?? {};
}
