/**
 * Forward migration from schema 1.3.0 to 1.4.0.
 *
 * 1.4.0 adds one optional field, `Project.role` (the owner's localized
 * role/relationship on a project), to the 1.3.0 contract. Adding an optional
 * field is a non-breaking (minor) change: a valid 1.3.0 document is a valid
 * 1.4.0 document unchanged — it simply has no project roles, and the rendered
 * profile shows no role line under those project titles. The migration is
 * therefore a pure version stamp.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v1_3_0_to_v1_4_0: Migration<Takuhon, Takuhon> = {
  from: '1.3.0',
  to: '1.4.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '1.4.0',
    };
  },
};
