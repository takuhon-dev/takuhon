/**
 * Forward migration from schema 0.6.0 to 0.7.0.
 *
 * 0.7.0 adds the optional per-item `visibility` field (`'public' | 'private'`)
 * to every content item (links, careers, projects, …). The field is entirely
 * optional with a default of `'public'`, so the migration is purely a version
 * stamp: every existing item passes through untouched, and an absent
 * `visibility` keeps the item public exactly as before.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_6_0_to_v0_7_0: Migration<Takuhon, Takuhon> = {
  from: '0.6.0',
  to: '0.7.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '0.7.0',
    };
  },
};
