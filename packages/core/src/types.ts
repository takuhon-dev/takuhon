/**
 * TypeScript types for takuhon profile data.
 *
 * These mirror the canonical contract defined in `takuhon.schema.json`. The
 * published shape is sanity-checked at commit 1 by `__tests__/schema.test.ts`
 * (top-level keys, `$defs`, required fields, hybrid `additionalProperties`
 * splits, Spec §6 invariants) and by `__tests__/example.test.ts` (the bundled
 * fixture is assigned to `Takuhon` via a boundary cast, and per-Spec invariants
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

export interface Certification {
  id: Slug;
  title: LocalizedTitle;
  issuingOrganization: LocalizedTitle;
  issueDate: YearMonth;
  /** `null` denotes an explicit "no expiration" (permanent credential). Omit when unknown. */
  expirationDate?: YearMonth | null;
  /**
   * License or certificate number. Public exposure is controlled by
   * {@link MetaPrivacy.hideCredentialIds} (default true).
   */
  credentialId?: string;
  url?: string;
  order?: number;
}

export interface Membership {
  id: Slug;
  organization: LocalizedTitle;
  role?: LocalizedTitle;
  description?: LocalizedBody;
  startDate: YearMonth;
  /** `null` denotes ongoing membership; omit when unknown. */
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

export interface Volunteering {
  id: Slug;
  organization: LocalizedTitle;
  role: LocalizedTitle;
  cause?: LocalizedTitle;
  description?: LocalizedBody;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

export interface Honor {
  id: Slug;
  title: LocalizedTitle;
  issuer: LocalizedTitle;
  description?: LocalizedBody;
  date: YearMonth;
  url?: string;
  order?: number;
}

export interface Education {
  id: Slug;
  institution: LocalizedTitle;
  degree?: LocalizedTitle;
  fieldOfStudy?: LocalizedTitle;
  description?: LocalizedBody;
  /**
   * Free-form grade / class / GPA. Public exposure is controlled by
   * {@link MetaPrivacy.hideEducationGrades} (default true).
   */
  grade?: string;
  startDate: YearMonth;
  /** `null` denotes currently enrolled; omit when unknown. */
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

export interface Publication {
  id: Slug;
  title: LocalizedTitle;
  publisher?: LocalizedTitle;
  description?: LocalizedBody;
  date: YearMonth;
  url?: string;
  /** DOI identifier portion (e.g. '10.1145/...'); full URL goes in `url`. */
  doi?: string;
  /** Co-author names in original script. Excludes the profile owner. */
  coAuthors?: string[];
  order?: number;
}

export type LanguageProficiency = 'native' | 'fluent' | 'professional' | 'intermediate' | 'basic';

export interface Language {
  id: Slug;
  /** BCP-47 tag (e.g. 'ja', 'en', 'fr-CA'). */
  language: LocaleTag;
  /** Human-readable label per locale (e.g. `{ en: 'Japanese', fr: 'japonais' }`). */
  displayName?: LocalizedTitle;
  proficiency: LanguageProficiency;
  order?: number;
}

export interface Course {
  id: Slug;
  title: LocalizedTitle;
  provider?: LocalizedTitle;
  courseNumber?: string;
  description?: LocalizedBody;
  completionDate?: YearMonth;
  certificateUrl?: string;
  /** Optional reference to an `education[].id` for university coursework. */
  relatedEducationId?: Slug;
  order?: number;
}

export type PatentStatus = 'pending' | 'issued' | 'expired' | 'abandoned';

export interface Patent {
  id: Slug;
  title: LocalizedTitle;
  patentNumber: string;
  /** Patent office name (e.g. 'USPTO', 'JPO', 'EPO'). */
  office?: string;
  status: PatentStatus;
  description?: LocalizedBody;
  filingDate?: YearMonth;
  grantDate?: YearMonth;
  url?: string;
  coInventors?: string[];
  order?: number;
}

export interface TestScore {
  id: Slug;
  title: LocalizedTitle;
  /**
   * Free-form score string (e.g. '112 / 120', '330', 'N1 Pass', a percentile).
   * Stored verbatim; the validator does not interpret its contents.
   */
  score: string;
  /** Test date (year-month). */
  date: YearMonth;
  /** Optional reference to an `education[].id` (e.g. for a university course exam). */
  relatedEducationId?: Slug;
  description?: LocalizedBody;
  url?: string;
  order?: number;
}

export interface RecommendationAuthor {
  /** Recommender's name in its original script. Owner-curated; not verified by takuhon. */
  name: string;
  /** Recommender's title / role / organization at the time of the recommendation. */
  headline?: LocalizedTitle;
  /** Link to the recommender's profile, for external verification by the reader. */
  url?: string;
}

export interface Recommendation {
  id: Slug;
  /** The recommendation text (testimonial body). */
  body: LocalizedBody;
  author: RecommendationAuthor;
  /** How the recommender relates to the profile owner (e.g. 'managed directly'). */
  relationship?: LocalizedTitle;
  /** When the recommendation was given (year-month). */
  date?: YearMonth;
  /** Optional reference to a `careers[].id` the recommendation pertains to. */
  relatedCareerId?: Slug;
  /** Optional reference to an `education[].id` the recommendation pertains to. */
  relatedEducationId?: Slug;
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
  /** Display the 'Powered by takuhon' attribution on the rendered profile. */
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

/**
 * Privacy opt-out flags that strip personally identifying fields from public
 * API output (`GET /api/profile`, `/api/jsonld`, `/takuhon.json`). Admin
 * endpoints (`PUT /api/admin/*`, `GET /api/admin/export`) ignore these flags.
 * Privacy-by-default: omitting the object or individual flags is equivalent
 * to `true`.
 */
export interface MetaPrivacy {
  /** When true (default), strip `certifications[*].credentialId` from public responses. */
  hideCredentialIds?: boolean;
  /** When true (default), strip `education[*].grade` from public responses. */
  hideEducationGrades?: boolean;
}

export interface Meta {
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
  /** Tool that produced this document (e.g. `'Takuhon'`, `'create-takuhon@0.1.0'`). */
  generator?: string;
  contentLicense: ContentLicense;
  privacy?: MetaPrivacy;
}

/**
 * A complete takuhon profile document.
 *
 * Schema-level, the nine arrays added in 0.2.0 (`certifications` through
 * `patents`), `testScores` (0.3.0), and `recommendations` (0.4.0) are optional
 * for back-compat with older documents. At the TypeScript layer they are typed
 * as required because `validate()` and `normalize()` defensively coerce missing
 * arrays to `[]` so downstream consumers never see `undefined`.
 */
export interface Takuhon {
  schemaVersion: string;
  profile: Profile;
  links: Link[];
  careers: Career[];
  projects: Project[];
  skills: Skill[];
  certifications: Certification[];
  memberships: Membership[];
  volunteering: Volunteering[];
  honors: Honor[];
  education: Education[];
  publications: Publication[];
  languages: Language[];
  courses: Course[];
  patents: Patent[];
  testScores: TestScore[];
  recommendations: Recommendation[];
  contact: Contact;
  settings: Settings;
  meta: Meta;
}

/**
 * A {@link Takuhon} document that has been canonicalized by `normalize()`:
 * arrays sorted by `order`, and empty localized-field entries removed.
 *
 * Structurally identical to {@link Takuhon}; the alias is a documentation hook
 * for downstream consumers that want to express "must run through normalize
 * first". A nominal branded form may replace this alias in a later phase if
 * OSS adopters need the static guarantee.
 */
export type NormalizedTakuhon = Takuhon;

/**
 * Address with localized fields collapsed to single strings — the shape
 * `resolveLocale()` produces for `profile.location`.
 */
export interface LocalizedAddress {
  country?: Iso3166Alpha2;
  region?: string;
  locality?: string;
  display?: string;
}

/** Avatar with `alt` collapsed to a single string. */
export interface LocalizedAvatar {
  url: string;
  alt?: string;
}

/** Profile with every localized field collapsed to a single string. */
export interface LocalizedProfile {
  displayName: string;
  tagline?: string;
  bio?: string;
  avatar?: LocalizedAvatar;
  location?: LocalizedAddress;
}

interface LocalizedLinkCommon {
  id: Slug;
  label?: string;
  url: string;
  featured?: boolean;
  order?: number;
}

export interface LocalizedLinkBuiltin extends LocalizedLinkCommon {
  type: Exclude<LinkType, 'custom'>;
  iconUrl?: string;
}

export interface LocalizedLinkCustom extends LocalizedLinkCommon {
  type: 'custom';
  iconUrl: string;
}

/** Link with `label` collapsed to a single string. */
export type LocalizedLink = LocalizedLinkBuiltin | LocalizedLinkCustom;

/** Career with `organization`, `role`, `description` collapsed to single strings. */
export interface LocalizedCareer {
  id: Slug;
  organization: string;
  role: string;
  description?: string;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  location?: LocalizedAddress;
  order?: number;
}

/** Project with `title`, `description` collapsed to single strings. */
export interface LocalizedProject {
  id: Slug;
  title: string;
  description?: string;
  url?: string;
  tags?: string[];
  relatedCareerId?: Slug;
  startDate?: YearMonth;
  endDate?: YearMonth | null;
  highlighted?: boolean;
  order?: number;
}

/** Certification with localized fields collapsed to single strings. */
export interface LocalizedCertification {
  id: Slug;
  title: string;
  issuingOrganization: string;
  issueDate: YearMonth;
  expirationDate?: YearMonth | null;
  credentialId?: string;
  url?: string;
  order?: number;
}

/** Membership with localized fields collapsed to single strings. */
export interface LocalizedMembership {
  id: Slug;
  organization: string;
  role?: string;
  description?: string;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

/** Volunteering with localized fields collapsed to single strings. */
export interface LocalizedVolunteering {
  id: Slug;
  organization: string;
  role: string;
  cause?: string;
  description?: string;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

/** Honor with localized fields collapsed to single strings. */
export interface LocalizedHonor {
  id: Slug;
  title: string;
  issuer: string;
  description?: string;
  date: YearMonth;
  url?: string;
  order?: number;
}

/** Education with localized fields collapsed to single strings. */
export interface LocalizedEducation {
  id: Slug;
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  description?: string;
  grade?: string;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  order?: number;
}

/** Publication with localized fields collapsed to single strings. */
export interface LocalizedPublication {
  id: Slug;
  title: string;
  publisher?: string;
  description?: string;
  date: YearMonth;
  url?: string;
  doi?: string;
  coAuthors?: string[];
  order?: number;
}

/** Language entry with `displayName` collapsed to a single string. */
export interface LocalizedLanguage {
  id: Slug;
  language: LocaleTag;
  displayName?: string;
  proficiency: LanguageProficiency;
  order?: number;
}

/** Course with localized fields collapsed to single strings. */
export interface LocalizedCourse {
  id: Slug;
  title: string;
  provider?: string;
  courseNumber?: string;
  description?: string;
  completionDate?: YearMonth;
  certificateUrl?: string;
  relatedEducationId?: Slug;
  order?: number;
}

/** Patent with localized fields collapsed to single strings. */
export interface LocalizedPatent {
  id: Slug;
  title: string;
  patentNumber: string;
  office?: string;
  status: PatentStatus;
  description?: string;
  filingDate?: YearMonth;
  grantDate?: YearMonth;
  url?: string;
  coInventors?: string[];
  order?: number;
}

/** Test score with localized fields collapsed to single strings. */
export interface LocalizedTestScore {
  id: Slug;
  title: string;
  score: string;
  date: YearMonth;
  relatedEducationId?: Slug;
  description?: string;
  url?: string;
  order?: number;
}

/** Recommendation author with `headline` collapsed to a single string. */
export interface LocalizedRecommendationAuthor {
  name: string;
  headline?: string;
  url?: string;
}

/** Recommendation with localized fields collapsed to single strings. */
export interface LocalizedRecommendation {
  id: Slug;
  body: string;
  author: LocalizedRecommendationAuthor;
  relationship?: string;
  date?: YearMonth;
  relatedCareerId?: Slug;
  relatedEducationId?: Slug;
  order?: number;
}

/**
 * A takuhon document with every localized map flattened to a single string,
 * plus a `resolvedLocale` field recording which tag was actually used as the
 * head of the fallback chain. `resolveLocale()` returns this shape.
 *
 * `Skill`, `Contact`, `Settings`, and `Meta` carry no localized fields and
 * pass through unchanged.
 */
export interface LocalizedTakuhon {
  schemaVersion: string;
  profile: LocalizedProfile;
  links: LocalizedLink[];
  careers: LocalizedCareer[];
  projects: LocalizedProject[];
  skills: Skill[];
  certifications: LocalizedCertification[];
  memberships: LocalizedMembership[];
  volunteering: LocalizedVolunteering[];
  honors: LocalizedHonor[];
  education: LocalizedEducation[];
  publications: LocalizedPublication[];
  languages: LocalizedLanguage[];
  courses: LocalizedCourse[];
  patents: LocalizedPatent[];
  testScores: LocalizedTestScore[];
  recommendations: LocalizedRecommendation[];
  contact: Contact;
  settings: Settings;
  meta: Meta;
  /**
   * The locale tag that was matched first by the fallback chain and used as
   * the head of per-field resolution. Equals one of the candidates derived
   * from the request arguments or `settings`; an empty string only when no
   * candidate was usable (theoretical — `validate()` rejects such inputs).
   */
  resolvedLocale: LocaleTag;
}
