/**
 * Generate Schema.org JSON-LD from a {@link LocalizedMeport} document.
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
  LocalizedLink,
  LocalizedMeport,
  LocalizedProject,
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
 * @param data A locale-resolved meport document.
 * @returns A Schema.org `Person` object. `@context` is included so the
 *          returned object is valid as a standalone JSON-LD document.
 */
export function generatePersonJsonLd(data: LocalizedMeport): object {
  const person = buildPerson(data, deriveCanonicalUrl(data));
  return { '@context': 'https://schema.org', ...person };
}

/**
 * Build the `ProfilePage` JSON-LD object for `data`, with `Person` inlined
 * as `mainEntity`.
 *
 * @param data A locale-resolved meport document.
 */
export function generateProfilePageJsonLd(data: LocalizedMeport): object {
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
export function generateJsonLd(data: LocalizedMeport): object[] {
  return [generateProfilePageJsonLd(data)];
}

function deriveCanonicalUrl(data: LocalizedMeport): string | undefined {
  const featured = data.links.find((l) => l.type === 'website' && l.featured === true);
  return featured?.url;
}

function buildPerson(data: LocalizedMeport, canonicalUrl: string | undefined): object {
  const { profile, careers, projects, links, skills, contact } = data;

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

  const sameAs = buildSameAs(links);
  if (sameAs !== undefined) out.sameAs = sameAs;

  const subjectOf = [...buildPastRoles(past), ...buildProjects(projects)];
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
