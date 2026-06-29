/**
 * Forward migration from schema 0.7.0 to 1.0.0.
 *
 * 1.0.0 is the schema-freeze release. It closes every object's
 * `additionalProperties` (reversing the pre-1.0 hybrid strategy), requires
 * localized values to contain at least one non-whitespace character, promotes
 * per-array `id` uniqueness to a contract invariant, and relaxes the top-level
 * `required` set so every content array is optional. None of these change the
 * *value* of a conforming 0.7.0 document: a 0.7.0 profile that already carries
 * no undeclared keys, no whitespace-only localized strings, and no duplicate
 * ids is a valid 1.0.0 document unchanged. The migration is therefore a pure
 * version stamp.
 *
 * The one shape this migration cannot silently repair is data that relied on
 * the pre-1.0 open substrate (extra undeclared keys). Such documents surface
 * as validation errors against the 1.0.0 schema rather than being rewritten —
 * the deliberate, eyes-open cost of the open-substrate → precise-contract
 * reversal.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_7_0_to_v1_0_0: Migration<Takuhon, Takuhon> = {
  from: '0.7.0',
  to: '1.0.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '1.0.0',
    };
  },
};
