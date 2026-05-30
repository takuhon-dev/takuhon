/**
 * Forward migration from schema 0.3.0 to 0.4.0.
 *
 * Adds the `recommendations` top-level array (owner-curated testimonials, the
 * LinkedIn `Recommendations_Received.csv` equivalent). The transformation is
 * additive: existing fields pass through untouched and no 0.3.x value is
 * dropped.
 *
 * Conditional spread mirrors the earlier migrations. The 0.3.x schema closes
 * the document root (`additionalProperties: false`), so a validated 0.3.x
 * profile cannot carry a pre-existing `recommendations` value. The migration
 * nevertheless runs on `unknown`-shaped input that may not have been validated
 * yet — a stored profile authored ahead of time with a forward-compatible
 * 0.4.0 key, an import file from a downstream consumer, etc. Preserving any
 * value already present at `recommendations` prevents data loss in those paths.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_3_0_to_v0_4_0: Migration<Takuhon, Takuhon> = {
  from: '0.3.0',
  to: '0.4.0',
  migrate(data: Takuhon): Takuhon {
    const partial = data as Partial<Takuhon>;
    return {
      ...data,
      schemaVersion: '0.4.0',
      recommendations: partial.recommendations ?? [],
    };
  },
};
