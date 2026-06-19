import {
  ConflictError,
  detectImageMime,
  exportTakuhon,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FRAMES,
  NotFoundError,
  normalize,
  readImageInfo,
  stripImageMetadata,
  validate,
  type Takuhon,
  type TakuhonAssetStorage,
  type TakuhonStorage,
  type ValidationError,
} from '@takuhon/core';
import { Hono } from 'hono';

import { ERROR_SLUGS, problemResponse, type ProblemFieldError } from '../error-envelope.js';

import type { AuditLogger } from './audit-logger.js';
import { bearerMiddleware, getActorTokenHash } from './bearer.js';
import type { CachePurger } from './cache-purger.js';
import { originMiddleware } from './origin.js';

/**
 * Defense-in-depth CSP for JSON-only responses. Nothing renders here, so
 * `'none'` everywhere is the strongest stance the spec leaves room for.
 */
const ADMIN_API_CSP = ["default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"].join(
  '; ',
);

export interface AdminApiAppDeps {
  storage: TakuhonStorage;
  /**
   * Binary-asset store for uploaded images. Optional: when omitted (e.g. a
   * static export or a deployment without R2), `POST /assets` is not registered
   * and resolves to 404, so avatars stay URL-only.
   */
  assetStorage?: TakuhonAssetStorage;
  /** Returns the configured admin token, or undefined if no secret is set. */
  getAdminToken: () => string | undefined;
  /** Allowlist of origins permitted for browser-originating admin requests. */
  getAdminOrigins: () => string[];
  cachePurger: CachePurger;
  auditLogger: AuditLogger;
}

/**
 * Map a core `ValidationError` to the RFC 7807 field-error shape. The leading
 * `#` produces a JSON Schema-style fragment reference (`#/profile/...`) that
 * matches the example in `api.md §5`.
 */
function toFieldError(e: ValidationError): ProblemFieldError {
  return { path: `#${e.pointer}`, message: e.message };
}

/**
 * Normalize an `If-Match` header value to the bare version token.
 *
 * Strips the optional `W/` weak-validator prefix before the RFC 7232
 * double-quote delimiters. Compressing CDNs (e.g. Cloudflare serving gzip/br)
 * downgrade the strong ETag we emit to a weak one (`W/"<version>"`), and a
 * browser echoes that weakened value straight back as `If-Match`. Without
 * stripping the prefix the comparison against the stored version never matches,
 * so every optimistic-locking save behind such a CDN fails with 409. The
 * weak/strong distinction is meaningless for our opaque version tokens, so
 * collapsing both forms to the raw value is the correct comparison.
 */
function stripETag(raw: string): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith('W/')) {
    trimmed = trimmed.slice(2).trim();
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Hono factory for `/api/admin/profile`. Mounted by adapters at `/api/admin`
 * (so the sub-app sees `/profile` as the route path).
 */
export function createAdminApiApp(deps: AdminApiAppDeps): Hono {
  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    h.set('x-content-type-options', 'nosniff');
    h.set('x-frame-options', 'DENY');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    h.set('content-security-policy', ADMIN_API_CSP);
    h.set('cache-control', 'private, no-store');
  });

  app.use('*', originMiddleware({ getAdminOrigins: deps.getAdminOrigins }));
  app.use(
    '*',
    bearerMiddleware({ getAdminToken: deps.getAdminToken, auditLogger: deps.auditLogger }),
  );

  app.onError((err, c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.internal,
      status: 500,
      title: 'Internal Error',
      detail: err instanceof Error ? err.message : 'Unknown failure',
    }),
  );

  app.notFound((c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.notFound,
      status: 404,
      title: 'Not Found',
      detail: `No admin route matches ${new URL(c.req.url).pathname}.`,
    }),
  );

  app.put('/profile', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return problemResponse(c, {
        slug: ERROR_SLUGS.unsupportedMediaType,
        status: 415,
        title: 'Unsupported Media Type',
        detail: `Content-Type must be application/json (got "${contentType}").`,
      });
    }

    let parsed: unknown;
    try {
      parsed = await c.req.json();
    } catch {
      return problemResponse(c, {
        slug: ERROR_SLUGS.badRequest,
        status: 400,
        title: 'Bad Request',
        detail: 'Request body is not valid JSON.',
      });
    }

    const result = validate(parsed);
    if (!result.ok) {
      return problemResponse(c, {
        slug: ERROR_SLUGS.validationFailed,
        status: 422,
        title: 'Validation Failed',
        detail: `Schema validation failed (${String(result.errors.length)} error(s)).`,
        errors: result.errors.map(toFieldError),
      });
    }

    const data: Takuhon = result.data;
    const ifMatchRaw = c.req.header('if-match');
    const ifMatch = ifMatchRaw !== undefined ? stripETag(ifMatchRaw) : undefined;

    let saved: { version: string };
    try {
      saved = await deps.storage.saveProfile(data, ifMatch);
    } catch (e) {
      if (e instanceof ConflictError) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.conflict,
          status: 409,
          title: 'Conflict',
          detail: 'Stored profile version does not match If-Match.',
          currentVersion: e.currentVersion,
        });
      }
      throw e;
    }

    await deps.cachePurger.profileUpdated();

    const updatedAt = new Date().toISOString();
    const tokenHash = await getActorTokenHash(c);
    deps.auditLogger({
      type: 'admin.profile.update',
      timestamp: updatedAt,
      actor: { tokenHash },
      request: {
        method: 'PUT',
        path: new URL(c.req.url).pathname,
        ip: c.req.header('cf-connecting-ip'),
      },
      result: { status: 200, version: saved.version },
    });

    return c.json({
      data: normalize(data),
      meta: {
        schemaVersion: data.schemaVersion,
        version: saved.version,
        updatedAt,
      },
    });
  });

  app.delete('/profile', async (c) => {
    await deps.storage.deleteProfile();
    await deps.cachePurger.profileDeleted();

    const tokenHash = await getActorTokenHash(c);
    deps.auditLogger({
      type: 'admin.profile.delete',
      timestamp: new Date().toISOString(),
      actor: { tokenHash },
      request: {
        method: 'DELETE',
        path: new URL(c.req.url).pathname,
        ip: c.req.header('cf-connecting-ip'),
      },
      result: { status: 204 },
    });

    return c.body(null, 204);
  });

  app.get('/export', async (c) => {
    let stored: { data: Takuhon; version: string };
    try {
      stored = await deps.storage.getProfile();
    } catch (e) {
      if (e instanceof NotFoundError) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.notFound,
          status: 404,
          title: 'Not Found',
          detail: 'No profile has been saved yet; there is nothing to export.',
        });
      }
      throw e;
    }

    // Token holders receive the full document: the public privacy filter is
    // intentionally bypassed here (Spec §6.21). `exportTakuhon` with
    // `updateTimestamp: false` returns the stored document verbatim (raw
    // transport form, no envelope), so the body round-trips with
    // `importTakuhon` and preserves the real `meta.updatedAt`.
    const exported = exportTakuhon(stored.data, { updateTimestamp: false });

    const tokenHash = await getActorTokenHash(c);
    deps.auditLogger({
      type: 'admin.profile.export',
      timestamp: new Date().toISOString(),
      actor: { tokenHash },
      request: {
        method: 'GET',
        path: new URL(c.req.url).pathname,
        ip: c.req.header('cf-connecting-ip'),
      },
      result: { status: 200 },
    });

    // Surface the stored version so a form-based editor can load the full
    // document and its current version in a single request, then send it back
    // as `If-Match` on the next `PUT` for optimistic locking. Quoted per
    // RFC 7232, matching the public read endpoints and `stripETag`.
    c.header('etag', `"${stored.version}"`);
    return c.json(exported);
  });

  // Image upload (security.md §4). Registered only when an asset store is
  // configured; otherwise `POST /assets` falls through to the 404 handler.
  if (deps.assetStorage) {
    const assetStorage = deps.assetStorage;
    app.post('/assets', async (c) => {
      // Coarse pre-parse guard: reject before buffering the body when the
      // declared length already exceeds the limit plus a small multipart
      // overhead. The exact check on the decoded file size happens below.
      const declared = Number(c.req.header('content-length') ?? '');
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 8192) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.payloadTooLarge,
          status: 413,
          title: 'Payload Too Large',
          detail: `Image exceeds the ${String(MAX_IMAGE_BYTES)}-byte limit.`,
        });
      }

      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return problemResponse(c, {
          slug: ERROR_SLUGS.badRequest,
          status: 400,
          title: 'Bad Request',
          detail: 'Request body must be multipart/form-data with a "file" field.',
        });
      }

      const file = form.get('file');
      if (!(file instanceof File)) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.badRequest,
          status: 400,
          title: 'Bad Request',
          detail: 'Expected an uploaded file in the "file" field.',
        });
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.payloadTooLarge,
          status: 413,
          title: 'Payload Too Large',
          detail: `Image is ${String(bytes.length)} bytes; the limit is ${String(MAX_IMAGE_BYTES)}.`,
        });
      }

      // Authenticate the type from the bytes, not the declared Content-Type.
      const mime = detectImageMime(bytes);
      if (mime === null) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.unsupportedMediaType,
          status: 415,
          title: 'Unsupported Media Type',
          detail: 'File is not an accepted image (JPEG, PNG, WebP, or GIF).',
        });
      }

      const info = readImageInfo(bytes, mime);
      if (info === null) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.validationFailed,
          status: 422,
          title: 'Validation Failed',
          detail: 'Image header could not be parsed.',
        });
      }
      if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.validationFailed,
          status: 422,
          title: 'Validation Failed',
          detail: `Image is ${String(info.width)}×${String(info.height)}px; the limit is ${String(MAX_IMAGE_DIMENSION)}×${String(MAX_IMAGE_DIMENSION)}px.`,
        });
      }
      if (info.frames > MAX_IMAGE_FRAMES) {
        return problemResponse(c, {
          slug: ERROR_SLUGS.validationFailed,
          status: 422,
          title: 'Validation Failed',
          detail: `Image has ${String(info.frames)} frames; the limit is ${String(MAX_IMAGE_FRAMES)}.`,
        });
      }

      // Strip metadata (EXIF/IPTC/XMP/color profile) before handing the bytes
      // to the adapter, which persists them verbatim.
      const stripped = stripImageMetadata(bytes, mime);
      // `Uint8Array.from` yields an ArrayBuffer-backed array (not the
      // SharedArrayBuffer-possible `ArrayBufferLike`), so it is a valid BlobPart.
      const record = await assetStorage.putAsset(
        new Blob([Uint8Array.from(stripped)], { type: mime }),
        {
          filename: file.name,
          contentType: mime,
        },
      );

      const tokenHash = await getActorTokenHash(c);
      deps.auditLogger({
        type: 'admin.asset.upload',
        timestamp: new Date().toISOString(),
        actor: { tokenHash },
        request: {
          method: 'POST',
          path: new URL(c.req.url).pathname,
          ip: c.req.header('cf-connecting-ip'),
        },
        result: { status: 201 },
        asset: { key: record.id, mimeType: mime, size: stripped.length },
      });

      return c.json(record, 201);
    });
  }

  app.on(['POST', 'PATCH'], '/profile', (c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.methodNotAllowed,
      status: 405,
      title: 'Method Not Allowed',
      detail: `${c.req.method} ${new URL(c.req.url).pathname} is not supported on the admin app.`,
    }),
  );

  return app;
}
