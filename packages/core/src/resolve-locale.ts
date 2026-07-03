/**
 * Reduce a multi-locale {@link Takuhon} document to a single requested locale.
 *
 * Builds a flat candidate chain from the function arguments and `data.settings`,
 * expanding each entry's regional subtag (e.g. `'en-US' → ['en-US', 'en']`),
 * deduplicating case-insensitively, then walks the chain **per field**. The
 * first candidate whose value is non-blank wins for that field; an empty entry
 * (`""` / whitespace-only) falls through to the next candidate just like a
 * missing entry. This matches the spec semantics in [api.md §3.4] where empty
 * values are equivalent to absence.
 *
 * Design notes:
 * - Function arguments (`locale`, `fallbackLocale`) take precedence over
 *   `settings.*`, in line with the spec's 7-tier list: HTTP-derived locales
 *   (#1-#4) are resolved upstream by `@takuhon/api` and arrive here as
 *   `locale` / `fallbackLocale`; `settings.defaultLocale` (#5),
 *   `settings.fallbackLocale` (#6), and `settings.availableLocales[0]` (#7)
 *   fill the tail.
 * - Invalid tags (`'zz_invalid'`, `'_'`, etc.) are silently dropped rather
 *   than throwing. Resolution is best-effort: throwing on a malformed
 *   `?lang=` query would push error handling responsibilities back into the
 *   API layer for a recoverable case.
 * - A final rescue step appends every `availableLocales` entry so a request
 *   with no matching candidate still produces a populated document. If even
 *   that fails (only possible for hand-crafted inputs that bypassed
 *   `validate`), required strings fall back to `''` and the caller's tests
 *   catch the document-level regression.
 * - `resolvedLocale` records the tag that produced `profile.displayName`,
 *   which is the field most consumers expose as the canonical locale of the
 *   response (e.g. `meta.locale` in API responses, `<html lang>` in UI).
 */

import { expandRegional, isValidBcp47, lookupCaseInsensitive } from './locale-tag.js';
import type { LabelKey } from './sections.js';
import type {
  Address,
  Avatar,
  Career,
  Certification,
  Course,
  Education,
  Honor,
  Language,
  Link,
  LocaleTag,
  LocalizedAddress,
  LocalizedAvatar,
  LocalizedBody,
  LocalizedCareer,
  LocalizedCertification,
  LocalizedCourse,
  LocalizedEducation,
  LocalizedHonor,
  LocalizedLanguage,
  LocalizedLink,
  LocalizedMembership,
  LocalizedPatent,
  LocalizedProfile,
  LocalizedProject,
  LocalizedPublication,
  LocalizedRecommendation,
  LocalizedRecommendationAuthor,
  LocalizedSettings,
  LocalizedTakuhon,
  LocalizedTestScore,
  LocalizedTitle,
  LocalizedVolunteering,
  Membership,
  Patent,
  Profile,
  Project,
  Publication,
  Recommendation,
  RecommendationAuthor,
  Settings,
  Takuhon,
  TestScore,
  Volunteering,
} from './types.js';

/**
 * Resolve a takuhon document to a single locale.
 *
 * @param data    A takuhon document (validated; ideally normalized first).
 * @param locale  Caller-resolved request locale (e.g. from `?lang=` or
 *                `Accept-Language`). Invalid tags are ignored.
 * @param fallbackLocale Caller-supplied secondary candidate when `locale`
 *                misses. Invalid tags are ignored.
 */
export function resolveLocale(
  data: Takuhon,
  locale?: string,
  fallbackLocale?: string,
): LocalizedTakuhon {
  const candidates = buildCandidates(data, locale, fallbackLocale);
  const displayPick = pickLocalizedWithTag(data.profile.displayName, candidates);

  return {
    schemaVersion: data.schemaVersion,
    profile: resolveProfile(data.profile, candidates, displayPick?.value ?? ''),
    links: data.links.map((l) => resolveLink(l, candidates)),
    careers: data.careers.map((c) => resolveCareer(c, candidates)),
    projects: data.projects.map((p) => resolveProject(p, candidates)),
    skills: data.skills,
    certifications: data.certifications.map((c) => resolveCertification(c, candidates)),
    memberships: data.memberships.map((m) => resolveMembership(m, candidates)),
    volunteering: data.volunteering.map((v) => resolveVolunteering(v, candidates)),
    honors: data.honors.map((h) => resolveHonor(h, candidates)),
    education: data.education.map((e) => resolveEducation(e, candidates)),
    publications: data.publications.map((p) => resolvePublication(p, candidates)),
    languages: data.languages.map((l) => resolveLanguage(l, candidates)),
    courses: data.courses.map((c) => resolveCourse(c, candidates)),
    patents: data.patents.map((p) => resolvePatent(p, candidates)),
    testScores: data.testScores.map((t) => resolveTestScore(t, candidates)),
    recommendations: data.recommendations.map((r) => resolveRecommendation(r, candidates)),
    contact: data.contact,
    settings: resolveSettings(data.settings, candidates),
    meta: data.meta,
    resolvedLocale: displayPick?.tag ?? candidates[0] ?? '',
  };
}

function buildCandidates(
  data: Takuhon,
  locale: string | undefined,
  fallbackLocale: string | undefined,
): LocaleTag[] {
  const raw: string[] = [];
  if (locale !== undefined) raw.push(...expandRegional(locale));
  if (fallbackLocale !== undefined) raw.push(...expandRegional(fallbackLocale));
  raw.push(...expandRegional(data.settings.defaultLocale));
  if (data.settings.fallbackLocale !== undefined) {
    raw.push(...expandRegional(data.settings.fallbackLocale));
  }
  for (const tag of data.settings.availableLocales) {
    raw.push(...expandRegional(tag));
  }
  return dedupCaseInsensitive(raw);
}

function dedupCaseInsensitive(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (!isValidBcp47(tag)) continue;
    const lower = tag.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
  }
  return out;
}

function pickLocalizedWithTag(
  field: LocalizedTitle | LocalizedBody | undefined,
  candidates: LocaleTag[],
): { value: string; tag: LocaleTag } | undefined {
  if (!field) return undefined;
  for (const tag of candidates) {
    const hit = lookupCaseInsensitive(field, tag);
    if (hit !== undefined && hit.trim() !== '') {
      return { value: hit, tag };
    }
  }
  return undefined;
}

function pickLocalized(
  field: LocalizedTitle | LocalizedBody | undefined,
  candidates: LocaleTag[],
): string | undefined {
  return pickLocalizedWithTag(field, candidates)?.value;
}

/**
 * Resolve the parts of `settings` that carry localized values: `skillCategories`
 * labels (collapsed to the resolved string, falling back to the raw category id)
 * and `sectionLabels` (each override collapsed to the resolved string; an entry
 * with no matching candidate is dropped). Every other settings field —
 * including `sectionOrder` — is passed through unchanged.
 */
function resolveSettings(settings: Settings, candidates: LocaleTag[]): LocalizedSettings {
  const { skillCategories, sectionLabels, ...rest } = settings;
  const resolved: LocalizedSettings = { ...rest };
  if (skillCategories) {
    resolved.skillCategories = skillCategories.map((c) => ({
      id: c.id,
      label: pickLocalized(c.label, candidates) ?? c.id,
    }));
  }
  if (sectionLabels) {
    const out: Partial<Record<LabelKey, string>> = {};
    for (const [key, value] of Object.entries(sectionLabels)) {
      const s = pickLocalized(value, candidates);
      if (s !== undefined) out[key as LabelKey] = s;
    }
    resolved.sectionLabels = out;
  }
  return resolved;
}

function resolveProfile(
  profile: Profile,
  candidates: LocaleTag[],
  displayName: string,
): LocalizedProfile {
  const out: LocalizedProfile = { displayName };

  const tagline = pickLocalized(profile.tagline, candidates);
  if (tagline !== undefined) out.tagline = tagline;

  const bio = pickLocalized(profile.bio, candidates);
  if (bio !== undefined) out.bio = bio;

  if (profile.avatar) out.avatar = resolveAvatar(profile.avatar, candidates);
  if (profile.location) out.location = resolveAddress(profile.location, candidates);

  return out;
}

function resolveAvatar(avatar: Avatar, candidates: LocaleTag[]): LocalizedAvatar {
  const out: LocalizedAvatar = { url: avatar.url };
  const alt = pickLocalized(avatar.alt, candidates);
  if (alt !== undefined) out.alt = alt;
  return out;
}

function resolveAddress(address: Address, candidates: LocaleTag[]): LocalizedAddress {
  const out: LocalizedAddress = {};
  if (address.country !== undefined) out.country = address.country;
  if (address.region !== undefined) out.region = address.region;
  const locality = pickLocalized(address.locality, candidates);
  if (locality !== undefined) out.locality = locality;
  const display = pickLocalized(address.display, candidates);
  if (display !== undefined) out.display = display;
  return out;
}

function resolveLink(link: Link, candidates: LocaleTag[]): LocalizedLink {
  const label = pickLocalized(link.label, candidates);
  if (link.type === 'custom') {
    const out: LocalizedLink = {
      id: link.id,
      type: 'custom',
      url: link.url,
      iconUrl: link.iconUrl,
    };
    if (label !== undefined) out.label = label;
    if (link.featured !== undefined) out.featured = link.featured;
    if (link.order !== undefined) out.order = link.order;
    if (link.visibility !== undefined) out.visibility = link.visibility;
    return out;
  }
  const out: LocalizedLink = {
    id: link.id,
    type: link.type,
    url: link.url,
  };
  if (label !== undefined) out.label = label;
  if (link.featured !== undefined) out.featured = link.featured;
  if (link.order !== undefined) out.order = link.order;
  if (link.iconUrl !== undefined) out.iconUrl = link.iconUrl;
  if (link.visibility !== undefined) out.visibility = link.visibility;
  return out;
}

function resolveCareer(career: Career, candidates: LocaleTag[]): LocalizedCareer {
  const out: LocalizedCareer = {
    id: career.id,
    organization: pickLocalized(career.organization, candidates) ?? '',
    role: pickLocalized(career.role, candidates) ?? '',
    startDate: career.startDate,
  };
  const description = pickLocalized(career.description, candidates);
  if (description !== undefined) out.description = description;
  if (career.endDate !== undefined) out.endDate = career.endDate;
  if (career.isCurrent !== undefined) out.isCurrent = career.isCurrent;
  if (career.url !== undefined) out.url = career.url;
  if (career.order !== undefined) out.order = career.order;
  if (career.visibility !== undefined) out.visibility = career.visibility;
  if (career.location) out.location = resolveAddress(career.location, candidates);
  return out;
}

function resolveProject(project: Project, candidates: LocaleTag[]): LocalizedProject {
  const out: LocalizedProject = {
    id: project.id,
    title: pickLocalized(project.title, candidates) ?? '',
  };
  const role = pickLocalized(project.role, candidates);
  if (role !== undefined) out.role = role;
  const description = pickLocalized(project.description, candidates);
  if (description !== undefined) out.description = description;
  if (project.url !== undefined) out.url = project.url;
  if (project.tags !== undefined) out.tags = project.tags;
  if (project.relatedCareerId !== undefined) out.relatedCareerId = project.relatedCareerId;
  if (project.startDate !== undefined) out.startDate = project.startDate;
  if (project.endDate !== undefined) out.endDate = project.endDate;
  if (project.highlighted !== undefined) out.highlighted = project.highlighted;
  if (project.order !== undefined) out.order = project.order;
  if (project.visibility !== undefined) out.visibility = project.visibility;
  return out;
}

function resolveCertification(
  cert: Certification,
  candidates: LocaleTag[],
): LocalizedCertification {
  const out: LocalizedCertification = {
    id: cert.id,
    title: pickLocalized(cert.title, candidates) ?? '',
    issuingOrganization: pickLocalized(cert.issuingOrganization, candidates) ?? '',
    issueDate: cert.issueDate,
  };
  if (cert.expirationDate !== undefined) out.expirationDate = cert.expirationDate;
  if (cert.credentialId !== undefined) out.credentialId = cert.credentialId;
  if (cert.url !== undefined) out.url = cert.url;
  if (cert.order !== undefined) out.order = cert.order;
  if (cert.visibility !== undefined) out.visibility = cert.visibility;
  return out;
}

function resolveMembership(membership: Membership, candidates: LocaleTag[]): LocalizedMembership {
  const out: LocalizedMembership = {
    id: membership.id,
    organization: pickLocalized(membership.organization, candidates) ?? '',
    startDate: membership.startDate,
  };
  const role = pickLocalized(membership.role, candidates);
  if (role !== undefined) out.role = role;
  const description = pickLocalized(membership.description, candidates);
  if (description !== undefined) out.description = description;
  if (membership.endDate !== undefined) out.endDate = membership.endDate;
  if (membership.isCurrent !== undefined) out.isCurrent = membership.isCurrent;
  if (membership.url !== undefined) out.url = membership.url;
  if (membership.order !== undefined) out.order = membership.order;
  if (membership.visibility !== undefined) out.visibility = membership.visibility;
  return out;
}

function resolveVolunteering(v: Volunteering, candidates: LocaleTag[]): LocalizedVolunteering {
  const out: LocalizedVolunteering = {
    id: v.id,
    organization: pickLocalized(v.organization, candidates) ?? '',
    role: pickLocalized(v.role, candidates) ?? '',
    startDate: v.startDate,
  };
  const cause = pickLocalized(v.cause, candidates);
  if (cause !== undefined) out.cause = cause;
  const description = pickLocalized(v.description, candidates);
  if (description !== undefined) out.description = description;
  if (v.endDate !== undefined) out.endDate = v.endDate;
  if (v.isCurrent !== undefined) out.isCurrent = v.isCurrent;
  if (v.url !== undefined) out.url = v.url;
  if (v.order !== undefined) out.order = v.order;
  if (v.visibility !== undefined) out.visibility = v.visibility;
  return out;
}

function resolveHonor(honor: Honor, candidates: LocaleTag[]): LocalizedHonor {
  const out: LocalizedHonor = {
    id: honor.id,
    title: pickLocalized(honor.title, candidates) ?? '',
    issuer: pickLocalized(honor.issuer, candidates) ?? '',
    date: honor.date,
  };
  const description = pickLocalized(honor.description, candidates);
  if (description !== undefined) out.description = description;
  if (honor.url !== undefined) out.url = honor.url;
  if (honor.order !== undefined) out.order = honor.order;
  if (honor.visibility !== undefined) out.visibility = honor.visibility;
  return out;
}

function resolveEducation(edu: Education, candidates: LocaleTag[]): LocalizedEducation {
  const out: LocalizedEducation = {
    id: edu.id,
    institution: pickLocalized(edu.institution, candidates) ?? '',
    startDate: edu.startDate,
  };
  const degree = pickLocalized(edu.degree, candidates);
  if (degree !== undefined) out.degree = degree;
  const fieldOfStudy = pickLocalized(edu.fieldOfStudy, candidates);
  if (fieldOfStudy !== undefined) out.fieldOfStudy = fieldOfStudy;
  const description = pickLocalized(edu.description, candidates);
  if (description !== undefined) out.description = description;
  if (edu.grade !== undefined) out.grade = edu.grade;
  if (edu.endDate !== undefined) out.endDate = edu.endDate;
  if (edu.isCurrent !== undefined) out.isCurrent = edu.isCurrent;
  if (edu.url !== undefined) out.url = edu.url;
  if (edu.order !== undefined) out.order = edu.order;
  if (edu.visibility !== undefined) out.visibility = edu.visibility;
  return out;
}

function resolvePublication(pub: Publication, candidates: LocaleTag[]): LocalizedPublication {
  const out: LocalizedPublication = {
    id: pub.id,
    title: pickLocalized(pub.title, candidates) ?? '',
    date: pub.date,
  };
  const publisher = pickLocalized(pub.publisher, candidates);
  if (publisher !== undefined) out.publisher = publisher;
  const description = pickLocalized(pub.description, candidates);
  if (description !== undefined) out.description = description;
  if (pub.url !== undefined) out.url = pub.url;
  if (pub.doi !== undefined) out.doi = pub.doi;
  if (pub.coAuthors !== undefined) out.coAuthors = pub.coAuthors;
  if (pub.order !== undefined) out.order = pub.order;
  if (pub.visibility !== undefined) out.visibility = pub.visibility;
  return out;
}

function resolveLanguage(lang: Language, candidates: LocaleTag[]): LocalizedLanguage {
  const out: LocalizedLanguage = {
    id: lang.id,
    language: lang.language,
    proficiency: lang.proficiency,
  };
  const displayName = pickLocalized(lang.displayName, candidates);
  if (displayName !== undefined) out.displayName = displayName;
  if (lang.order !== undefined) out.order = lang.order;
  if (lang.visibility !== undefined) out.visibility = lang.visibility;
  return out;
}

function resolveCourse(course: Course, candidates: LocaleTag[]): LocalizedCourse {
  const out: LocalizedCourse = {
    id: course.id,
    title: pickLocalized(course.title, candidates) ?? '',
  };
  const provider = pickLocalized(course.provider, candidates);
  if (provider !== undefined) out.provider = provider;
  if (course.courseNumber !== undefined) out.courseNumber = course.courseNumber;
  const description = pickLocalized(course.description, candidates);
  if (description !== undefined) out.description = description;
  if (course.completionDate !== undefined) out.completionDate = course.completionDate;
  if (course.certificateUrl !== undefined) out.certificateUrl = course.certificateUrl;
  if (course.relatedEducationId !== undefined) out.relatedEducationId = course.relatedEducationId;
  if (course.order !== undefined) out.order = course.order;
  if (course.visibility !== undefined) out.visibility = course.visibility;
  return out;
}

function resolvePatent(patent: Patent, candidates: LocaleTag[]): LocalizedPatent {
  const out: LocalizedPatent = {
    id: patent.id,
    title: pickLocalized(patent.title, candidates) ?? '',
    patentNumber: patent.patentNumber,
    status: patent.status,
  };
  if (patent.office !== undefined) out.office = patent.office;
  const description = pickLocalized(patent.description, candidates);
  if (description !== undefined) out.description = description;
  if (patent.filingDate !== undefined) out.filingDate = patent.filingDate;
  if (patent.grantDate !== undefined) out.grantDate = patent.grantDate;
  if (patent.url !== undefined) out.url = patent.url;
  if (patent.coInventors !== undefined) out.coInventors = patent.coInventors;
  if (patent.order !== undefined) out.order = patent.order;
  if (patent.visibility !== undefined) out.visibility = patent.visibility;
  return out;
}

function resolveTestScore(testScore: TestScore, candidates: LocaleTag[]): LocalizedTestScore {
  const out: LocalizedTestScore = {
    id: testScore.id,
    title: pickLocalized(testScore.title, candidates) ?? '',
    score: testScore.score,
    date: testScore.date,
  };
  const description = pickLocalized(testScore.description, candidates);
  if (description !== undefined) out.description = description;
  if (testScore.relatedEducationId !== undefined) {
    out.relatedEducationId = testScore.relatedEducationId;
  }
  if (testScore.url !== undefined) out.url = testScore.url;
  if (testScore.order !== undefined) out.order = testScore.order;
  if (testScore.visibility !== undefined) out.visibility = testScore.visibility;
  return out;
}

function resolveRecommendation(
  recommendation: Recommendation,
  candidates: LocaleTag[],
): LocalizedRecommendation {
  const out: LocalizedRecommendation = {
    id: recommendation.id,
    body: pickLocalized(recommendation.body, candidates) ?? '',
    author: resolveRecommendationAuthor(recommendation.author, candidates),
  };
  const relationship = pickLocalized(recommendation.relationship, candidates);
  if (relationship !== undefined) out.relationship = relationship;
  if (recommendation.date !== undefined) out.date = recommendation.date;
  if (recommendation.relatedCareerId !== undefined) {
    out.relatedCareerId = recommendation.relatedCareerId;
  }
  if (recommendation.relatedEducationId !== undefined) {
    out.relatedEducationId = recommendation.relatedEducationId;
  }
  if (recommendation.order !== undefined) out.order = recommendation.order;
  if (recommendation.visibility !== undefined) out.visibility = recommendation.visibility;
  return out;
}

function resolveRecommendationAuthor(
  author: RecommendationAuthor,
  candidates: LocaleTag[],
): LocalizedRecommendationAuthor {
  const out: LocalizedRecommendationAuthor = { name: author.name };
  const headline = pickLocalized(author.headline, candidates);
  if (headline !== undefined) out.headline = headline;
  if (author.url !== undefined) out.url = author.url;
  return out;
}
