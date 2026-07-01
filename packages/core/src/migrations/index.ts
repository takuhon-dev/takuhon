/**
 * Forward migration registry for `@takuhon/core`.
 *
 * Each migration is a pure function from a takuhon document at version `from`
 * to one at version `to`. The registry is consulted by {@link migrateTakuhon}
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
 * not re-exported from `@takuhon/core` — it is an implementation detail of
 * {@link migrateTakuhon}.
 */

import type { Takuhon } from '../types.js';

import { v0_1_0_to_v0_2_0 } from './v0.1.0-to-v0.2.0.js';
import { v0_2_0_to_v0_3_0 } from './v0.2.0-to-v0.3.0.js';
import { v0_3_0_to_v0_4_0 } from './v0.3.0-to-v0.4.0.js';
import { v0_4_0_to_v0_5_0 } from './v0.4.0-to-v0.5.0.js';
import { v0_5_0_to_v0_6_0 } from './v0.5.0-to-v0.6.0.js';
import { v0_6_0_to_v0_7_0 } from './v0.6.0-to-v0.7.0.js';
import { v0_7_0_to_v1_0_0 } from './v0.7.0-to-v1.0.0.js';
import { v1_0_0_to_v1_1_0 } from './v1.0.0-to-v1.1.0.js';
import { v1_1_0_to_v1_2_0 } from './v1.1.0-to-v1.2.0.js';
import { v1_2_0_to_v1_3_0 } from './v1.2.0-to-v1.3.0.js';

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
 * Forward migrations bundled with this build of `@takuhon/core`.
 *
 * Entries are listed in the order they would chain for forward migration
 * (`0.1.0 → 0.2.0 → 0.3.0 → ...`). {@link migrateTakuhon} consults this
 * array to build the chain between a source `schemaVersion` and a target.
 */
export const migrations: readonly Migration<Takuhon, Takuhon>[] = [
  v0_1_0_to_v0_2_0,
  v0_2_0_to_v0_3_0,
  v0_3_0_to_v0_4_0,
  v0_4_0_to_v0_5_0,
  v0_5_0_to_v0_6_0,
  v0_6_0_to_v0_7_0,
  v0_7_0_to_v1_0_0,
  v1_0_0_to_v1_1_0,
  v1_1_0_to_v1_2_0,
  v1_2_0_to_v1_3_0,
];
