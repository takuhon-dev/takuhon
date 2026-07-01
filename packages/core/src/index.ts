/**
 * @takuhon/core — canonical JSON Schema, hand-written TypeScript types,
 * Ajv-backed validation, document normalization, and locale resolution for
 * takuhon profile data.
 *
 * Public surface (Phase 1):
 * - {@link schema}: the JSON Schema 2020-12 contract bundled with this build.
 * - {@link SCHEMA_VERSION}: the version of that schema (matches the `$id`).
 * - {@link validate} / {@link ValidationResult} / {@link ValidationError} /
 *   {@link SUPPORTED_SCHEMA_VERSIONS}: Result-style validator backed by Ajv.
 * - {@link normalize} / {@link NormalizedTakuhon}: canonicalize a validated
 *   document (sort lists by `order`, drop blank localized entries).
 * - {@link resolveLocale} / {@link LocalizedTakuhon}: collapse a multi-locale
 *   document to a single requested locale with BCP-47 regional fallback.
 * - {@link generateJsonLd} / {@link generatePersonJsonLd} /
 *   {@link generateProfilePageJsonLd}: emit Schema.org JSON-LD
 *   (`ProfilePage` wrapping `Person`) from a locale-resolved document.
 * - {@link TakuhonStorage} / {@link TakuhonAssetStorage}: persistence contracts
 *   for adapters (KV / R2 / filesystem / SQLite / …), with the
 *   {@link StorageError} / {@link NotFoundError} / {@link ConflictError}
 *   exception family for optimistic-locking and not-found signalling.
 * - {@link exportTakuhon} / {@link importTakuhon} / {@link ExportOptions} /
 *   {@link ExportedTakuhon} / {@link ImportError}: roundtrip-stable
 *   serialisation for transport (file, API response, …).
 * - {@link migrateTakuhon} / {@link Migration} / {@link migrations} /
 *   {@link MigrationError}: forward-only migration registry, chaining
 *   `0.1.0 → 0.2.0 → 0.3.0 → 0.4.0`.
 * - Domain types: {@link Takuhon} and its constituent shapes (`Profile`,
 *   `Settings`, `Career`, `Project`, `Link` discriminated union, etc.).
 */

export { schema } from './schema.js';
export type { Schema } from './schema.js';

export { SUPPORTED_SCHEMA_VERSIONS, validate } from './validate.js';
export type { ValidationError, ValidationResult } from './validate.js';

export { normalize } from './normalize.js';
export { resolveLocale } from './resolve-locale.js';
export { generateJsonLd, generatePersonJsonLd, generateProfilePageJsonLd } from './jsonld.js';

export { ImportError, exportTakuhon, importTakuhon } from './export.js';
export type { ExportOptions, ExportedTakuhon } from './export.js';

export { applyPublicPrivacyFilter } from './privacy-filter.js';

export { MigrationError, migrateTakuhon } from './migrate.js';
export { migrations } from './migrations/index.js';
export type { Migration } from './migrations/index.js';

export { ConflictError, NotFoundError, StorageError } from './storage-interface.js';
export type {
  ActivityStorage,
  AssetOptions,
  AssetRecord,
  TakuhonAssetStorage,
  TakuhonStorage,
} from './storage-interface.js';

export {
  computeLanguagePercentages,
  deriveRankTier,
  formatCodingTime,
  isActivitySnapshot,
  RANK_FULL_CODING_HOURS,
  RANK_FULL_CONTRIBUTIONS,
  RANK_TIER_THRESHOLDS,
} from './activity.js';
export type {
  ActivitySnapshot,
  CodingTime,
  ContributionCalendar,
  ContributionDay,
  LanguageBreakdown,
  RankInput,
  RankTier,
  RankTierLabel,
} from './activity.js';
export { DARK_PALETTE, LIGHT_PALETTE, renderActivitySvg } from './activity-svg.js';
export type { Palette, RenderActivitySvgOptions } from './activity-svg.js';
export { deriveCv } from './cv.js';
export type { CvDocument, CvHeader, CvSection, CvSectionKind } from './cv.js';

export { gravatarUrl } from './gravatar.js';
export type { GravatarOptions } from './gravatar.js';

export { formatDate } from './date-format.js';
export { getPresentLabel } from './ui-labels.js';

export {
  executeMcpTool,
  MCP_PROFILE_SECTIONS,
  MCP_RESOURCES,
  MCP_TOOLS,
  McpRequestError,
  readMcpResource,
} from './mcp.js';
export type {
  McpInputSchema,
  McpProfileSection,
  McpResourceDefinition,
  McpResourceResult,
  McpToolDefinition,
  McpToolResult,
} from './mcp.js';

export {
  ACCEPTED_IMAGE_MIME_TYPES,
  detectImageMime,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FRAMES,
  readImageInfo,
  stripImageMetadata,
} from './image.js';
export type { AcceptedImageMime, ImageInfo } from './image.js';

export type {
  ActivitySettings,
  Address,
  AppearanceColors,
  AppearanceSettings,
  Avatar,
  Career,
  Certification,
  Contact,
  ContentLicense,
  ContentLicenseAttribution,
  Course,
  Education,
  Honor,
  Iso3166Alpha2,
  IsoDateTime,
  Language,
  LanguageProficiency,
  Link,
  LinkBuiltin,
  LinkCustom,
  LinkType,
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
  LocalizedLinkBuiltin,
  LocalizedLinkCustom,
  LocalizedMembership,
  LocalizedPatent,
  LocalizedProfile,
  LocalizedProject,
  LocalizedPublication,
  LocalizedRecommendation,
  LocalizedRecommendationAuthor,
  LocalizedTakuhon,
  LocalizedTestScore,
  LocalizedTitle,
  LocalizedVolunteering,
  Membership,
  Meta,
  MetaPrivacy,
  NormalizedTakuhon,
  Patent,
  PatentStatus,
  Profile,
  Project,
  Publication,
  PublicVisibility,
  Recommendation,
  RecommendationAuthor,
  Settings,
  Skill,
  Slug,
  Takuhon,
  TestScore,
  Volunteering,
  YearMonth,
} from './types.js';

/**
 * Version of the takuhon schema bundled with this build of `@takuhon/core`.
 * A takuhon profile document's `schemaVersion` field must be migrate-compatible
 * with this version. See operational-lifecycle docs for the migration policy.
 */
export const SCHEMA_VERSION = '1.2.0';
