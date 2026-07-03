/**
 * The canonical set — and default order — of the profile sections the standard
 * renderer emits. One key per orderable `<section>`.
 *
 * This is the single source of truth for section identity and default ordering,
 * shared so the renderer, `settings.sectionOrder`, and the section-level privacy
 * controls cannot drift apart. Two kinds of keys appear:
 *
 * - **Data sections** — the array/object sections of the document, named exactly
 *   as in {@link PublicVisibility} (`careers`, `projects`, `highlights`, …). A
 *   parity test guarantees every visibility-controlled data section is
 *   represented here. `highlights` (the curated "selected posts" carousel, its
 *   own top-level array added in 1.4.0) is one of these.
 * - **Page-only sections** — `about` (rendered from `profile.bio`) and
 *   `activity` (rendered from a synced snapshot, not stored document data).
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

/**
 * Non-section "chrome" labels the renderer emits (skip link, nav aria-labels,
 * the other-links heading, the footer credit lead-in). Together with the
 * section headings these form the full set of localizable labels a caller can
 * override.
 */
export const CHROME_LABEL_KEYS = [
  'skipLink',
  'localeNav',
  'featuredLinks',
  'otherLinks',
  'poweredBy',
] as const;

/**
 * Every overridable label key: one per {@link SECTION_KEYS} heading plus the
 * {@link CHROME_LABEL_KEYS}. This is the single source of truth for the label
 * set shared by the renderer's `SectionLabels`, the `settings.sectionLabels`
 * data override, and the per-request label override — so all three stay in
 * lock-step.
 */
export const LABEL_KEYS = [...SECTION_KEYS, ...CHROME_LABEL_KEYS] as const;

/** One of the {@link LABEL_KEYS}. */
export type LabelKey = (typeof LABEL_KEYS)[number];
