/**
 * Forward migration from schema 0.1.0 to 0.2.0.
 *
 * Adds nine new top-level array fields (`certifications` / `memberships` /
 * `volunteering` / `honors` / `education` / `publications` / `languages` /
 * `courses` / `patents`) and the `meta.privacy` opt-out block. The
 * transformation is additive: existing fields pass through untouched and no
 * 0.1.x value is dropped.
 *
 * Conditional spread is intentional. The 0.1.x schema closes the document
 * root (`additionalProperties: false`), so a validated 0.1.x profile cannot
 * carry pre-existing values at the new keys. The migration nevertheless
 * runs on `unknown`-shaped input that may not have been validated yet — a
 * stored profile authored ahead of time with forward-compatible 0.2.0 keys,
 * an import file from a downstream consumer, etc. Preserving any value
 * already present at these keys prevents data loss in those paths.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_1_0_to_v0_2_0: Migration<Takuhon, Takuhon> = {
  from: '0.1.0',
  to: '0.2.0',
  migrate(data: Takuhon): Takuhon {
    const partial = data as Partial<Takuhon>;
    return {
      ...data,
      schemaVersion: '0.2.0',
      certifications: partial.certifications ?? [],
      memberships: partial.memberships ?? [],
      volunteering: partial.volunteering ?? [],
      honors: partial.honors ?? [],
      education: partial.education ?? [],
      publications: partial.publications ?? [],
      languages: partial.languages ?? [],
      courses: partial.courses ?? [],
      patents: partial.patents ?? [],
    };
  },
};
