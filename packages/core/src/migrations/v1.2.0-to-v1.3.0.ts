/**
 * Forward migration from schema 1.2.0 to 1.3.0.
 *
 * 1.3.0 adds one optional block, `settings.skillCategories` (ordered,
 * localized skill-category display groups), to the 1.2.0 contract. Adding an
 * optional field is a non-breaking (minor) change: a valid 1.2.0 document is a
 * valid 1.3.0 document unchanged — it simply has no `settings.skillCategories`
 * and the rendered profile keeps its flat skill list. The migration is
 * therefore a pure version stamp.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v1_2_0_to_v1_3_0: Migration<Takuhon, Takuhon> = {
  from: '1.2.0',
  to: '1.3.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '1.3.0',
    };
  },
};
