/**
 * Public-endpoint privacy filter for takuhon profile documents.
 *
 * Strips fields that the spec's privacy posture marks as opt-in for public
 * exposure, before the document reaches a public reader (a public API
 * response, a statically built page, …). The filter is deliberately
 * conservative: when `meta.privacy` is absent the most restrictive
 * interpretation applies (everything sensitive is hidden), and the operator
 * must explicitly opt into disclosure by setting the relevant flag to
 * `false`.
 *
 * This lives in `@takuhon/core` because it is a pure transform over the core
 * document types with no transport coupling, so every public surface — the
 * API layer, the CLI's `build`, future renderers — applies the exact same
 * projection. `@takuhon/api` re-exports it for backwards compatibility.
 *
 * Fields filtered:
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
 * Behavior:
 *
 * - Pure function. The input is never mutated; a shallow-copied result is
 *   returned with only the touched arrays / objects replaced.
 * - When no filter applies (every flag opts into disclosure), the original
 *   reference is returned as-is so callers can compare by identity.
 * - Admin endpoints (`/api/admin/*`, including `/api/admin/export`) MUST NOT
 *   call this helper — they always serve the full document to authenticated
 *   callers.
 */

import type { LocalizedTakuhon, Takuhon } from './types.js';

/**
 * Union of the two profile shapes that traverse the public path. The fields
 * the filter touches (`certifications[*].credentialId`, `education[*].grade`,
 * `contact.email`) are structurally identical between {@link Takuhon} and
 * {@link LocalizedTakuhon}, so the same logic applies to either shape.
 */
type FilterableProfile = Takuhon | LocalizedTakuhon;

/**
 * Return a privacy-filtered copy of `profile` suitable for public responses.
 *
 * @param profile Either a raw {@link Takuhon} or a locale-resolved
 *                {@link LocalizedTakuhon}. The output preserves the input's
 *                exact shape.
 */
export function applyPublicPrivacyFilter<T extends FilterableProfile>(profile: T): T {
  const hideCredentialIds = profile.meta.privacy?.hideCredentialIds !== false;
  const hideEducationGrades = profile.meta.privacy?.hideEducationGrades !== false;
  const allowEmail = profile.contact.showEmail === true;

  const stripCertifications = hideCredentialIds && hasAnyCredentialId(profile);
  const stripEducation = hideEducationGrades && hasAnyGrade(profile);
  const stripEmail = !allowEmail && profile.contact.email !== undefined;

  if (!stripCertifications && !stripEducation && !stripEmail) {
    return profile;
  }

  const out: FilterableProfile = { ...profile };

  if (stripCertifications) {
    out.certifications = profile.certifications.map(stripCredentialId) as T['certifications'];
  }

  if (stripEducation) {
    out.education = profile.education.map(stripGrade) as T['education'];
  }

  if (stripEmail) {
    const { email: _omit, ...rest } = profile.contact;
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
