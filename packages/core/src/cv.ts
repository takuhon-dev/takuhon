/**
 * Résumé / CV projection of a profile.
 *
 * {@link deriveCv} turns one locale-resolved {@link LocalizedTakuhon} into a
 * {@link CvDocument}: a header plus the CV-relevant sections in a fixed,
 * résumé-conventional order. It is a pure, deterministic selection-and-projection
 * — no clock, no randomness, no I/O — so the static export ({@link
 * import('@takuhon/cli')}) and a React `CvView` render identical output from the
 * same input.
 *
 * A CV is a curated *subset* of the profile: the web-page-specific sections
 * (links, recommendations, the activity dashboard, test scores) are omitted,
 * and the rest appear in the order a résumé conventionally uses. Entry order
 * within a section is preserved from the input (already normalized by `order`
 * upstream), so the owner's `order` field controls it — `deriveCv` never
 * re-sorts. Empty sections are dropped so the renderer can iterate without
 * emptiness checks.
 *
 * The input must already be privacy-filtered (`applyPublicPrivacyFilter`) by the
 * caller, exactly as the public render path is: `deriveCv` does not strip
 * anything itself, it only projects what it is given.
 */

import type {
  LocalizedCareer,
  LocalizedCertification,
  LocalizedCourse,
  LocalizedEducation,
  LocalizedHonor,
  LocalizedLanguage,
  LocalizedMembership,
  LocalizedPatent,
  LocalizedPublication,
  LocalizedTakuhon,
  LocalizedVolunteering,
  Skill,
} from './types.js';

/** The header block of a CV: identity and contact, drawn from `profile` + `contact`. */
export interface CvHeader {
  displayName: string;
  tagline?: string;
  /** Human-readable location (the address `display` string), if present. */
  location?: string;
  bio?: string;
  /** Email, only when the profile exposed it (privacy filter already applied). */
  email?: string;
  formUrl?: string;
}

/**
 * One CV section, discriminated by `kind`, carrying the locale-resolved entries
 * for that section. The entry types are reused verbatim from `LocalizedTakuhon`.
 */
export type CvSection =
  | { kind: 'experience'; entries: LocalizedCareer[] }
  | { kind: 'education'; entries: LocalizedEducation[] }
  | { kind: 'skills'; entries: Skill[] }
  | { kind: 'certifications'; entries: LocalizedCertification[] }
  | { kind: 'publications'; entries: LocalizedPublication[] }
  | { kind: 'honors'; entries: LocalizedHonor[] }
  | { kind: 'courses'; entries: LocalizedCourse[] }
  | { kind: 'patents'; entries: LocalizedPatent[] }
  | { kind: 'languages'; entries: LocalizedLanguage[] }
  | { kind: 'volunteering'; entries: LocalizedVolunteering[] }
  | { kind: 'memberships'; entries: LocalizedMembership[] };

/** Every `CvSection` discriminant, in the fixed résumé order `deriveCv` emits. */
export type CvSectionKind = CvSection['kind'];

/** A résumé/CV view derived from a profile: a header plus ordered sections. */
export interface CvDocument {
  /** The locale this CV was resolved at (mirrors `LocalizedTakuhon.resolvedLocale`). */
  resolvedLocale: string;
  header: CvHeader;
  /** Non-empty sections only, in the fixed CV order. */
  sections: CvSection[];
}

/**
 * Project a locale-resolved profile into a {@link CvDocument}. Sections appear
 * in a fixed résumé-conventional order and empty ones are omitted; entry order
 * within each section is preserved from the input. Pure and deterministic.
 */
export function deriveCv(localized: LocalizedTakuhon): CvDocument {
  const p = localized.profile;
  const header: CvHeader = { displayName: p.displayName };
  if (p.tagline !== undefined) header.tagline = p.tagline;
  if (p.location?.display !== undefined) header.location = p.location.display;
  if (p.bio !== undefined) header.bio = p.bio;
  if (localized.contact.email !== undefined) header.email = localized.contact.email;
  if (localized.contact.formUrl !== undefined) header.formUrl = localized.contact.formUrl;

  // Fixed résumé order. Each entry is included only when its array is non-empty,
  // so the renderer iterates sections without emptiness checks. The set
  // deliberately excludes links, recommendations, the activity dashboard, and
  // test scores (web-page surfaces, not résumé content).
  const candidates: CvSection[] = [
    { kind: 'experience', entries: localized.careers },
    { kind: 'education', entries: localized.education },
    { kind: 'skills', entries: localized.skills },
    { kind: 'certifications', entries: localized.certifications },
    { kind: 'publications', entries: localized.publications },
    { kind: 'honors', entries: localized.honors },
    { kind: 'courses', entries: localized.courses },
    { kind: 'patents', entries: localized.patents },
    { kind: 'languages', entries: localized.languages },
    { kind: 'volunteering', entries: localized.volunteering },
    { kind: 'memberships', entries: localized.memberships },
  ];

  return {
    resolvedLocale: localized.resolvedLocale,
    header,
    sections: candidates.filter((section) => section.entries.length > 0),
  };
}
