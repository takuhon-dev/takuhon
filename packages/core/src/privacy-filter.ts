/**
 * Public-endpoint privacy filter for takuhon profile documents.
 *
 * Strips content that the spec's privacy posture marks as opt-in for public
 * exposure, before the document reaches a public reader (a public API
 * response, a server-rendered page, a statically built page, …). Three layers
 * compose here, all conservative by default:
 *
 * 1. **Section layer** (`settings.publicVisibility`, schema 0.6.0). Each
 *    content section the owner sets to `false` is emptied: array sections
 *    become `[]` and the `contact` section becomes `{}`. An absent key — or an
 *    absent `publicVisibility` block — means the section is public, so the
 *    default is all-visible and older documents are unaffected.
 * 2. **Item layer** (`<item>.visibility`, schema 0.7.0). Within a section that
 *    survived the section layer, each array item the owner marks
 *    `visibility: 'private'` is removed. An absent value — or `'public'` —
 *    keeps the item, so the default is all-visible and older documents are
 *    unaffected.
 * 3. **Field layer** (`meta.privacy.*`, `contact.showEmail`). Within an item
 *    that survived, individual identifying fields are stripped unless the
 *    operator opts into disclosure.
 *
 * Visibility is the AND of the layers (the surface-level `enable*` feature
 * toggles are a further, orthogonal layer enforced by the route / renderer, not
 * here): a field survives only when its section is visible, its item is not
 * private, *and* its field flag allows it. Hiding a whole section short-circuits
 * its item and field checks; removing an item short-circuits its field checks.
 *
 * This lives in `@takuhon/core` because it is a pure transform over the core
 * document types with no transport coupling, so every public surface — the
 * API layer (`GET /`, `/api/profile`, `/api/jsonld`, `/takuhon.json`), the
 * CLI's `build`, the MCP executor, the derived CV — applies the exact same
 * projection. `@takuhon/api` re-exports it for backwards compatibility.
 *
 * Field-layer fields filtered:
 *
 * - `certifications[*].credentialId` — hidden when
 *   `meta.privacy.hideCredentialIds !== false` (default true).
 * - `education[*].grade` — hidden when
 *   `meta.privacy.hideEducationGrades !== false` (default true).
 * - `contact.email` — hidden when `contact.showEmail !== true`.
 *
 * `patents[*].patentNumber` is **not** filtered. Patent numbers are public
 * records (issued patents are published by the granting office) and Spec
 * §6.21 explicitly excludes them from the privacy block.
 *
 * The `profile` identity (`profile.displayName`, …) is always public and is
 * not a `publicVisibility` key, so it is never emptied here.
 *
 * Behavior:
 *
 * - Pure function. The input is never mutated; a shallow-copied result is
 *   returned with only the touched arrays / objects replaced.
 * - When no filter applies (every section visible and every field opts into
 *   disclosure), the original reference is returned as-is so callers can
 *   compare by identity.
 * - Admin endpoints (`/api/admin/*`, including `/api/admin/export`) MUST NOT
 *   call this helper — they always serve the full document to authenticated
 *   callers.
 */

import type { LocalizedTakuhon, PublicVisibility, Takuhon, VisibilityControlled } from './types.js';

/**
 * Union of the two profile shapes that traverse the public path. The fields
 * the filter touches are structurally identical between {@link Takuhon} and
 * {@link LocalizedTakuhon}, so the same logic applies to either shape.
 */
type FilterableProfile = Takuhon | LocalizedTakuhon;

/**
 * Content sections that are arrays. Each is emptied to `[]` when hidden by
 * `settings.publicVisibility`. `contact` is handled separately (it is an
 * object, emptied to `{}`), and `profile` is intentionally absent (always
 * public).
 */
const SECTION_ARRAY_KEYS = [
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
] as const satisfies readonly (keyof PublicVisibility)[];

type SectionArrayKey = (typeof SECTION_ARRAY_KEYS)[number];

/**
 * Return a privacy-filtered copy of `profile` suitable for public responses.
 *
 * @param profile Either a raw {@link Takuhon} or a locale-resolved
 *                {@link LocalizedTakuhon}. The output preserves the input's
 *                exact shape.
 */
export function applyPublicPrivacyFilter<T extends FilterableProfile>(profile: T): T {
  const p: FilterableProfile = profile;
  const visibility = p.settings.publicVisibility;

  // Read a section array defensively. The `/takuhon.json` route and the MCP
  // `takuhon://profile` resource filter the RAW stored document (no `normalize`
  // upstream), so a profile written before a section existed — e.g. a pre-1.4.0
  // document that predates `highlights` — can lack the key entirely. Treat a
  // missing array as empty so the filter never throws on such legacy input;
  // `normalize`/`validate` coerce these to `[]` on every other path.
  const sectionArray = (key: SectionArrayKey): readonly VisibilityControlled[] => {
    const value: unknown = p[key];
    return Array.isArray(value) ? (value as readonly VisibilityControlled[]) : [];
  };

  // Section layer: which sections are hidden *and* actually carry content
  // worth removing (so an already-empty section keeps the identity return).
  const hiddenArrays: SectionArrayKey[] = visibility
    ? SECTION_ARRAY_KEYS.filter((key) => visibility[key] === false && sectionArray(key).length > 0)
    : [];

  // Item layer: sections that survive the section layer but carry at least one
  // item the owner marked `visibility: 'private'`. Those items are dropped from
  // the public projection while the section itself stays.
  const hiddenArraySet = new Set<SectionArrayKey>(hiddenArrays);
  const itemFilterArrays: SectionArrayKey[] = SECTION_ARRAY_KEYS.filter(
    (key) =>
      !hiddenArraySet.has(key) && sectionArray(key).some((item) => item.visibility === 'private'),
  );

  const hideContactSection = visibility?.contact === false && Object.keys(p.contact).length > 0;
  const certificationsHidden = visibility?.certifications === false;
  const educationHidden = visibility?.education === false;

  // Field layer: individual fields stripped within still-visible sections.
  // A field check is moot when its whole section is already being emptied.
  const hideCredentialIds = p.meta.privacy?.hideCredentialIds !== false;
  const hideEducationGrades = p.meta.privacy?.hideEducationGrades !== false;
  const allowEmail = p.contact.showEmail === true;

  const stripCertifications = !certificationsHidden && hideCredentialIds && hasAnyCredentialId(p);
  const stripEducation = !educationHidden && hideEducationGrades && hasAnyGrade(p);
  const stripEmail = !hideContactSection && !allowEmail && p.contact.email !== undefined;

  if (
    hiddenArrays.length === 0 &&
    itemFilterArrays.length === 0 &&
    !hideContactSection &&
    !stripCertifications &&
    !stripEducation &&
    !stripEmail
  ) {
    return profile;
  }

  const out: FilterableProfile = { ...profile };

  // Section layer first: empty hidden sections. `[]` is assignable to every
  // array-typed section, so a single keyed view covers the heterogeneous keys.
  const arrays = out as Record<SectionArrayKey, unknown[]>;
  for (const key of hiddenArrays) {
    arrays[key] = [];
  }
  if (hideContactSection) {
    out.contact = {};
  }

  // Item layer: drop private items from sections that survived the section
  // layer. A field check below is moot for an item removed here.
  const itemArrays = out as Record<SectionArrayKey, VisibilityControlled[]>;
  for (const key of itemFilterArrays) {
    itemArrays[key] = itemArrays[key].filter((item) => item.visibility !== 'private');
  }

  // Field layer last, only on items that survived the section and item layers.
  if (stripCertifications) {
    out.certifications = out.certifications.map(stripCredentialId) as T['certifications'];
  }

  if (stripEducation) {
    out.education = out.education.map(stripGrade) as T['education'];
  }

  if (stripEmail) {
    const { email: _omit, ...rest } = out.contact;
    out.contact = rest;
  }

  return out as T;
}

function hasAnyCredentialId(profile: FilterableProfile): boolean {
  return profile.certifications.some((c) => c.credentialId !== undefined);
}

function hasAnyGrade(profile: FilterableProfile): boolean {
  return profile.education.some((e) => e.grade !== undefined);
}

function stripCredentialId<T extends { credentialId?: string }>(item: T): T {
  if (item.credentialId === undefined) return item;
  const { credentialId: _omit, ...rest } = item;
  return rest as T;
}

function stripGrade<T extends { grade?: string }>(item: T): T {
  if (item.grade === undefined) return item;
  const { grade: _omit, ...rest } = item;
  return rest as T;
}
