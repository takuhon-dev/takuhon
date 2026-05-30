/**
 * Forward migration from schema 0.2.0 to 0.3.0.
 *
 * Adds the `testScores` top-level array (standardized test / exam scores,
 * LinkedIn `Test_Scores.csv` equivalent). The transformation is additive:
 * existing fields pass through untouched and no 0.2.x value is dropped.
 *
 * Conditional spread mirrors `v0.1.0-to-v0.2.0`. The 0.2.x schema closes the
 * document root (`additionalProperties: false`), so a validated 0.2.x profile
 * cannot carry a pre-existing `testScores` value. The migration nevertheless
 * runs on `unknown`-shaped input that may not have been validated yet — a
 * stored profile authored ahead of time with a forward-compatible 0.3.0 key,
 * an import file from a downstream consumer, etc. Preserving any value already
 * present at `testScores` prevents data loss in those paths.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v0_2_0_to_v0_3_0: Migration<Takuhon, Takuhon> = {
  from: '0.2.0',
  to: '0.3.0',
  migrate(data: Takuhon): Takuhon {
    const partial = data as Partial<Takuhon>;
    return {
      ...data,
      schemaVersion: '0.3.0',
      testScores: partial.testScores ?? [],
    };
  },
};
