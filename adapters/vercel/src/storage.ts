/**
 * Read-only profile storage for the Vercel adapter.
 *
 * The Vercel adapter publishes a profile without a database: the canonical
 * `takuhon.json` is either bundled into the repository or fetched once from
 * `TAKUHON_DATA_URL`. Both are read-only — the public surface only ever calls
 * `getProfile()`. Writes are unsupported, so the optimistic-locking
 * `saveProfile` / `deleteProfile` methods reject; editing goes through Git
 * (edit `takuhon.json`, push, let Vercel redeploy).
 *
 * Each storage validates its document so a malformed profile fails fast — at
 * construction for the bundled case, at first request for the URL case — rather
 * than surfacing a confusing render error later.
 */

import { validate, type Takuhon, type TakuhonStorage } from '@takuhon/core';

/**
 * Opaque version token for a read-only profile. Reads never use optimistic
 * locking, so a constant is sufficient (it only feeds response ETags).
 */
const READ_ONLY_VERSION = 'read-only';

/** Raised when a write is attempted against the read-only Vercel adapter. */
class ReadOnlyError extends Error {
  constructor() {
    super('The Vercel adapter is read-only. Edit takuhon.json and redeploy to publish changes.');
    this.name = 'ReadOnlyError';
  }
}

function assertValid(profile: unknown, source: string): Takuhon {
  const result = validate(profile);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.pointer || '/'}: ${e.message}`).join('; ');
    throw new Error(`${source} is not a valid takuhon profile: ${detail}`);
  }
  return result.data;
}

/**
 * A read-only {@link TakuhonStorage} backed by an in-memory profile document,
 * typically the repository's bundled `takuhon.json`.
 *
 * The document is validated once at construction, so an invalid profile throws
 * at cold start instead of on the first request.
 */
export class BundledTakuhonStorage implements TakuhonStorage {
  readonly #profile: Takuhon;

  constructor(profile: unknown) {
    this.#profile = assertValid(profile, 'Bundled takuhon.json');
  }

  getProfile(): Promise<{ data: Takuhon; version: string }> {
    return Promise.resolve({ data: this.#profile, version: READ_ONLY_VERSION });
  }

  saveProfile(): Promise<{ version: string }> {
    return Promise.reject(new ReadOnlyError());
  }

  deleteProfile(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
}

/** Options for {@link UrlTakuhonStorage}. */
export interface UrlTakuhonStorageOptions {
  /** HTTP client. Defaults to the global `fetch`. Injectable for tests. */
  fetch?: typeof fetch;
}

/**
 * A read-only {@link TakuhonStorage} that fetches the profile once from a URL
 * (`TAKUHON_DATA_URL`) and caches it for the lifetime of the serverless
 * instance. The fetch is lazy and de-duplicated: concurrent first calls share a
 * single in-flight request, and a failed fetch clears the cache so a later
 * request can retry.
 */
export class UrlTakuhonStorage implements TakuhonStorage {
  readonly #url: string;
  readonly #fetch: typeof fetch;
  #cached?: Promise<{ data: Takuhon; version: string }>;

  constructor(url: string, options?: UrlTakuhonStorageOptions) {
    this.#url = url;
    this.#fetch = options?.fetch ?? fetch;
  }

  getProfile(): Promise<{ data: Takuhon; version: string }> {
    this.#cached ??= this.#load().catch((e: unknown) => {
      this.#cached = undefined;
      throw e;
    });
    return this.#cached;
  }

  async #load(): Promise<{ data: Takuhon; version: string }> {
    const res = await this.#fetch(this.#url);
    if (!res.ok) {
      throw new Error(`Failed to fetch TAKUHON_DATA_URL (${this.#url}): HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    return { data: assertValid(json, 'TAKUHON_DATA_URL profile'), version: READ_ONLY_VERSION };
  }

  saveProfile(): Promise<{ version: string }> {
    return Promise.reject(new ReadOnlyError());
  }

  deleteProfile(): Promise<void> {
    return Promise.reject(new ReadOnlyError());
  }
}
