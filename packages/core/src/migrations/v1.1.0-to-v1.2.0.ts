/**
 * Forward migration from schema 1.1.0 to 1.2.0.
 *
 * 1.2.0 adds one optional block, `settings.appearance` (the opt-in design-token
 * re-skin seam), to the 1.1.0 contract. Adding an optional field is a
 * non-breaking (minor) change: a valid 1.1.0 document is a valid 1.2.0 document
 * unchanged — it simply has no `settings.appearance`. The migration is
 * therefore a pure version stamp.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v1_1_0_to_v1_2_0: Migration<Takuhon, Takuhon> = {
  from: '1.1.0',
  to: '1.2.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '1.2.0',
    };
  },
};
