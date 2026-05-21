/**
 * @takuhon/core — canonical JSON Schema, hand-written TypeScript types,
 * Ajv-backed validation, document normalization, and locale resolution for
 * ownport profile data.
 *
 * Public surface (Phase 1):
 * - {@link schema}: the JSON Schema 2020-12 contract bundled with this build.
 * - {@link SCHEMA_VERSION}: the version of that schema (matches the `$id`).
 * - {@link validate} / {@link ValidationResult} / {@link ValidationError} /
 *   {@link SUPPORTED_SCHEMA_VERSIONS}: Result-style validator backed by Ajv.
 * - {@link normalize} / {@link NormalizedOwnport}: canonicalize a validated
 *   document (sort lists by `order`, drop blank localized entries).
 * - {@link resolveLocale} / {@link LocalizedOwnport}: collapse a multi-locale
 *   document to a single requested locale with BCP-47 regional fallback.
 * - {@link generateJsonLd} / {@link generatePersonJsonLd} /
 *   {@link generateProfilePageJsonLd}: emit Schema.org JSON-LD
 *   (`ProfilePage` wrapping `Person`) from a locale-resolved document.
 * - {@link OwnportStorage} / {@link OwnportAssetStorage}: persistence contracts
 *   for adapters (KV / R2 / filesystem / SQLite / …), with the
 *   {@link StorageError} / {@link NotFoundError} / {@link ConflictError}
 *   exception family for optimistic-locking and not-found signalling.
 * - {@link exportOwnport} / {@link importOwnport} / {@link ExportOptions} /
 *   {@link ExportedOwnport} / {@link ImportError}: roundtrip-stable
 *   serialisation for transport (file, API response, …).
 * - {@link migrateOwnport} / {@link Migration} / {@link migrations} /
 *   {@link MigrationError}: forward-only migration registry. Empty in
 *   Phase 1; first entry lands with the v0.2.0 schema bump.
 * - Domain types: {@link Ownport} and its constituent shapes (`Profile`,
 *   `Settings`, `Career`, `Project`, `Link` discriminated union, etc.).
 */

export { schema } from './schema.js';
export type { Schema } from './schema.js';

export { SUPPORTED_SCHEMA_VERSIONS, validate } from './validate.js';
export type { ValidationError, ValidationResult } from './validate.js';

export { normalize } from './normalize.js';
export { resolveLocale } from './resolve-locale.js';
export { generateJsonLd, generatePersonJsonLd, generateProfilePageJsonLd } from './jsonld.js';

export { ImportError, exportOwnport, importOwnport } from './export.js';
export type { ExportOptions, ExportedOwnport } from './export.js';

export { MigrationError, migrateOwnport } from './migrate.js';
export { migrations } from './migrations/index.js';
export type { Migration } from './migrations/index.js';

export { ConflictError, NotFoundError, StorageError } from './storage-interface.js';
export type {
  AssetOptions,
  AssetRecord,
  OwnportAssetStorage,
  OwnportStorage,
} from './storage-interface.js';

export type {
  Address,
  Avatar,
  Career,
  Contact,
  ContentLicense,
  ContentLicenseAttribution,
  Iso3166Alpha2,
  IsoDateTime,
  Link,
  LinkBuiltin,
  LinkCustom,
  LinkType,
  LocaleTag,
  LocalizedAddress,
  LocalizedAvatar,
  LocalizedBody,
  LocalizedCareer,
  LocalizedLink,
  LocalizedLinkBuiltin,
  LocalizedLinkCustom,
  LocalizedOwnport,
  LocalizedProfile,
  LocalizedProject,
  LocalizedTitle,
  Ownport,
  Meta,
  NormalizedOwnport,
  Profile,
  Project,
  Settings,
  Skill,
  Slug,
  YearMonth,
} from './types.js';

/**
 * Version of the ownport schema bundled with this build of `@takuhon/core`.
 * A ownport profile document's `schemaVersion` field must be migrate-compatible
 * with this version. See operational-lifecycle docs for the migration policy.
 */
export const SCHEMA_VERSION = '0.1.0';
