/**
 * Generate Schema.org JSON-LD from a {@link LocalizedTakuhon} document.
 *
 * Emits a `ProfilePage` whose `mainEntity` is the `Person` described by the
 * input. Mapping rules follow the published schema.org mapping spec; the
 * relevant invariants are exercised by the unit tests.
 *
 * Design notes:
 * - Input is the output of `resolveLocale()`, so every localized field is
 *   already a single string. No locale fallback happens here.
 * - All optional keys are omitted (not set to `null` / `undefined`) when their
 *   source value is absent or empty, so consumers can shallow-merge or
 *   `JSON.stringify` the result without post-processing.
 * - The canonical URL surfaced as `ProfilePage.url`, `Person.@id`, and
 *   `Person.url` is derived from a single `links[]` entry: `type: 'website'`
 *   with `featured: true`. The first match wins (stable after `normalize()`).
 *   When no such link exists the three URL-bearing keys are omitted entirely;
 *   no placeholder is fabricated.
 * - `profile.tagline` is intentionally not surfaced. `description` carries
 *   `profile.bio` only, matching the spec exemplar. Phase 2 may revisit.
 * - `contact.email` is surfaced only when `contact.showEmail === true`
 *   (privacy by default).
 * - URLs pass through verbatim. Relative paths in the input remain relative
 *   in the output; absolutization is the API/UI layer's responsibility.
 * - Field insertion order on each emitted object is fixed so
 *   `JSON.stringify(result)` is deterministic for a given input.
 */

import type {
  Contact,
  LinkType,
  LocalizedAddress,
  LocalizedAvatar,
  LocalizedCareer,
  LocalizedCertification,
  LocalizedCourse,
  LocalizedEducation,
  LocalizedHonor,
  LocalizedLanguage,
  LocalizedLink,
  LocalizedMembership,
  LocalizedPatent,
  LocalizedProject,
  LocalizedPublication,
  LocalizedTakuhon,
  LocalizedVolunteering,
  Skill,
} from './types.js';

/**
 * `links[].type` values that count as identity-bearing for the purpose of
 * `Person.sameAs`. `email`, `rss`, and `custom` are excluded: they either
 * carry no identity assertion (`custom`) or are not a profile URL on a
 * third-party platform (`email`, `rss`).
 */
const SAMEAS_IDENTITY_TYPES: ReadonlySet<LinkType> = new Set<LinkType>([
  'github',
  'gitlab',
  'linkedin',
  'x',
  'mastodon',
  'bluesky',
  'instagram',
  'youtube',
  'threads',
  'facebook',
  'website',
  'blog',
]);

/**
 * Build the `Person` JSON-LD object for `data`.
 *
 * @param data A locale-resolved takuhon document.
 * @returns A Schema.org `Person` object. `@context` is included so the
 *          returned object is valid as a standalone JSON-LD document.
 */
export function generatePersonJsonLd(data: LocalizedTakuhon): object {
  const person = buildPerson(data, deriveCanonicalUrl(data));
  return { '@context': 'https://schema.org', ...person };
}

/**
 * Build the `ProfilePage` JSON-LD object for `data`, with `Person` inlined
 * as `mainEntity`.
 *
 * @param data A locale-resolved takuhon document.
 */
export function generateProfilePageJsonLd(data: LocalizedTakuhon): object {
  const canonicalUrl = deriveCanonicalUrl(data);
  const person = buildPerson(data, canonicalUrl);

  const out: Record<string, unknown> = {};
  out['@context'] = 'https://schema.org';
  out['@type'] = 'ProfilePage';
  if (canonicalUrl !== undefined) out.url = canonicalUrl;
  out.inLanguage = data.resolvedLocale;
  if (data.meta.createdAt !== undefined) out.dateCreated = data.meta.createdAt;
  if (data.meta.updatedAt !== undefined) out.dateModified = data.meta.updatedAt;
  if (data.profile.avatar !== undefined) out.primaryImageOfPage = data.profile.avatar.url;
  out.mainEntity = person;
  return out;
}

/**
 * Build the array of JSON-LD objects to embed in a single
 * `<script type="application/ld+json">` tag.
 *
 * Phase 1 emits a single-element array containing the `ProfilePage`; the
 * `Person` is inlined there as `mainEntity`. The array shape leaves room
 * for later additions (e.g. `WebSite`) without changing the public surface.
 */
export function generateJsonLd(data: LocalizedTakuhon): object[] {
  return [generateProfilePageJsonLd(data)];
}

function deriveCanonicalUrl(data: LocalizedTakuhon): string | undefined {
  const featured = data.links.find((l) => l.type === 'website' && l.featured === true);
  return featured?.url;
}

function buildPerson(data: LocalizedTakuhon, canonicalUrl: string | undefined): object {
  const {
    profile,
    careers,
    projects,
    links,
    skills,
    contact,
    certifications,
    memberships,
    volunteering,
    honors,
    education,
    publications,
    languages,
    courses,
    patents,
  } = data;

  const out: Record<string, unknown> = {};
  out['@type'] = 'Person';
  if (canonicalUrl !== undefined) out['@id'] = `${canonicalUrl}#person`;
  out.name = profile.displayName;
  if (profile.bio !== undefined) out.description = profile.bio;

  const image = buildImage(profile.avatar);
  if (image !== undefined) out.image = image;

  if (canonicalUrl !== undefined) out.url = canonicalUrl;

  const { current, past } = partitionCareers(careers);
  const roleFields = buildCurrentRoleFields(current);
  if (roleFields.jobTitle !== undefined) out.jobTitle = roleFields.jobTitle;
  if (roleFields.worksFor !== undefined) out.worksFor = roleFields.worksFor;

  const address = buildAddress(profile.location);
  if (address !== undefined) out.address = address;

  const email = buildEmail(contact);
  if (email !== undefined) out.email = email;

  const knowsAbout = buildKnowsAbout(skills);
  if (knowsAbout !== undefined) out.knowsAbout = knowsAbout;

  const knowsLanguage = buildKnowsLanguage(languages);
  if (knowsLanguage !== undefined) out.knowsLanguage = knowsLanguage;

  const hasCredential = buildCredentials(certifications);
  if (hasCredential !== undefined) out.hasCredential = hasCredential;

  const memberOf = buildMemberOf(memberships);
  if (memberOf !== undefined) out.memberOf = memberOf;

  const alumniOf = buildAlumniOf(education);
  if (alumniOf !== undefined) out.alumniOf = alumniOf;

  const award = buildAwards(honors);
  if (award !== undefined) out.award = award;

  const sameAs = buildSameAs(links);
  if (sameAs !== undefined) out.sameAs = sameAs;

  const subjectOf = [
    ...buildPastRoles(past),
    ...buildProjects(projects),
    ...buildVolunteeringRoles(volunteering),
    ...buildPublications(publications),
    ...buildCourses(courses),
    ...buildPatentWorks(patents),
  ];
  if (subjectOf.length > 0) out.subjectOf = subjectOf;

  return out;
}

function buildImage(avatar: LocalizedAvatar | undefined): object | undefined {
  if (!avatar) return undefined;
  const out: Record<string, unknown> = {};
  out['@type'] = 'ImageObject';
  out.url = avatar.url;
  if (avatar.alt !== undefined) out.caption = avatar.alt;
  return out;
}

function buildAddress(location: LocalizedAddress | undefined): object | undefined {
  if (!location) return undefined;
  const hasAny =
    location.country !== undefined ||
    location.region !== undefined ||
    location.locality !== undefined;
  if (!hasAny) return undefined;
  // `location.display` is intentionally not surfaced: it is a UI-facing
  // pre-formatted string and would duplicate the structured fields here.
  const out: Record<string, unknown> = {};
  out['@type'] = 'PostalAddress';
  if (location.country !== undefined) out.addressCountry = location.country;
  if (location.region !== undefined) out.addressRegion = location.region;
  if (location.locality !== undefined) out.addressLocality = location.locality;
  return out;
}

function partitionCareers(careers: LocalizedCareer[]): {
  current: LocalizedCareer[];
  past: LocalizedCareer[];
} {
  const current: LocalizedCareer[] = [];
  const past: LocalizedCareer[] = [];
  for (const c of careers) {
    if (c.isCurrent === true) current.push(c);
    else past.push(c);
  }
  return { current, past };
}

function buildCurrentRoleFields(current: LocalizedCareer[]): {
  jobTitle?: string;
  worksFor?: object;
} {
  const head = current[0];
  if (head === undefined) return {};
  const out: { jobTitle?: string; worksFor?: object } = {};
  if (head.role !== '') out.jobTitle = head.role;
  out.worksFor = buildWorksFor(head);
  return out;
}

function buildWorksFor(career: LocalizedCareer): object {
  const out: Record<string, unknown> = {};
  out['@type'] = 'Organization';
  out.name = career.organization;
  if (career.url !== undefined) out.url = career.url;
  return out;
}

function buildPastRoles(past: LocalizedCareer[]): object[] {
  return past.map((c) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'WorkRole';
    out.name = c.role;
    out.memberOf = { '@type': 'Organization', name: c.organization };
    out.startDate = c.startDate;
    // `null` denotes an unbounded position; omit so the published JSON-LD
    // does not carry an explicit `null`.
    if (c.endDate !== undefined && c.endDate !== null) out.endDate = c.endDate;
    return out;
  });
}

function buildProjects(projects: LocalizedProject[]): object[] {
  return projects.map((p) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'CreativeWork';
    out.name = p.title;
    if (p.url !== undefined) out.url = p.url;
    if (p.startDate !== undefined) out.datePublished = p.startDate;
    if (p.tags !== undefined && p.tags.length > 0) out.about = p.tags;
    return out;
  });
}

function buildSameAs(links: LocalizedLink[]): string[] | undefined {
  const out = links.filter((l) => SAMEAS_IDENTITY_TYPES.has(l.type)).map((l) => l.url);
  return out.length === 0 ? undefined : out;
}

function buildKnowsAbout(skills: Skill[]): string[] | undefined {
  if (skills.length === 0) return undefined;
  return skills.map((s) => s.label);
}

function buildEmail(contact: Contact): string | undefined {
  if (contact.showEmail !== true) return undefined;
  if (typeof contact.email !== 'string' || contact.email.length === 0) return undefined;
  return contact.email;
}

function buildKnowsLanguage(languages: LocalizedLanguage[]): string[] | undefined {
  if (languages.length === 0) return undefined;
  return languages.map((l) => l.language);
}

function buildCredentials(certifications: LocalizedCertification[]): object[] | undefined {
  if (certifications.length === 0) return undefined;
  return certifications.map((c) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'EducationalOccupationalCredential';
    if (c.title !== '') out.name = c.title;
    out.credentialCategory = 'certification';
    if (c.issuingOrganization !== '') {
      out.recognizedBy = {
        '@type': 'Organization',
        name: c.issuingOrganization,
      };
    }
    out.dateCreated = c.issueDate;
    if (c.expirationDate !== undefined && c.expirationDate !== null) {
      out.expires = c.expirationDate;
    }
    if (c.credentialId !== undefined) out.identifier = c.credentialId;
    if (c.url !== undefined) out.url = c.url;
    return out;
  });
}

function buildMemberOf(memberships: LocalizedMembership[]): object[] | undefined {
  if (memberships.length === 0) return undefined;
  // Schema.org Role wrapper pattern: the outer OrganizationRole
  // carries the role/date metadata; the inner `memberOf` Organization names the
  // body itself.
  return memberships.map((m) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'OrganizationRole';
    if (m.role !== undefined) out.roleName = m.role;
    out.startDate = m.startDate;
    if (m.endDate !== undefined && m.endDate !== null) out.endDate = m.endDate;
    if (m.description !== undefined) out.description = m.description;
    const org: Record<string, unknown> = { '@type': 'Organization', name: m.organization };
    if (m.url !== undefined) org.url = m.url;
    out.memberOf = org;
    return out;
  });
}

function buildAlumniOf(education: LocalizedEducation[]): object[] | undefined {
  if (education.length === 0) return undefined;
  // Schema.org Role wrapper pattern: outer OrganizationRole carries date +
  // concatenated degree/fieldOfStudy as roleName; inner `alumniOf` names
  // the EducationalOrganization.
  return education.map((e) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'OrganizationRole';
    const roleName = composeRoleName(e.degree, e.fieldOfStudy);
    if (roleName !== undefined) out.roleName = roleName;
    out.startDate = e.startDate;
    if (e.endDate !== undefined && e.endDate !== null) out.endDate = e.endDate;
    const description = composeEducationDescription(e.description, e.grade);
    if (description !== undefined) out.description = description;
    const org: Record<string, unknown> = {
      '@type': 'EducationalOrganization',
      name: e.institution,
    };
    if (e.url !== undefined) org.url = e.url;
    out.alumniOf = org;
    return out;
  });
}

function composeRoleName(
  degree: string | undefined,
  fieldOfStudy: string | undefined,
): string | undefined {
  if (degree === undefined && fieldOfStudy === undefined) return undefined;
  if (degree !== undefined && fieldOfStudy !== undefined) return `${degree} (${fieldOfStudy})`;
  return degree ?? fieldOfStudy;
}

function composeEducationDescription(
  description: string | undefined,
  grade: string | undefined,
): string | undefined {
  // `grade` may have already been stripped by the API privacy filter; if it
  // reaches us, prepend a labelled line to the description.
  if (grade !== undefined && description !== undefined) return `Grade: ${grade}. ${description}`;
  if (grade !== undefined) return `Grade: ${grade}`;
  return description;
}

function buildAwards(honors: LocalizedHonor[]): string[] | undefined {
  if (honors.length === 0) return undefined;
  return honors.map((h) => `${h.title} (${h.issuer}, ${h.date})`);
}

function buildVolunteeringRoles(volunteering: LocalizedVolunteering[]): object[] {
  return volunteering.map((v) => {
    const out: Record<string, unknown> = {};
    // Schema.org `VolunteerRole` is a pending property; we use the stable
    // `Role` type with `roleName` so indexers without VolunteerRole support
    // still read meaningful data.
    out['@type'] = 'Role';
    out.roleName = v.role;
    out.startDate = v.startDate;
    if (v.endDate !== undefined && v.endDate !== null) out.endDate = v.endDate;
    const description = composeVolunteeringDescription(v.cause, v.description);
    if (description !== undefined) out.description = description;
    const org: Record<string, unknown> = { '@type': 'Organization', name: v.organization };
    if (v.url !== undefined) org.url = v.url;
    out.memberOf = org;
    return out;
  });
}

function composeVolunteeringDescription(
  cause: string | undefined,
  description: string | undefined,
): string | undefined {
  if (cause !== undefined && description !== undefined) return `Cause: ${cause}. ${description}`;
  if (cause !== undefined) return `Cause: ${cause}`;
  return description;
}

function buildPublications(publications: LocalizedPublication[]): object[] {
  return publications.map((p) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'ScholarlyArticle';
    out.name = p.title;
    if (p.publisher !== undefined) {
      out.publisher = { '@type': 'Organization', name: p.publisher };
    }
    out.datePublished = p.date;
    if (p.url !== undefined) out.url = p.url;
    if (p.doi !== undefined) {
      out.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi };
    }
    if (p.coAuthors !== undefined && p.coAuthors.length > 0) {
      out.author = p.coAuthors.map((name) => ({ '@type': 'Person', name }));
    }
    return out;
  });
}

function buildCourses(courses: LocalizedCourse[]): object[] {
  return courses.map((c) => {
    const out: Record<string, unknown> = {};
    out['@type'] = 'Course';
    out.name = c.title;
    if (c.provider !== undefined) {
      out.provider = { '@type': 'Organization', name: c.provider };
    }
    if (c.courseNumber !== undefined) out.courseCode = c.courseNumber;
    if (c.certificateUrl !== undefined) out.url = c.certificateUrl;
    if (c.completionDate !== undefined) {
      // Schema.org Course has no direct date property; dates live on
      // CourseInstance via hasCourseInstance.
      out.hasCourseInstance = {
        '@type': 'CourseInstance',
        endDate: c.completionDate,
      };
    }
    return out;
  });
}

function buildPatentWorks(patents: LocalizedPatent[]): object[] {
  return patents.map((p) => {
    const out: Record<string, unknown> = {};
    // Schema.org Patent is not in the released vocabulary; emit CreativeWork
    // with additionalType pointing at the pending Patent URL so consumers
    // that recognize it can specialize, while others fall back gracefully.
    out['@type'] = 'CreativeWork';
    out.additionalType = 'https://schema.org/Patent';
    out.name = p.title;
    out.identifier = p.patentNumber;
    if (p.office !== undefined) {
      out.publisher = { '@type': 'Organization', name: p.office };
    }
    out.creativeWorkStatus = p.status;
    if (p.grantDate !== undefined) {
      out.datePublished = p.grantDate;
    } else if (p.filingDate !== undefined) {
      out.dateCreated = p.filingDate;
    }
    if (p.url !== undefined) out.url = p.url;
    if (p.coInventors !== undefined && p.coInventors.length > 0) {
      out.author = p.coInventors.map((name) => ({ '@type': 'Person', name }));
    }
    return out;
  });
}
