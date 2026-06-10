/**
 * Forward migration from schema 0.4.0 to 0.5.0.
 *
 * 0.5.0 adds the optional `settings.activity` block (developer-activity
 * dashboard configuration). `settings` was already open
 * (`additionalProperties: true`) and the new block is entirely optional, so the
 * migration is purely a version stamp: every existing field — including any
 * `settings.activity` a forward-compatible document already carries — passes
 * through untouched. There is nothing to default.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_4_0_to_v0_5_0: Migration<Takuhon, Takuhon> = {
  from: '0.4.0',
  to: '0.5.0',
  migrate(data: Takuhon): Takuhon {
    return {
      ...data,
      schemaVersion: '0.5.0',
    };
  },
};
