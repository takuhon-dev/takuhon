/**
 * Filesystem-backed {@link TakuhonAssetStorage} for the local admin server
 * (`takuhon admin`). Stores uploaded images in an `assets/` directory beside
 * the project's `takuhon.json`, so a locally-edited profile gets the same asset
 * pipeline the Cloudflare adapter provides over R2.
 *
 * Like the R2 adapter, the bytes arrive already validated and metadata-stripped
 * by `@takuhon/api`'s admin app, so this class only persists them and mints the
 * key / URL. Object keys follow `assets/{timestamp}-{shortHash}.{ext}`
 * (`security.md` §4.6) — identical to {@link R2TakuhonAssetStorage} so a profile
 * edited locally and later deployed keeps working relative `/assets/...` URLs.
 * Dimensions are read back header-only via {@link readImageInfo} (no decode).
 *
 * Delivery is the local server's job (`GET /assets/*`), so {@link readForServing}
 * exposes the bytes + content-type for that route while keeping all path
 * resolution (and the traversal guard) in one place.
 */

import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  detectImageMime,
  IMAGE_EXTENSIONS,
  NotFoundError,
  readImageInfo,
  type AcceptedImageMime,
  type AssetOptions,
  type AssetRecord,
  type TakuhonAssetStorage,
} from '@takuhon/core';

/** Directory (beside `takuhon.json`) holding uploaded assets; the key prefix. */
const ASSET_DIRNAME = 'assets';
const ASSET_KEY_PREFIX = `${ASSET_DIRNAME}/`;

/** Extension used when the bytes are not one of the accepted image types. */
const DEFAULT_EXTENSION = 'bin';

/** Reverse of {@link IMAGE_EXTENSIONS}: file extension → MIME, for delivery. */
const MIME_BY_EXTENSION = new Map<string, string>(
  Object.entries(IMAGE_EXTENSIONS).map(([mime, ext]) => [ext, mime]),
);

/** Narrow an arbitrary content-type string to an accepted image MIME, or null. */
function asAcceptedMime(value: string | undefined): AcceptedImageMime | null {
  if (value === undefined) return null;
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
    ? (value as AcceptedImageMime)
    : null;
}

/** Content-type for a stored asset filename, by extension. */
function contentTypeForFile(name: string): string {
  const ext = extname(name).slice(1).toLowerCase();
  return MIME_BY_EXTENSION.get(ext) ?? 'application/octet-stream';
}

/** Seconds since the Unix epoch, the leading object-key component. */
function timestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Four hex characters of randomness, defeating key enumeration (§4.7). */
function shortHash(): string {
  return randomBytes(2).toString('hex');
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

/**
 * Write `bytes` to `target` atomically: stage in a sibling temp file and
 * `rename` into place, so a reader (e.g. the SPA fetching the just-returned
 * `publicUrl`) never observes a half-written asset. Binary counterpart of
 * `writeFileAtomic` in `backup.ts`.
 */
function writeFileAtomicBinary(target: string, bytes: Uint8Array): void {
  const tmp = join(dirname(target), `.${basename(target)}.${String(process.pid)}.tmp`);
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, target);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

export class FileTakuhonAssetStorage implements TakuhonAssetStorage {
  private readonly profilePath: string;
  private readonly publicBaseUrl: string;

  constructor(profilePath: string, options: { publicBaseUrl?: string } = {}) {
    this.profilePath = profilePath;
    this.publicBaseUrl = options.publicBaseUrl ?? '';
  }

  // Genuinely async (awaits the Blob), so no `Promise.resolve().then()` wrap is
  // needed here — unlike the synchronous methods below.
  async putAsset(file: File | Blob, options?: AssetOptions): Promise<AssetRecord> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Trust the API-validated content-type when present; otherwise authenticate
    // from the bytes so the adapter is self-sufficient for direct callers.
    const mime = asAcceptedMime(options?.contentType) ?? detectImageMime(bytes);
    const ext = mime !== null ? IMAGE_EXTENSIONS[mime] : DEFAULT_EXTENSION;
    const contentType = mime ?? options?.contentType ?? file.type ?? 'application/octet-stream';

    const key = `${ASSET_KEY_PREFIX}${String(timestampSeconds())}-${shortHash()}.${ext}`;
    const full = join(this.projectDir, key);
    mkdirSync(dirname(full), { recursive: true });
    writeFileAtomicBinary(full, bytes);

    const info = mime !== null ? readImageInfo(bytes, mime) : null;
    const url = `/${key}`;
    return {
      id: key,
      url,
      publicUrl: this.absoluteUrl(url),
      mimeType: contentType,
      size: bytes.length,
      width: info?.width,
      height: info?.height,
      createdAt: new Date().toISOString(),
    };
  }

  getPublicUrl(assetId: string): Promise<string> {
    return Promise.resolve().then(() => {
      const full = this.resolveKey(assetId);
      if (full === null || !existsSync(full)) {
        throw new NotFoundError(`No asset is stored for "${assetId}".`);
      }
      return this.absoluteUrl(`/${assetId}`);
    });
  }

  deleteAsset(assetId: string): Promise<void> {
    return Promise.resolve().then(() => {
      const full = this.resolveKey(assetId);
      // Idempotent: a missing file (or an out-of-bounds key) is a no-op.
      if (full !== null) rmSync(full, { force: true });
    });
  }

  listAssets(): Promise<AssetRecord[]> {
    return Promise.resolve().then(() => {
      const root = join(this.projectDir, ASSET_DIRNAME);
      let names: string[];
      try {
        names = readdirSync(root);
      } catch (err) {
        if (isNotFound(err)) return [];
        throw err;
      }
      return names
        .filter((name) => statSync(join(root, name)).isFile())
        .sort()
        .map((name) => {
          const key = `${ASSET_KEY_PREFIX}${name}`;
          const url = `/${key}`;
          return {
            id: key,
            url,
            publicUrl: this.absoluteUrl(url),
            mimeType: contentTypeForFile(name),
            size: statSync(join(root, name)).size,
            createdAt: statSync(join(root, name)).mtime.toISOString(),
          };
        });
    });
  }

  /**
   * Local-server helper (not part of {@link TakuhonAssetStorage}): read an asset
   * for static delivery, or `null` when it is absent or the key escapes the
   * `assets/` directory. The traversal guard lives here so the delivery route
   * and the persistence methods share one notion of "where assets live".
   */
  readForServing(key: string): { bytes: Buffer; contentType: string } | null {
    const full = this.resolveKey(key);
    if (full === null) return null;
    let bytes: Buffer;
    try {
      bytes = readFileSync(full);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    return { bytes, contentType: contentTypeForFile(full) };
  }

  private get projectDir(): string {
    return dirname(resolve(this.profilePath));
  }

  /** Resolve an `assets/...` key to an absolute path, or null if out of bounds. */
  private resolveKey(key: string): string | null {
    const root = resolve(this.projectDir, ASSET_DIRNAME);
    const full = resolve(this.projectDir, key);
    if (full !== root && !full.startsWith(root + sep)) return null;
    return full;
  }

  private absoluteUrl(path: string): string {
    return this.publicBaseUrl !== '' ? `${this.publicBaseUrl}${path}` : path;
  }
}
