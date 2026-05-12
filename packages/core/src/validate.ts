/**
 * Schema validation for meport profile documents.
 *
 * Compiles the canonical {@link import('../meport.schema.json')} once at module
 * load and exposes a Result-style {@link validate} that returns either the
 * narrowed {@link Meport} value or a list of structured {@link ValidationError}s.
 * The validator is the canonical correctness boundary inside `@meport/core`:
 * `normalize` (commit 3) and the API layer (commit 11+) both rely on this
 * function to know the shape they are working with.
 *
 * Design notes:
 * - Returns a discriminated union rather than throwing so callers (CLI,
 *   normalize, RFC 7807 Problem Details adapters) can route errors however they
 *   like without paying for stack capture on every failure.
 * - Errors carry the RFC 6901 JSON Pointer of the offending value plus the
 *   failing Ajv keyword, so consumers can render messages or look up the
 *   relevant Spec section without leaking Ajv-specific types.
 * - The Ajv 2020 build is used because the schema declares
 *   `$schema: "https://json-schema.org/draft/2020-12/schema"`.
 */

import type { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { schema } from './schema.js';
import type { Meport } from './types.js';

/**
 * Schema versions this build of `@meport/core` accepts directly.
 *
 * The migration registry (Phase 1 commit 6+) will translate older `schemaVersion`
 * values into the current one before validation runs, so this list reflects the
 * versions whose JSON Schema this package literally bundles, not the full
 * support window seen by end users.
 */
export const SUPPORTED_SCHEMA_VERSIONS = ['0.1.0'] as const;

/**
 * A single validation failure.
 *
 * The shape is intentionally schema-agnostic: an API layer can adapt it into an
 * RFC 7807 Problem Details payload, a CLI can render the message, and a future
 * spec-section lookup table can join on {@link pointer} to surface
 * documentation references. A `specSection` field will be added in a later
 * commit; this minimal surface is what commit 2 ships.
 */
export interface ValidationError {
  /** RFC 6901 JSON Pointer to the offending value, e.g. `"/links/4/iconUrl"`. */
  pointer: string;
  /** Human-readable failure description (sourced from Ajv when available). */
  message: string;
  /**
   * The schema keyword that failed: `'required'`, `'enum'`, `'pattern'`,
   * `'additionalProperties'`, `'format'`, `'maxItems'`, `'maxLength'`, etc.
   * The value `'schemaVersion'` is reserved for documents whose
   * `schemaVersion` lies outside {@link SUPPORTED_SCHEMA_VERSIONS}.
   */
  keyword: string;
  /** JSON Pointer into the schema for the failing rule, e.g. `"#/$defs/Link/required"`. */
  schemaPointer?: string;
}

/** Result of {@link validate}. Narrow on `ok` to access `data` or `errors`. */
export type ValidationResult =
  | { ok: true; data: Meport }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
addFormats(ajv);

// Per design decision #5 we skip `JSONSchemaType<Meport>` and let Ajv compile
// the schema object as-is; the `<Meport>` type argument only records the
// validated result type for downstream narrowing.
const compiled = ajv.compile<Meport>(schema);

/**
 * Validate an arbitrary value against the bundled meport schema.
 *
 * @param data unknown JSON-like value (typically parsed from a `meport.json` file)
 * @returns A discriminated result. On success `data` is narrowed to {@link Meport};
 *          on failure `errors` is a non-empty list of {@link ValidationError}s.
 */
export function validate(data: unknown): ValidationResult {
  // Pre-Ajv gate: reject anything that is not a plain object so callers get a
  // clearer top-level error than Ajv's cascade of "must be object" / property
  // failures when handed an array, null, or a primitive.
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      errors: [
        {
          pointer: '',
          message: 'meport.json must be a JSON object.',
          keyword: 'type',
        },
      ],
    };
  }

  // Pre-Ajv gate: reject documents whose schemaVersion sits outside the
  // supported window with a dedicated keyword. Migration (commit 6+) will
  // translate older versions into the current one before reaching this point.
  const candidate = data as { schemaVersion?: unknown };
  if (typeof candidate.schemaVersion === 'string' && !isSupportedVersion(candidate.schemaVersion)) {
    return {
      ok: false,
      errors: [
        {
          pointer: '/schemaVersion',
          message: `schemaVersion "${candidate.schemaVersion}" is not in the supported window (${SUPPORTED_SCHEMA_VERSIONS.join(
            ', ',
          )}).`,
          keyword: 'schemaVersion',
        },
      ],
    };
  }

  if (compiled(data)) {
    return { ok: true, data };
  }

  return {
    ok: false,
    errors: (compiled.errors ?? []).map(toValidationError),
  };
}

function isSupportedVersion(value: string): boolean {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(value);
}

function toValidationError(err: ErrorObject): ValidationError {
  let pointer = err.instancePath;

  if (err.keyword === 'required') {
    const missing = (err.params as { missingProperty?: unknown }).missingProperty;
    if (typeof missing === 'string') {
      pointer = `${err.instancePath}/${escapePointerSegment(missing)}`;
    }
  } else if (err.keyword === 'additionalProperties') {
    const extra = (err.params as { additionalProperty?: unknown }).additionalProperty;
    if (typeof extra === 'string') {
      pointer = `${err.instancePath}/${escapePointerSegment(extra)}`;
    }
  }

  return {
    pointer,
    message: err.message ?? 'Validation failed.',
    keyword: err.keyword,
    schemaPointer: err.schemaPath ? err.schemaPath : undefined,
  };
}

/** Escape a JSON Pointer segment per RFC 6901 (~ becomes ~0, / becomes ~1). */
function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}
