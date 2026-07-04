/**
 * TypeScript types for takuhon profile data.
 *
 * These mirror the canonical contract defined in `takuhon.schema.json`. The
 * published shape is sanity-checked at commit 1 by `__tests__/schema.test.ts`
 * (top-level keys, `$defs`, required fields, the closed `additionalProperties`
 * contract, Spec §6 invariants) and by `__tests__/example.test.ts` (the bundled
 * fixture is assigned to `Takuhon` via a boundary cast, and per-Spec invariants
 * are asserted at runtime). Those tests catch the kind of drift that changes
 * the published shape, but they do not enforce field-by-field parity between
 * JSON Schema `properties` and TypeScript members — that stronger guarantee
 * arrives with the Ajv-backed validator in commit 2.
 *
 * When the schema changes, update these types accordingly and add a migration
 * entry under `src/migrations/` for the next minor version.
 *
 * `additionalProperties` policy (schema 1.0.0 — precise contract):
 *
 * Every object in the contract is **closed** (`additionalProperties: false`):
 * the document root, `ContentLicense`, every `Link` variant, `PublicVisibility`,
 * `ActivitySettings`, and — reversing the pre-1.0 hybrid strategy — every
 * content entity (`Profile`, `Career`, `Project`, `Skill`, `Education`, …)
 * plus `Settings`, `Meta`, and `MetaPrivacy`. An undeclared property (a
 * misspelled `tittle`) is therefore a validation error rather than silently
 * dropped data. The only intentionally open shapes are the locale-keyed maps
 * `LocalizedTitle` / `LocalizedBody`, whose keys are arbitrary BCP-47 tags
 * constrained by `propertyNames` with the value schema bounding each entry.
 *
 * This is the canonical "precise contract" stance: the schema fully defines the
 * accepted shape, so the JSON-LD and MCP surfaces that AI agents and search
 * engines read are trustworthy. The closure is deliberate and, for the 1.x
 * line, treated as irreversible-by-default — a future minor can re-open
 * extension space *non-breakingly* via `patternProperties: { "^x-": {} }` (the
 * OpenAPI `x-` convention) should adopter demand appear, without ever loosening
 * the contract retroactively.
 *
 * The public TypeScript surface therefore omits any `[key: string]: unknown`
 * index signature: declared properties stay accurately typed and IDE
 * autocomplete is not diluted. Consumers that need to carry their own data
 * alongside a profile should keep it in a sibling structure rather than
 * smuggling undeclared keys into the contract — schema 1.0.0 now rejects them.
 */

import type { LabelKey, SectionKey } from './sections.js';

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

/**
 * Per-item public visibility (added in 0.7.0). A content item (a link, career,
 * project, … — any element of a content-section array) set to `'private'` is
 * stripped from every public surface (`GET /`, `/api/profile`, `/api/jsonld`,
 * `/takuhon.json`, MCP, and the derived CV) by `applyPublicPrivacyFilter`, while
 * remaining editable through the authenticated admin export. An absent value —
 * or `'public'` — keeps the item public, so the default is all-visible and
 * omitting it is fully backwards-compatible. This is the item-level analogue of
 * the section-level {@link PublicVisibility}.
 */
export type Visibility = 'public' | 'private';

/** Mixin for content items that support a per-item {@link Visibility} flag. */
export interface VisibilityControlled {
  visibility?: Visibility;
}

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

interface LinkCommon extends VisibilityControlled {
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

export interface Career extends VisibilityControlled {
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

export interface Project extends VisibilityControlled {
  id: Slug;
  title: LocalizedTitle;
  /**
   * The owner's role/relationship on this project (added in 1.4.0), e.g.
   * "Author & lead maintainer". Rendered as a short line under the title.
   * Localized, like {@link Career.role}.
   */
  role?: LocalizedTitle;
  description?: LocalizedBody;
  url?: string;
  tags?: string[];
  relatedCareerId?: Slug;
  startDate?: YearMonth;
  endDate?: YearMonth | null;
  highlighted?: boolean;
  order?: number;
}

export interface Skill extends VisibilityControlled {
  id: Slug;
  /**
   * Skill name. A plain `string` is locale-independent; a {@link LocalizedTitle}
   * map (added in 1.4.0) resolves per request locale. The map form is purely
   * additive — existing single-string labels stay valid.
   */
  label: string | LocalizedTitle;
  /**
   * Recommended values (extensible): programming, design, business, communication,
   * language, music, art, sports, other.
   */
  category?: string;
  order?: number;
}

export interface Certification extends VisibilityControlled {
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

export interface Membership extends VisibilityControlled {
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

export interface Volunteering extends VisibilityControlled {
  id: Slug;
  organization: LocalizedTitle;
  role: LocalizedTitle;
  cause?: LocalizedTitle;
  description?: LocalizedBody;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  /** An optional second link (added in 1.4.0), e.g. the organization's GitHub org page. */
  secondaryLink?: SecondaryLink;
  order?: number;
}

/**
 * A supplementary link with an optional localized label (added in 1.4.0). Used by
 * {@link Volunteering.secondaryLink}. The renderer resolves the brand glyph from
 * the URL host and, when {@link SecondaryLink.label} is absent, derives a display
 * label from the host too.
 */
export interface SecondaryLink {
  url: string;
  label?: LocalizedTitle;
}

export interface Honor extends VisibilityControlled {
  id: Slug;
  title: LocalizedTitle;
  issuer: LocalizedTitle;
  description?: LocalizedBody;
  date: YearMonth;
  url?: string;
  order?: number;
}

export interface Education extends VisibilityControlled {
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

export interface Publication extends VisibilityControlled {
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

export interface Language extends VisibilityControlled {
  id: Slug;
  /** BCP-47 tag (e.g. 'ja', 'en', 'fr-CA'). */
  language: LocaleTag;
  /** Human-readable label per locale (e.g. `{ en: 'Japanese', fr: 'japonais' }`). */
  displayName?: LocalizedTitle;
  proficiency: LanguageProficiency;
  order?: number;
}

export interface Course extends VisibilityControlled {
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

export interface Patent extends VisibilityControlled {
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

export interface TestScore extends VisibilityControlled {
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

export interface Recommendation extends VisibilityControlled {
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

/**
 * One curated "selected post" (added in 1.4.0), rendered as a card in the
 * highlights carousel: a hand-picked link to an off-site post (Instagram, X, a
 * blog, a talk, …) with a self-hosted thumbnail — deliberately not an automated
 * social feed. It appears on the public page, `/api/profile`, `/takuhon.json`,
 * and MCP, but is intentionally omitted from JSON-LD and the derived CV (no
 * natural vocabulary / résumé slot for it).
 */
export interface Highlight extends VisibilityControlled {
  id: Slug;
  /**
   * Free-form source platform (e.g. `'instagram'`, `'x'`, `'github'`, `'blog'`,
   * `'event'`). A value with a matching brand glyph renders a badge icon; others
   * fall back to a text badge. Not an enum, so new platforms need no schema
   * change.
   */
  platform: string;
  /** Permalink to the original post; the card links here. */
  url: string;
  /**
   * Self-hosted thumbnail, as an absolute URL or a root-relative path (like
   * {@link Avatar.url}). Serving the asset is the deployment's responsibility.
   */
  image: string;
  /** Required alt text for the thumbnail — the card must not rely on the image alone. */
  alt: LocalizedTitle;
  /** Localized card title / caption. */
  title: LocalizedTitle;
  /** Optional localized supporting text shown under the title. */
  description?: LocalizedBody;
  /** Optional post date, ISO `YYYY-MM-DD` (a full date, unlike the YYYY-MM used elsewhere). */
  postedAt?: string;
  tags?: string[];
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
  /** Opt-in developer-activity dashboard configuration (added in 0.5.0). */
  activity?: ActivitySettings;
  /** Per-section public visibility (added in 0.6.0). Absent = all sections visible. */
  publicVisibility?: PublicVisibility;
  /** Opt-in contact form (added in 1.1.0). Absent = no contact form. */
  contact?: ContactSettings;
  /** Opt-in design tokens for the rendered profile (added in 1.2.0). Absent = built-in defaults. */
  appearance?: AppearanceSettings;
  /**
   * Ordered skill-category display groups (added in 1.3.0). When present, the
   * rendered profile groups skills by their `category` under these localized
   * headings, in array order; absent = the flat skill list. A skill whose
   * `category` is unlisted (or absent) renders in a trailing group.
   */
  skillCategories?: SkillCategory[];
  /**
   * Explicit section display order (added in 1.4.0). A partial list is allowed:
   * any renderable section not named here follows, in the default order. Absent
   * = the default order. Keys are the canonical {@link SectionKey}s.
   */
  sectionOrder?: SectionKey[];
  /**
   * Localized overrides for section headings and chrome labels (added in 1.4.0).
   * A partial map keyed by {@link LabelKey}; the renderer merges it over the
   * built-in locale pack and under a per-request override, so an owner can
   * retitle any section or chrome label straight from `takuhon.json`. Absent =
   * the built-in labels.
   */
  sectionLabels?: SectionLabelOverrides;
  /**
   * Localized intro line shown under the highlights section heading (added in
   * 1.4.0). Absent = no intro line.
   */
  highlightsIntro?: LocalizedTitle;
}

/** Localized label overrides for {@link Settings.sectionLabels}. */
export type SectionLabelOverrides = Partial<Record<LabelKey, LocalizedTitle>>;

/**
 * One skill-category display group (added in 1.3.0). Maps a `Skill.category`
 * value to a localized heading; the array position in {@link
 * Settings.skillCategories} defines the group's display order.
 */
export interface SkillCategory {
  /** Matches the `category` value on the skills that belong to this group. */
  id: string;
  /** Localized display heading for the group. */
  label: LocalizedTitle;
}

/**
 * Opt-in design tokens for the rendered profile (added in 1.2.0).
 *
 * A declarative re-skin seam: owners override the standard renderer's built-in
 * color and font defaults. This is a token map only — never arbitrary CSS — so
 * every value is length- and pattern-constrained (see the schema) and cannot
 * break out of the inline `<style>`. Overriding tokens re-skins the page but
 * cannot re-layout it; spacing, radius, and the type scale are intentionally
 * not exposed. An absent block leaves the built-in defaults unchanged.
 */
export interface AppearanceSettings {
  /** CSS font-family stack for the page body, e.g. `"Inter, system-ui, sans-serif"`. */
  fontFamily?: string;
  /** Light-mode (`:root`) color overrides. */
  colors?: AppearanceColors;
  /**
   * Dark-mode (`prefers-color-scheme: dark`) color overrides. Until the
   * standard renderer ships a default dark palette, only the keys set here
   * change in dark mode.
   */
  colorsDark?: AppearanceColors;
}

/**
 * Overridable color tokens (added in 1.2.0). Each value is a CSS color (hex,
 * `rgb()`/`rgba()`, `hsl()`/`hsla()`, or a named color); CSS-structural
 * characters are disallowed so a value cannot escape the inline `<style>`.
 */
export interface AppearanceColors {
  /** Page background. */
  bg?: string;
  /** Raised surfaces such as skill/tag chips. */
  surface?: string;
  /** Primary body text. */
  text?: string;
  /** Secondary/muted text (taglines, meta, captions). */
  textMuted?: string;
  /** Hairline borders and rules. */
  border?: string;
  /** Accent color for emphasis and focus affordances. */
  accent?: string;
  /** Primary interactive color, e.g. links. */
  primary?: string;
  /** Foreground color used on top of the primary color. */
  primaryContrast?: string;
  /**
   * Heading color for the "About" section's Markdown sub-headings (`##`/`###`).
   * Defaults to a deep indigo (light) / soft indigo (dark) so sub-headings stand
   * out from body text; override to re-tint them.
   */
  heading?: string;
}

/**
 * Owner-curated configuration for the opt-in contact form (added in 1.1.0).
 * Only public values live here: the Turnstile **site key** is safe to embed in
 * the page. The Turnstile secret, the recipient address, and the From label are
 * provisioned out of band as environment configuration and are never stored in
 * `takuhon.json`. Adapters that support the form mount the widget and a POST
 * endpoint when {@link enabled} is true; adapters that do not simply ignore it.
 */
export interface ContactSettings {
  /** Master switch; no contact form is mounted when false (the default). */
  enabled?: boolean;
  /** Public Cloudflare Turnstile site key, safe to embed; required to mount the widget. */
  turnstileSiteKey?: string;
  /** Override the POST endpoint the widget submits to. Defaults to `/api/contact` (same origin). */
  endpoint?: string;
  /** Subject prefix for the delivered email, e.g. `"[example.com contact]"`. */
  subjectPrefix?: string;
}

/**
 * Per-section public/private visibility (added in 0.6.0).
 *
 * Each key names a content section. Setting it to `false` hides that whole
 * section from every public surface (`GET /`, `/api/profile`, `/api/jsonld`,
 * `/takuhon.json`, MCP, and the derived CV) through the shared
 * {@link applyPublicPrivacyFilter}. An absent key — or an absent object —
 * means the section is public, so the default is all-visible and omitting this
 * block is fully backwards-compatible.
 *
 * The profile identity (`profile.displayName`, …) is always public and is
 * intentionally not representable here. Field-level controls
 * (`contact.showEmail`, `meta.privacy.*`) still apply within a visible section:
 * a field is public only when the feature toggle, this section flag, and the
 * field flag all allow it (AND composition).
 */
export interface PublicVisibility {
  links?: boolean;
  careers?: boolean;
  projects?: boolean;
  skills?: boolean;
  certifications?: boolean;
  memberships?: boolean;
  volunteering?: boolean;
  honors?: boolean;
  education?: boolean;
  publications?: boolean;
  languages?: boolean;
  courses?: boolean;
  patents?: boolean;
  testScores?: boolean;
  recommendations?: boolean;
  highlights?: boolean;
  contact?: boolean;
}

/**
 * Owner-curated configuration for the developer-activity dashboard (GitHub /
 * WakaTime). Secrets (API tokens) are provisioned out of band and never stored
 * here; the synced metrics live in a separate document, not in `takuhon.json`.
 */
export interface ActivitySettings {
  /** Master switch; the section is hidden when false (the default). */
  enabled?: boolean;
  github?: {
    /** GitHub login whose public activity is summarized. */
    username: string;
    showLanguages?: boolean;
    showContributions?: boolean;
  };
  wakatime?: {
    /** WakaTime username whose coding-time stats are summarized. */
    username: string;
    showCodingTime?: boolean;
  };
  /** Display the derived activity rank / badge. */
  showRank?: boolean;
  /** Advisory refresh cadence in hours (the real cadence is the sync schedule). */
  refreshHintHours?: number;
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
  highlights: Highlight[];
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

interface LocalizedLinkCommon extends VisibilityControlled {
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
export interface LocalizedCareer extends VisibilityControlled {
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
export interface LocalizedProject extends VisibilityControlled {
  id: Slug;
  title: string;
  /** Resolved {@link Project.role} for the active locale (added in 1.4.0). */
  role?: string;
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
export interface LocalizedCertification extends VisibilityControlled {
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
export interface LocalizedMembership extends VisibilityControlled {
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

/** {@link SecondaryLink} with its localized label collapsed to a single string. */
export interface LocalizedSecondaryLink {
  url: string;
  label?: string;
}

/** Volunteering with localized fields collapsed to single strings. */
export interface LocalizedVolunteering extends VisibilityControlled {
  id: Slug;
  organization: string;
  role: string;
  cause?: string;
  description?: string;
  startDate: YearMonth;
  endDate?: YearMonth | null;
  isCurrent?: boolean;
  url?: string;
  secondaryLink?: LocalizedSecondaryLink;
  order?: number;
}

/** Honor with localized fields collapsed to single strings. */
export interface LocalizedHonor extends VisibilityControlled {
  id: Slug;
  title: string;
  issuer: string;
  description?: string;
  date: YearMonth;
  url?: string;
  order?: number;
}

/** Education with localized fields collapsed to single strings. */
export interface LocalizedEducation extends VisibilityControlled {
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
export interface LocalizedPublication extends VisibilityControlled {
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
export interface LocalizedLanguage extends VisibilityControlled {
  id: Slug;
  language: LocaleTag;
  displayName?: string;
  proficiency: LanguageProficiency;
  order?: number;
}

/** Course with localized fields collapsed to single strings. */
export interface LocalizedCourse extends VisibilityControlled {
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
export interface LocalizedPatent extends VisibilityControlled {
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
export interface LocalizedTestScore extends VisibilityControlled {
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
export interface LocalizedRecommendation extends VisibilityControlled {
  id: Slug;
  body: string;
  author: LocalizedRecommendationAuthor;
  relationship?: string;
  date?: YearMonth;
  relatedCareerId?: Slug;
  relatedEducationId?: Slug;
  order?: number;
}

/** Highlight with `alt`, `title`, `description` collapsed to single strings. */
export interface LocalizedHighlight extends VisibilityControlled {
  id: Slug;
  platform: string;
  url: string;
  image: string;
  alt: string;
  title: string;
  description?: string;
  postedAt?: string;
  tags?: string[];
  order?: number;
}

/**
 * {@link Skill} after locale resolution: its `label` — a plain string or a
 * localized map — collapsed to the single resolved string. Every other field
 * passes through unchanged.
 */
export interface LocalizedSkill extends VisibilityControlled {
  id: Slug;
  label: string;
  category?: string;
  order?: number;
}

/**
 * One skill-category group after locale resolution: the localized `label` map
 * collapsed to the single resolved string. See {@link SkillCategory}.
 */
export interface LocalizedSkillCategory {
  id: string;
  label: string;
}

/**
 * {@link Settings} after locale resolution. Identical to the raw settings
 * except `skillCategories` labels are collapsed to single resolved strings
 * ({@link LocalizedSkillCategory}); every other settings field is passed
 * through unchanged.
 */
export type LocalizedSettings = Omit<
  Settings,
  'skillCategories' | 'sectionLabels' | 'highlightsIntro'
> & {
  skillCategories?: LocalizedSkillCategory[];
  /** {@link Settings.sectionLabels} with each value collapsed to the resolved string. */
  sectionLabels?: Partial<Record<LabelKey, string>>;
  /** {@link Settings.highlightsIntro} collapsed to the resolved string. */
  highlightsIntro?: string;
};

/**
 * A takuhon document with every localized map flattened to a single string,
 * plus a `resolvedLocale` field recording which tag was actually used as the
 * head of the fallback chain. `resolveLocale()` returns this shape.
 *
 * `Contact` and `Meta` carry no localized fields and pass through unchanged;
 * `Settings` passes through too, except its `skillCategories` labels are
 * resolved to the single locale string (see {@link LocalizedSettings}). `Skill`
 * becomes {@link LocalizedSkill} once its `label` can be a localized map (1.4.0).
 */
export interface LocalizedTakuhon {
  schemaVersion: string;
  profile: LocalizedProfile;
  links: LocalizedLink[];
  careers: LocalizedCareer[];
  projects: LocalizedProject[];
  skills: LocalizedSkill[];
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
  highlights: LocalizedHighlight[];
  contact: Contact;
  settings: LocalizedSettings;
  meta: Meta;
  /**
   * The locale tag that was matched first by the fallback chain and used as
   * the head of per-field resolution. Equals one of the candidates derived
   * from the request arguments or `settings`; an empty string only when no
   * candidate was usable (theoretical — `validate()` rejects such inputs).
   */
  resolvedLocale: LocaleTag;
}
