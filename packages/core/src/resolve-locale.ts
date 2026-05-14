/**
 * Reduce a multi-locale {@link Meport} document to a single requested locale.
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
 *   (#1-#4) are resolved upstream by `@meport/api` and arrive here as
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
import type {
  Address,
  Avatar,
  Career,
  Link,
  LocaleTag,
  LocalizedAddress,
  LocalizedAvatar,
  LocalizedBody,
  LocalizedCareer,
  LocalizedLink,
  LocalizedMeport,
  LocalizedProfile,
  LocalizedProject,
  LocalizedTitle,
  Meport,
  Profile,
  Project,
} from './types.js';

/**
 * Resolve a meport document to a single locale.
 *
 * @param data    A meport document (validated; ideally normalized first).
 * @param locale  Caller-resolved request locale (e.g. from `?lang=` or
 *                `Accept-Language`). Invalid tags are ignored.
 * @param fallbackLocale Caller-supplied secondary candidate when `locale`
 *                misses. Invalid tags are ignored.
 */
export function resolveLocale(
  data: Meport,
  locale?: string,
  fallbackLocale?: string,
): LocalizedMeport {
  const candidates = buildCandidates(data, locale, fallbackLocale);
  const displayPick = pickLocalizedWithTag(data.profile.displayName, candidates);

  return {
    schemaVersion: data.schemaVersion,
    profile: resolveProfile(data.profile, candidates, displayPick?.value ?? ''),
    links: data.links.map((l) => resolveLink(l, candidates)),
    careers: data.careers.map((c) => resolveCareer(c, candidates)),
    projects: data.projects.map((p) => resolveProject(p, candidates)),
    skills: data.skills,
    contact: data.contact,
    settings: data.settings,
    meta: data.meta,
    resolvedLocale: displayPick?.tag ?? candidates[0] ?? '',
  };
}

function buildCandidates(
  data: Meport,
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
  if (career.location) out.location = resolveAddress(career.location, candidates);
  return out;
}

function resolveProject(project: Project, candidates: LocaleTag[]): LocalizedProject {
  const out: LocalizedProject = {
    id: project.id,
    title: pickLocalized(project.title, candidates) ?? '',
  };
  const description = pickLocalized(project.description, candidates);
  if (description !== undefined) out.description = description;
  if (project.url !== undefined) out.url = project.url;
  if (project.tags !== undefined) out.tags = project.tags;
  if (project.relatedCareerId !== undefined) out.relatedCareerId = project.relatedCareerId;
  if (project.startDate !== undefined) out.startDate = project.startDate;
  if (project.endDate !== undefined) out.endDate = project.endDate;
  if (project.highlighted !== undefined) out.highlighted = project.highlighted;
  if (project.order !== undefined) out.order = project.order;
  return out;
}
