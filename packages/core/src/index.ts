/**
 * @meport/core — JSON Schema, validation, normalization, locale resolution, and JSON-LD.
 *
 * Phase 1 commit 1 ships the canonical schema and TypeScript types. Validation,
 * normalization, locale resolution, JSON-LD generation, storage interfaces, and
 * the migration registry land in subsequent commits.
 */

export { schema } from './schema.js';
export type { Schema } from './schema.js';

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
