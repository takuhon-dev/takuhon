/**
 * Canonicalize a {@link Takuhon} document into the form downstream consumers
 * (`@takuhon/api`, `@takuhon/ui`, `@takuhon/jsonld`) can rely on without
 * re-checking shape invariants.
 *
 * Two transformations only:
 * - **Empty-entry cleanup** on every localized field (`LocalizedTitle` /
 *   `LocalizedBody`): entries whose string value is empty or whitespace-only
 *   are removed so that locale fallback works field-by-field. When the
 *   cleanup leaves an optional localized map empty, the map itself is
 *   removed (the schema requires `minProperties: 1`).
 * - **Stable sort by `order`** on every list field (`links`, `careers`,
 *   `projects`, `skills`). Items without an `order` move to the end while
 *   preserving their original relative position (ES2019 stable sort).
 *
 * Design notes:
 * - The input is deep-cloned via `structuredClone`; the original is never
 *   mutated. Callers may safely keep a reference to the value they passed in.
 * - `normalize` does *not* canonicalize BCP-47 tag casing nor trim string
 *   content. The first is covered by the schema's `propertyNames` pattern and
 *   `resolveLocale`'s case-insensitive lookup; the second would silently rewrite
 *   author input and is out of scope for Phase 1.
 * - `normalize(normalize(x))` deep-equals `normalize(x)` (idempotent), and the
 *   output re-validates against `takuhon.schema.json`. Both invariants are
 *   enforced by the unit tests.
 */

import type {
  LocalizedBody,
  LocalizedTitle,
  Takuhon,
  NormalizedTakuhon,
  Profile,
} from './types.js';

/**
 * Return a normalized copy of `data`.
 *
 * @param data A takuhon document that has already passed {@link validate}.
 * @returns A new {@link NormalizedTakuhon} with localized empties dropped and
 *          list fields sorted by `order`.
 */
export function normalize(data: Takuhon): NormalizedTakuhon {
  // A takuhon document is structurally pure JSON (string/number/boolean/null +
  // plain objects / arrays — no Date, Map, Set, BigInt, or functions), so a
  // round-trip through JSON gives an equivalent deep clone without depending
  // on `structuredClone`'s global type declaration (which moves between TS
  // `lib.es2022.d.ts` and `lib.dom.d.ts` across TypeScript major releases).
  const out = JSON.parse(JSON.stringify(data)) as Takuhon;

  // Defensive: the schema marks every top-level content array as optional
  // (schema 1.0.0 made `links` / `careers` / `projects` / `skills` optional
  // too, joining the nine 0.2.0 arrays, `testScores`, and `recommendations`),
  // so a stored older profile read from KV after an upgrade — or a minimal
  // 1.0.0 document that omits them — may arrive here without them. The
  // TypeScript `Takuhon` shape requires them; coerce missing values to `[]`
  // so downstream iteration never trips on `undefined`. Idempotent: arrays
  // already present are left untouched.
  const bag = out as unknown as Record<string, unknown>;
  for (const key of NORMALIZED_ARRAYS) {
    if (!Array.isArray(bag[key])) {
      bag[key] = [];
    }
  }

  normalizeProfile(out.profile);

  for (const link of out.links) {
    cleanOptionalLocalized(link, 'label');
  }
  out.links = stableSortByOrder(out.links);

  for (const career of out.careers) {
    cleanRequiredLocalized(career.organization);
    cleanRequiredLocalized(career.role);
    cleanOptionalLocalized(career, 'description');
  }
  out.careers = stableSortByOrder(out.careers);

  for (const project of out.projects) {
    cleanRequiredLocalized(project.title);
    cleanOptionalLocalized(project, 'description');
  }
  out.projects = stableSortByOrder(out.projects);

  out.skills = stableSortByOrder(out.skills);

  for (const cert of out.certifications) {
    cleanRequiredLocalized(cert.title);
    cleanRequiredLocalized(cert.issuingOrganization);
  }
  out.certifications = stableSortByOrder(out.certifications);

  for (const m of out.memberships) {
    cleanRequiredLocalized(m.organization);
    cleanOptionalLocalized(m, 'role');
    cleanOptionalLocalized(m, 'description');
  }
  out.memberships = stableSortByOrder(out.memberships);

  for (const v of out.volunteering) {
    cleanRequiredLocalized(v.organization);
    cleanRequiredLocalized(v.role);
    cleanOptionalLocalized(v, 'cause');
    cleanOptionalLocalized(v, 'description');
  }
  out.volunteering = stableSortByOrder(out.volunteering);

  for (const h of out.honors) {
    cleanRequiredLocalized(h.title);
    cleanRequiredLocalized(h.issuer);
    cleanOptionalLocalized(h, 'description');
  }
  out.honors = stableSortByOrder(out.honors);

  for (const e of out.education) {
    cleanRequiredLocalized(e.institution);
    cleanOptionalLocalized(e, 'degree');
    cleanOptionalLocalized(e, 'fieldOfStudy');
    cleanOptionalLocalized(e, 'description');
  }
  out.education = stableSortByOrder(out.education);

  for (const p of out.publications) {
    cleanRequiredLocalized(p.title);
    cleanOptionalLocalized(p, 'publisher');
    cleanOptionalLocalized(p, 'description');
  }
  out.publications = stableSortByOrder(out.publications);

  for (const l of out.languages) {
    cleanOptionalLocalized(l, 'displayName');
  }
  out.languages = stableSortByOrder(out.languages);

  for (const c of out.courses) {
    cleanRequiredLocalized(c.title);
    cleanOptionalLocalized(c, 'provider');
    cleanOptionalLocalized(c, 'description');
  }
  out.courses = stableSortByOrder(out.courses);

  for (const p of out.patents) {
    cleanRequiredLocalized(p.title);
    cleanOptionalLocalized(p, 'description');
  }
  out.patents = stableSortByOrder(out.patents);

  for (const t of out.testScores) {
    cleanRequiredLocalized(t.title);
    cleanOptionalLocalized(t, 'description');
  }
  out.testScores = stableSortByOrder(out.testScores);

  for (const r of out.recommendations) {
    cleanRequiredLocalized(r.body);
    cleanOptionalLocalized(r, 'relationship');
    cleanOptionalLocalized(r.author, 'headline');
  }
  out.recommendations = stableSortByOrder(out.recommendations);

  for (const h of out.highlights) {
    cleanRequiredLocalized(h.alt);
    cleanRequiredLocalized(h.title);
    cleanOptionalLocalized(h, 'description');
  }
  out.highlights = stableSortByOrder(out.highlights);

  return out;
}

function normalizeProfile(profile: Profile): void {
  cleanRequiredLocalized(profile.displayName);
  cleanOptionalLocalized(profile, 'tagline');
  cleanOptionalLocalized(profile, 'bio');
  if (profile.avatar) {
    cleanOptionalLocalized(profile.avatar, 'alt');
  }
  if (profile.location) {
    cleanOptionalLocalized(profile.location, 'locality');
    cleanOptionalLocalized(profile.location, 'display');
  }
}

/** Remove empty / whitespace-only entries from a required localized map in place. */
function cleanRequiredLocalized(map: LocalizedTitle | LocalizedBody): void {
  for (const key of Object.keys(map)) {
    const value = map[key];
    if (value === undefined || value.trim() === '') {
      delete map[key];
    }
  }
}

/**
 * Remove empty / whitespace-only entries from an optional localized map. When
 * the resulting map is empty, the property is removed from its parent so the
 * document remains schema-valid (`LocalizedTitle` / `LocalizedBody` require
 * `minProperties: 1`).
 */
function cleanOptionalLocalized<
  K extends string,
  T extends Partial<Record<K, LocalizedTitle | LocalizedBody>>,
>(parent: T, key: K): void {
  const map = parent[key];
  if (!map) return;
  for (const k of Object.keys(map)) {
    const value = map[k];
    if (value === undefined || value.trim() === '') {
      delete map[k];
    }
  }
  if (Object.keys(map).length === 0) {
    delete parent[key];
  }
}

/** Stable sort items by ascending `order`; entries without `order` go last. */
function stableSortByOrder<T extends { order?: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const ao = a.order ?? Number.POSITIVE_INFINITY;
    const bo = b.order ?? Number.POSITIVE_INFINITY;
    return ao - bo;
  });
}

const NORMALIZED_ARRAYS = [
  'links',
  'careers',
  'projects',
  'skills',
  'certifications',
  'memberships',
  'volunteering',
  'honors',
  'education',
  'publications',
  'languages',
  'courses',
  'patents',
  'testScores',
  'recommendations',
  'highlights',
] as const;
