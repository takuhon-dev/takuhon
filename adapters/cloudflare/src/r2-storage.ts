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

/** Key prefix every uploaded asset lives under (`security.md` §4.6). */
const ASSET_KEY_PREFIX = 'assets/';

/** Extension used when the bytes are not one of the accepted image types. */
const DEFAULT_EXTENSION = 'bin';

/**
 * Long-lived immutable cache policy for delivered assets. Object keys embed a
 * timestamp and a random hash, so a given key never names different bytes —
 * the response can be cached forever.
 */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Narrow an arbitrary content-type string to an accepted image MIME, or null. */
function asAcceptedMime(value: string | undefined): AcceptedImageMime | null {
  if (value === undefined) return null;
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
    ? (value as AcceptedImageMime)
    : null;
}

/** Seconds since the Unix epoch, used as the leading object-key component. */
function timestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Four hex characters of cryptographic randomness. Combined with the timestamp
 * this defeats key enumeration (`security.md` §4.7) without an idempotency
 * guarantee — every upload gets a fresh key.
 */
function shortHash(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cloudflare R2 implementation of the {@link TakuhonAssetStorage} contract.
 *
 * The bytes arrive already validated and metadata-stripped by `@takuhon/api`'s
 * admin app (magic-byte check, size / dimension / frame limits, EXIF removal),
 * so this adapter only persists them and mints the public URL. Object keys
 * follow `assets/{timestamp}-{shortHash}.{ext}` (`security.md` §4.6); the file
 * extension comes from `@takuhon/core`'s {@link IMAGE_EXTENSIONS}.
 *
 * Dimensions are read back from the container header via
 * {@link readImageInfo} (no pixel decode) so the returned {@link AssetRecord}
 * is complete; this is the same header-only parse the API layer already
 * performed and matches the deliberate "no codec" approach.
 *
 * Assets are served by the Worker's `GET /assets/*` proxy route rather than a
 * public R2 bucket, so `publicUrl` is an absolute URL on the Worker's own
 * origin when `publicBaseUrl` is supplied, falling back to the relative `url`
 * otherwise.
 */
export class R2TakuhonAssetStorage implements TakuhonAssetStorage {
  private readonly bucket: R2Bucket;
  private readonly publicBaseUrl: string;

  constructor(bucket: R2Bucket, options: { publicBaseUrl?: string } = {}) {
    this.bucket = bucket;
    this.publicBaseUrl = options.publicBaseUrl ?? '';
  }

  async putAsset(file: File | Blob, options?: AssetOptions): Promise<AssetRecord> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Trust the API-validated content-type when present; otherwise authenticate
    // from the bytes so the adapter is self-sufficient for direct callers.
    const mime = asAcceptedMime(options?.contentType) ?? detectImageMime(bytes);
    const ext = mime !== null ? IMAGE_EXTENSIONS[mime] : DEFAULT_EXTENSION;
    const contentType = mime ?? options?.contentType ?? file.type ?? 'application/octet-stream';

    const key = `${ASSET_KEY_PREFIX}${String(timestampSeconds())}-${shortHash()}.${ext}`;
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });

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

  async getPublicUrl(assetId: string): Promise<string> {
    const head = await this.bucket.head(assetId);
    if (head === null) throw new NotFoundError(`No asset is stored at R2 key "${assetId}".`);
    return this.absoluteUrl(`/${assetId}`);
  }

  async deleteAsset(assetId: string): Promise<void> {
    // R2 delete is idempotent: deleting an absent key is a no-op, matching the
    // contract.
    await this.bucket.delete(assetId);
  }

  async listAssets(): Promise<AssetRecord[]> {
    const records: AssetRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: ASSET_KEY_PREFIX, cursor });
      for (const object of page.objects) {
        const url = `/${object.key}`;
        records.push({
          id: object.key,
          url,
          publicUrl: this.absoluteUrl(url),
          mimeType: object.httpMetadata?.contentType ?? 'application/octet-stream',
          size: object.size,
          createdAt: object.uploaded.toISOString(),
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return records;
  }

  private absoluteUrl(path: string): string {
    return this.publicBaseUrl !== '' ? `${this.publicBaseUrl}${path}` : path;
  }
}
