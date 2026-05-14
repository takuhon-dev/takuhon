/**
 * TypeScript types for meport profile data.
 *
 * These mirror the canonical contract defined in `meport.schema.json`. The
 * published shape is sanity-checked at commit 1 by `__tests__/schema.test.ts`
 * (top-level keys, `$defs`, required fields, hybrid `additionalProperties`
 * splits, Spec §6 invariants) and by `__tests__/example.test.ts` (the bundled
 * fixture is assigned to `Meport` via a boundary cast, and per-Spec invariants
 * are asserted at runtime). Those tests catch the kind of drift that changes
 * the published shape, but they do not enforce field-by-field parity between
 * JSON Schema `properties` and TypeScript members — that stronger guarantee
 * arrives with the Ajv-backed validator in commit 2.
 *
 * When the schema changes, update these types accordingly and add a migration
 * entry under `src/migrations/` for the next minor version.
 *
 * Public surface scope (hybrid `additionalProperties` strategy):
 *
 * - **Closed** in the schema (no forward-compatible extras): the document
 *   root, `ContentLicense`, and every `Link` variant.
 * - **Open** in the schema (`additionalProperties: true`): `Profile`,
 *   `Settings`, `Meta`, `Career`, `Project`, `Skill`, `Contact`, `Avatar`,
 *   `Address`, and the locale-keyed map shapes `LocalizedTitle` /
 *   `LocalizedBody`.
 *
 * The public TypeScript surface intentionally omits an `[key: string]: unknown`
 * index signature on the open containers. Declared properties stay accurately
 * typed regardless of the choice — what such a signature would change is
 * access to *undeclared* keys: it would let consumers spell arbitrary property
 * names without an error and force `unknown` narrowing for those reads, and it
 * would dilute IDE autocomplete on every dotted access. Keeping the types
 * focused on the canonical members preserves that ergonomics. Consumers that
 * need to attach custom fields should extend the relevant interface locally:
 *
 *     interface MyProfile extends Profile {
 *       customField: string;
 *     }
 */

/** BCP-47 language tag, e.g. 'en', 'ja', 'zh-Hant', 'pt-BR'. */
export type LocaleTag = string;

/** ISO 3166-1 alpha-2 country code, uppercase, two letters (e.g. 'JP', 'PT'). */
export type Iso3166Alpha2 = string;

/** Year-month in `YYYY-MM` format. */
export type YearMonth = string;

/** ISO 8601 date-time string (e.g. `2026-05-12T12:34:56Z`). */
export type IsoDateTime = string;

/** Identifier matching `^[a-z0-9][a-z0-9-]*$`, max 64 chars. */
export type Slug = string;

/** Map from BCP-47 locale tag to a short localized string (≤200 chars). */
export type LocalizedTitle = Record<LocaleTag, string>;

/** Map from BCP-47 locale tag to a body-length localized string (≤5000 chars). */
export type LocalizedBody = Record<LocaleTag, string>;

export type LinkType =
  | 'website'
  | 'blog'
  | 'github'
  | 'gitlab'
  | 'linkedin'
  | 'x'
  | 'mastodon'
  | 'bluesky'
  | 'instagram'
  | 'youtube'
  | 'threads'
  | 'facebook'
  | 'email'
  | 'rss'
  | 'custom';

export interface Avatar {
  url: string;
  alt?: LocalizedTitle;
}

export interface Address {
  country?: Iso3166Alpha2;
  region?: string;
  locality?: LocalizedTitle;
  display?: LocalizedTitle;
}

export interface Profile {
  displayName: LocalizedTitle;
  tagline?: LocalizedTitle;
  bio?: LocalizedBody;
  avatar?: Avatar;
  location?: Address;
}

interface LinkCommon {
  id: Slug;
  label?: LocalizedTitle;
  url: string;
  featured?: boolean;
  order?: number;
}

/**
 * A link of a built-in `type` (anything other than `'custom'`). The schema
 * permits an optional `iconUrl` on these entries — for example, to override
 * the default platform icon.
 */
export interface LinkBuiltin extends LinkCommon {
  type: Exclude<LinkType, 'custom'>;
  iconUrl?: string;
}

/**
 * A user-defined link (`type: 'custom'`). The schema requires `iconUrl` for
 * these entries; modelling that constraint as a discriminated union here lets
 * TypeScript reject `{ type: 'custom', ... }` literals that forget the icon
 * before Ajv validation runs in commit 2.
 */
export interface LinkCustom extends LinkCommon {
  type: 'custom';
  iconUrl: string;
}

/** A profile link. Discriminated on `type`; see `LinkBuiltin` / `LinkCustom`. */
export type Link = LinkBuiltin | LinkCustom;

export interface Career {
  id: Slug;
  organization: LocalizedTitle;
  role: LocalizedTitle;
  description?: LocalizedBody;
  startDate: YearMonth;
  /** `null` denotes an unbounded current position; omit if not applicable. */
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  location?: Address;
  order?: number;
}

export interface Project {
  id: Slug;
  title: LocalizedTitle;
  description?: LocalizedBody;
  url?: string;
  tags?: string[];
  relatedCareerId?: Slug;
  startDate?: YearMonth;
  endDate?: YearMonth | null;
  highlighted?: boolean;
  order?: number;
}

export interface Skill {
  id: Slug;
  label: string;
  /**
   * Recommended values (extensible): programming, design, business, communication,
   * language, music, art, sports, other.
   */
  category?: string;
  order?: number;
}

export interface Contact {
  email?: string;
  showEmail?: boolean;
  formUrl?: string;
}

export interface Settings {
  defaultLocale: LocaleTag;
  fallbackLocale?: LocaleTag;
  availableLocales: LocaleTag[];
  /** UI theme identifier. `'default'` is the built-in theme. */
  theme?: string;
  /** Display the 'Powered by meport' attribution on the rendered profile. */
  showPoweredBy?: boolean;
  /** Emit Schema.org JSON-LD on the rendered profile page. */
  enableJsonLd?: boolean;
  /** Expose the public read API endpoints. */
  enableApi?: boolean;
  /** Opt-in flag for first-party analytics. Default is false. */
  enableAnalytics?: boolean;
}

export interface ContentLicenseAttribution {
  name?: string;
  url?: string;
}

export interface ContentLicense {
  /** SPDX identifier (e.g. 'CC-BY-4.0', 'CC0-1.0') or 'Proprietary'. No default. */
  spdxId: string;
  url?: string;
  attribution?: ContentLicenseAttribution;
  rights?: string;
}

export interface Meta {
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
  /** Tool that produced this document (e.g. `'MePort'`, `'create-meport@0.1.0'`). */
  generator?: string;
  contentLicense: ContentLicense;
}

/** A complete meport profile document. */
export interface Meport {
  schemaVersion: string;
  profile: Profile;
  links: Link[];
  careers: Career[];
  projects: Project[];
  skills: Skill[];
  contact: Contact;
  settings: Settings;
  meta: Meta;
}

/**
 * A {@link Meport} document that has been canonicalized by `normalize()`:
 * arrays sorted by `order`, and empty localized-field entries removed.
 *
 * Structurally identical to {@link Meport}; the alias is a documentation hook
 * for downstream consumers that want to express "must run through normalize
 * first". A nominal branded form may replace this alias in a later phase if
 * OSS adopters need the static guarantee.
 */
export type NormalizedMeport = Meport;
