/**
 * Forward migration registry for `@meport/core`.
 *
 * Each migration is a pure function from a meport document at version `from`
 * to one at version `to`. The registry is consulted by {@link migrateMeport}
 * to build a chain when the requested target is more than one step away
 * (`0.1.0 → 0.3.0` is composed of `0.1.0→0.2.0` and `0.2.0→0.3.0`).
 *
 * Authoring conventions:
 * - File name: `vX.Y.Z-to-vA.B.C.ts`
 * - Pure function: must not mutate input, must not perform I/O
 * - Forward only: downgrades are not provided; recovery is via the backup
 *   restore path (operational-lifecycle §4)
 * - Each entry ships with a unit test: sample input/output, idempotency
 *   when applicable, and schema-pass against the target version's schema
 *
 * The chain-building algorithm lives in `_chain.ts` and is intentionally
 * not re-exported from `@meport/core` — it is an implementation detail of
 * {@link migrateMeport}.
 */

import type { Meport } from '../types.js';

/**
 * A forward migration entry. `from` and `to` are semver strings matching
 * the `schemaVersion` field of the input and output documents. `migrate`
 * is pure: it must not mutate `data`.
 */
export interface Migration<From, To> {
  from: string;
  to: string;
  migrate(data: From): To;
}

/**
 * Forward migrations bundled with this build of `@meport/core`. Empty in
 * Phase 1; the first entry will land alongside the v0.2.0 schema bump.
 */
export const migrations: readonly Migration<Meport, Meport>[] = [];
