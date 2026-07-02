/**
 * The canonical set — and default order — of the profile sections the standard
 * renderer emits. One key per orderable `<section>`.
 *
 * This is the single source of truth for section identity and default ordering,
 * shared so the renderer, `settings.sectionOrder` (a future additive schema
 * field), and the section-level privacy controls cannot drift apart. Two kinds
 * of keys appear:
 *
 * - **Data sections** — the array/object sections of the document, named exactly
 *   as in {@link PublicVisibility} (`careers`, `projects`, …). A parity test
 *   guarantees every visibility-controlled data section is represented here.
 * - **Page-only sections** — `about` (rendered from `profile.bio`), `activity`
 *   (rendered from a synced snapshot, not stored document data), and
 *   `highlights` (a curated-posts section; its data model lands in a later
 *   additive schema change — until then the renderer reserves its ordinal
 *   position and emits nothing).
 *
 * `links` is deliberately absent: featured links render at the top and the
 * remaining links render as a fixed bottom section, so link placement is not
 * part of the reorderable section flow.
 *
 * The array order is the renderer's default section order; a caller may render a
 * subset in a different order, but unlisted sections keep this ordering.
 */
export const SECTION_KEYS = [
  'about',
  'careers',
  'projects',
  'volunteering',
  'skills',
  'activity',
  'education',
  'certifications',
  'publications',
  'honors',
  'memberships',
  'courses',
  'patents',
  'testScores',
  'languages',
  'recommendations',
  'highlights',
  'contact',
] as const;

/** One of the canonical {@link SECTION_KEYS}. */
export type SectionKey = (typeof SECTION_KEYS)[number];
