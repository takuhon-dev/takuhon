/**
 * @meport/core — canonical JSON Schema, hand-written TypeScript types, and
 * Ajv-backed validation for meport profile documents.
 *
 * Public surface (Phase 1):
 * - {@link schema}: the JSON Schema 2020-12 contract bundled with this build.
 * - {@link SCHEMA_VERSION}: the version of that schema (matches the `$id`).
 * - {@link validate} / {@link ValidationResult} / {@link ValidationError} /
 *   {@link SUPPORTED_SCHEMA_VERSIONS}: Result-style validator backed by Ajv.
 * - Domain types: {@link Meport} and its constituent shapes (`Profile`,
 *   `Settings`, `Career`, `Project`, `Link` discriminated union, etc.).
 *
 * Normalization, locale resolution, JSON-LD generation, storage interfaces,
 * and the migration registry are still to come in later commits.
 */

export { schema } from './schema.js';
export type { Schema } from './schema.js';

export { SUPPORTED_SCHEMA_VERSIONS, validate } from './validate.js';
export type { ValidationError, ValidationResult } from './validate.js';

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
  LocalizedBody,
  LocalizedTitle,
  Meport,
  Meta,
  Profile,
  Project,
  Settings,
  Skill,
  Slug,
  YearMonth,
} from './types.js';

/**
 * Version of the meport schema bundled with this build of `@meport/core`.
 * A meport profile document's `schemaVersion` field must be migrate-compatible
 * with this version. See operational-lifecycle docs for the migration policy.
 */
export const SCHEMA_VERSION = '0.1.0';
