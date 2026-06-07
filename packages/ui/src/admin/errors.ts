/**
 * Field-error plumbing shared by the admin form components.
 *
 * Validation failures reach the editor in two shapes that mean the same thing:
 *
 * - `@takuhon/core`'s {@link ValidationError}, produced by a client-side
 *   `validate()` call, carries an RFC 6901 `pointer` such as
 *   `"/profile/displayName/en"`.
 * - The server's RFC 7807 response (`api.md §5`) carries the same location as a
 *   `path` with a leading `#` fragment marker, e.g. `"#/profile/displayName/en"`.
 *
 * Both are normalized to a single canonical pointer so a field can look up its
 * own errors regardless of where they came from.
 */
import type { ValidationError } from '@takuhon/core';

/** A field error in either the core (`pointer`) or RFC 7807 wire (`path`) shape. */
export interface FieldErrorLike {
  pointer?: string;
  path?: string;
  message: string;
}

/**
 * Canonical RFC 6901 pointer: no leading `#`, a leading `/` for any non-root
 * location, and `""` for the document root. Idempotent.
 */
export function canonicalPointer(raw: string): string {
  let pointer = raw.trim();
  if (pointer.startsWith('#')) pointer = pointer.slice(1);
  if (pointer !== '' && !pointer.startsWith('/')) pointer = `/${pointer}`;
  return pointer;
}

/** Maps a canonical pointer to the messages reported at that exact location. */
export type FieldErrorIndex = ReadonlyMap<string, readonly string[]>;

/** Group a flat error list by canonical pointer, preserving message order. */
export function indexErrors(errors: readonly FieldErrorLike[]): FieldErrorIndex {
  const index = new Map<string, string[]>();
  for (const error of errors) {
    const key = canonicalPointer(error.pointer ?? error.path ?? '');
    const existing = index.get(key);
    if (existing) existing.push(error.message);
    else index.set(key, [error.message]);
  }
  return index;
}

/** Convenience over {@link indexErrors} for a core `validate()` failure list. */
export function indexValidationErrors(errors: readonly ValidationError[]): FieldErrorIndex {
  return indexErrors(errors);
}

/** Messages reported at exactly `pointer` (empty array when none). */
export function errorsAt(index: FieldErrorIndex, pointer: string): readonly string[] {
  return index.get(canonicalPointer(pointer)) ?? [];
}

/**
 * Whether any error sits at or below `prefix` — used to badge a section or a
 * repeater item that contains an invalid field deeper in the tree.
 */
export function hasErrorsUnder(index: FieldErrorIndex, prefix: string): boolean {
  const base = canonicalPointer(prefix);
  for (const key of index.keys()) {
    if (key === base || key.startsWith(`${base}/`)) return true;
  }
  return false;
}

/** An empty index, handy as a default prop. */
export const NO_FIELD_ERRORS: FieldErrorIndex = new Map();
