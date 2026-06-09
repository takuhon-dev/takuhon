/**
 * Persistence contracts for takuhon profile documents and binary assets.
 *
 * Adapters (KV / R2 / filesystem / SQLite / …) implement these interfaces to
 * plug into `@takuhon/api`. All methods are async; failures surface as
 * exceptions in the {@link StorageError} family so the API layer can map them
 * onto RFC 7807 problem details.
 *
 * Design notes:
 * - `version` is an opaque ETag-like token (UUID, hash, monotonic counter —
 *   the adapter chooses). It powers HTTP `If-Match` style optimistic locking
 *   and is unrelated to {@link Takuhon.schemaVersion}, which describes the
 *   document's data-model version.
 * - `getProfile()` returns a raw {@link Takuhon}, not a normalized or
 *   locale-resolved one. Normalization and locale resolution belong to the
 *   API / render layer; storage only persists.
 * - `saveProfile(data, ifMatch?)` rejects with {@link ConflictError} when
 *   `ifMatch` is supplied and does not equal the current stored version.
 *   When `ifMatch` is omitted, the adapter's policy decides whether to
 *   overwrite unconditionally; per-implementation docs spell this out.
 * - `TakuhonAssetStorage` is intentionally a separate interface so deployments
 *   that don't host user-uploaded media (e.g. static export) can omit it.
 * - The naming standardises on the lowercase "Takuhon" word (cf.
 *   {@link Takuhon}, {@link LocalizedTakuhon}, `normalize`, `validate`) even
 *   where upstream documents write "Takuhon".
 */

import type { Takuhon } from './types.js';

/**
 * Persistence contract for the single profile document of a takuhon instance.
 *
 * Implementations: Cloudflare KV (Phase 3), filesystem (Phase 3+), in-memory
 * test doubles, and future SQL adapters.
 */
export interface TakuhonStorage {
  /**
   * Read the current profile document and its opaque version token.
   *
   * @throws {NotFoundError} when no profile has been saved yet.
   */
  getProfile(): Promise<{ data: Takuhon; version: string }>;

  /**
   * Replace the profile document. The returned `version` is the new opaque
   * token to supply as the next `ifMatch`.
   *
   * @param data    the document to persist (raw, not normalized)
   * @param ifMatch when set, the adapter rejects the write unless the
   *                current stored version equals this token
   * @throws {ConflictError} when `ifMatch` is supplied and does not equal
   *                         the current stored version
   */
  saveProfile(data: Takuhon, ifMatch?: string): Promise<{ version: string }>;

  /**
   * Remove the profile document. Idempotent: no error when nothing is stored.
   */
  deleteProfile(): Promise<void>;
}

/**
 * Metadata for a stored binary asset, returned by {@link TakuhonAssetStorage}.
 *
 * `url` is the relative path used inside the document (`/assets/...`);
 * `publicUrl` is the absolute URL a browser can fetch. The two are kept
 * distinct because adapters may serve assets from a different host than the
 * profile (e.g. Cloudflare R2 + custom CDN).
 */
export interface AssetRecord {
  id: string;
  url: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  /** ISO-8601 timestamp. */
  createdAt?: string;
}

/**
 * Caller hints for {@link TakuhonAssetStorage.putAsset}. Both fields are
 * optional; when omitted, the adapter falls back to the `File` / `Blob`
 * metadata.
 *
 * The caller (`@takuhon/api`'s admin app) verifies the magic bytes, enforces
 * the size / dimension / frame limits, and strips metadata (EXIF / IPTC / XMP /
 * color profile) before calling `putAsset`, using the shared `@takuhon/core`
 * image helpers, so every adapter applies the same checks. An adapter therefore
 * persists the already-validated, already-stripped bytes verbatim and is
 * responsible only for storage and key/URL generation.
 */
export interface AssetOptions {
  filename?: string;
  contentType?: string;
}

/**
 * Persistence contract for binary assets (avatars, project images, …).
 *
 * `listAssets()` is unbounded by design for the MVP; later phases may
 * introduce paginated semantics with a different return shape. `getPublicUrl()`
 * takes only an `assetId` today; a future options object (e.g. `expiresIn`
 * for signed URLs) would be added in a backward-compatible way.
 */
export interface TakuhonAssetStorage {
  putAsset(file: File | Blob, options?: AssetOptions): Promise<AssetRecord>;
  /** @throws {NotFoundError} when no asset exists for `assetId`. */
  getPublicUrl(assetId: string): Promise<string>;
  /** Idempotent: no error when the asset is already absent. */
  deleteAsset(assetId: string): Promise<void>;
  listAssets(): Promise<AssetRecord[]>;
}

/**
 * Base class for errors thrown by storage adapters. Catch this to handle
 * any storage-layer failure uniformly; check `instanceof` of a subclass
 * (e.g. {@link NotFoundError}, {@link ConflictError}) to discriminate.
 */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}

/** Thrown when a requested resource (profile or asset) does not exist. */
export class NotFoundError extends StorageError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when an optimistic-locking precondition fails: the caller supplied
 * an `ifMatch` token that does not equal the current stored version.
 *
 * `currentVersion` (when set) carries the actual current version so the
 * caller can decide between refetch-and-retry and surfacing a 409 to the
 * end user without an extra round trip.
 */
export class ConflictError extends StorageError {
  readonly currentVersion?: string;

  constructor(message: string, options?: { currentVersion?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'ConflictError';
    this.currentVersion = options?.currentVersion;
  }
}
