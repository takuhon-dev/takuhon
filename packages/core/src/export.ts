/**
 * Export and import for takuhon profile documents.
 *
 * {@link exportTakuhon} serialises a {@link Takuhon} document into a transport
 * form ({@link ExportedTakuhon}) that can be persisted to a file, an API
 * response, or any other byte-oriented sink. {@link importTakuhon} is the
 * inverse: it validates the input and returns a {@link Takuhon}.
 *
 * Scope of these helpers (deliberately narrow):
 * - Pure, in-memory data transforms — no I/O, no storage adapter coupling.
 * - {@link importTakuhon} **does not** auto-migrate older `schemaVersion`
 *   values. Cross-version handling belongs to the CLI / API layer, which
 *   composes `importTakuhon` + {@link migrateTakuhon} + storage adapters as
 *   spelled out in operational-lifecycle §5.3.
 * - Round-trip equivalence (operational-lifecycle §5.1) is preserved up to
 *   the documented `meta.updatedAt` exception.
 *
 * Asset embedding (Base64) and backup creation are out of scope here; both
 * are the storage / API layer's responsibility.
 */

import type { Takuhon } from './types.js';
import { validate, type ValidationError } from './validate.js';

/**
 * Structural alias of {@link Takuhon}: the transport form is the document
 * itself. A wrapping envelope (e.g. `{ format, version, data, hash }`) is
 * intentionally avoided in Phase 1 — adding one later would be a breaking
 * change to the `GET /api/export` response shape and would require a major
 * version bump of `@takuhon/core`.
 */
export type ExportedTakuhon = Takuhon;

/** Options for {@link exportTakuhon}. */
export interface ExportOptions {
  /**
   * When `true` (default), `meta.updatedAt` is overwritten with the current
   * ISO-8601 timestamp. Set to `false` for byte-for-byte reproducible
   * exports (e.g. roundtrip tests).
   *
   * Round-trip equivalence per operational-lifecycle §5.1 explicitly lists
   * `meta.updatedAt` as the allowed exception.
   */
  updateTimestamp?: boolean;
}

/**
 * Thrown by {@link importTakuhon} when the input fails schema validation
 * (including an unsupported `schemaVersion`). The `errors` field carries
 * the same {@link ValidationError} list that `validate()` would have
 * returned, so the API layer can map them onto RFC 7807.
 */
export class ImportError extends Error {
  readonly errors?: ValidationError[];

  constructor(message: string, options?: { cause?: unknown; errors?: ValidationError[] }) {
    super(message, { cause: options?.cause });
    this.name = 'ImportError';
    this.errors = options?.errors;
  }
}

/**
 * Serialise a {@link Takuhon} into its transport form. The input is
 * deep-cloned via `JSON.parse(JSON.stringify(...))`; the original is never
 * mutated.
 */
export function exportTakuhon(data: Takuhon, options: ExportOptions = {}): ExportedTakuhon {
  const out = JSON.parse(JSON.stringify(data)) as ExportedTakuhon;
  if (options.updateTimestamp !== false) {
    out.meta = { ...out.meta, updatedAt: new Date().toISOString() };
  }
  return out;
}

/**
 * Validate an {@link ExportedTakuhon} and return it as a {@link Takuhon}.
 *
 * On schema validation failure (including an unsupported `schemaVersion`)
 * throws an {@link ImportError} with the structured `errors` attached. The
 * input is not mutated. The return value is a deep clone, so subsequent
 * caller mutations cannot reach back into the supplied document.
 *
 * Cross-version inputs (older `schemaVersion`) are out of scope: callers
 * (CLI / API layer) should run {@link migrateTakuhon} before calling this.
 */
export function importTakuhon(data: ExportedTakuhon): Takuhon {
  const result = validate(data);
  if (!result.ok) {
    throw new ImportError('imported document failed schema validation', { errors: result.errors });
  }
  return JSON.parse(JSON.stringify(result.data)) as Takuhon;
}
