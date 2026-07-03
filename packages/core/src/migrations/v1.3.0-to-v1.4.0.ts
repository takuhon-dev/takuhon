/**
 * Forward migration from schema 1.3.0 to 1.4.0.
 *
 * 1.4.0 is additive over 1.3.0: it adds the optional `Project.role` field, the
 * optional `settings.sectionOrder` / `settings.sectionLabels` /
 * `settings.highlightsIntro` fields, the new top-level `highlights[]` array
 * (curated "selected posts"), the optional `Volunteering.secondaryLink` field,
 * and widens `Skill.label` to also accept a localized map. Every addition is
 * non-breaking — a valid 1.3.0 document is a valid 1.4.0 document.
 *
 * The optional fields need no transformation (absent = default), so this is
 * effectively a version stamp; the one substantive step is initializing the new
 * `highlights` array, mirroring every earlier array-introducing migration (e.g.
 * {@link import('./v0.3.0-to-v0.4.0.js')}). The conditional spread preserves any
 * value already present at `highlights` on unvalidated / forward-authored input.
 */

import type { Takuhon } from '../types.js';

import type { Migration } from './index.js';

export const v1_3_0_to_v1_4_0: Migration<Takuhon, Takuhon> = {
  from: '1.3.0',
  to: '1.4.0',
  migrate(data: Takuhon): Takuhon {
    const partial = data as Partial<Takuhon>;
    return {
      ...data,
      schemaVersion: '1.4.0',
      highlights: partial.highlights ?? [],
    };
  },
};
