/**
 * Forward migration from schema 0.5.0 to 0.6.0.
 *
 * 0.6.0 adds the optional `settings.publicVisibility` block (per-section
 * public/private visibility). `settings` was already open
 * (`additionalProperties: true`) and the new block is entirely optional with a
 * default of all-sections-visible, so the migration is purely a version stamp:
 * every existing field — including any `settings.publicVisibility` a
 * forward-compatible document already carries — passes through untouched. There
 * is nothing to default, and an absent block keeps the prior all-public
 * behaviour.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_5_0_to_v0_6_0: Migration<Takuhon, Takuhon> = {
  from: '0.5.0',
  to: '0.6.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '0.6.0',
    };
  },
};
