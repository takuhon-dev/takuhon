import type { Takuhon } from '@takuhon/core';
import type { AdminSaveOutcome, AssetUploadResult } from '@takuhon/ui/admin';

/** Outcome of loading the stored document. */
export type LoadResult =
  | { kind: 'ok'; doc: Takuhon }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string };

export interface AdminClient {
  /** GET the full stored document plus its version (held for optimistic locking). */
  load: () => Promise<LoadResult>;
  /** PUT the document with `If-Match`, mapping the response to an editor outcome. */
  save: (doc: Takuhon) => Promise<AdminSaveOutcome>;
  /** POST an image to `/api/admin/assets`, mapping the response to an upload outcome. */
  uploadAsset: (file: File) => Promise<AssetUploadResult>;
}

interface ProblemBody {
  errors?: { path: string; message: string }[];
}

/**
 * Browser client for the takuhon admin API (`api.md §4`). Talks to the
 * same-origin endpoints by default; the Bearer token is held in this closure
 * and sent via the `Authorization` header (never a cookie, so CSRF is avoided
 * structurally — `security.md §2.6`). The stored version is tracked across
 * `load`/`save` so writes carry `If-Match`.
 */
export function createAdminClient(opts: { token: string; baseUrl?: string }): AdminClient {
  const base = (opts.baseUrl ?? '').replace(/\/+$/, '');
  const authHeader = `Bearer ${opts.token}`;
  let etag: string | null = null;

  const load = async (): Promise<LoadResult> => {
    let res: Response;
    try {
      res = await fetch(`${base}/api/admin/export`, {
        headers: { authorization: authHeader },
      });
    } catch {
      return { kind: 'error', message: 'Network request failed.' };
    }
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 403) return { kind: 'error', message: 'Origin is not allowed.' };
    if (res.status === 404) {
      etag = null;
      return { kind: 'empty' };
    }
    if (!res.ok) return { kind: 'error', message: `Unexpected status ${String(res.status)}.` };
    etag = res.headers.get('etag');
    const doc = (await res.json()) as Takuhon;
    return { kind: 'ok', doc };
  };

  const save = async (doc: Takuhon): Promise<AdminSaveOutcome> => {
    const headers: Record<string, string> = {
      authorization: authHeader,
      'content-type': 'application/json',
    };
    if (etag) headers['if-match'] = etag;

    let res: Response;
    try {
      res = await fetch(`${base}/api/admin/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(doc),
      });
    } catch {
      return { status: 'error', message: 'Network request failed.' };
    }

    if (res.status === 401 || res.status === 403) {
      return { status: 'error', message: 'Not authorized. Check the admin token.' };
    }
    if (res.status === 409) return { status: 'conflict' };
    if (res.status === 422) {
      const body = (await res.json().catch(() => null)) as ProblemBody | null;
      return { status: 'invalid', errors: body?.errors ?? [] };
    }
    if (!res.ok) return { status: 'error', message: `Unexpected status ${String(res.status)}.` };

    const body = (await res.json()) as { meta?: { version?: string } };
    const version = body.meta?.version;
    if (version) etag = `"${version}"`;
    return { status: 'saved', version };
  };

  const uploadAsset = async (file: File): Promise<AssetUploadResult> => {
    const form = new FormData();
    form.set('file', file);

    let res: Response;
    try {
      // Do not set Content-Type: the browser adds the multipart boundary.
      res = await fetch(`${base}/api/admin/assets`, {
        method: 'POST',
        headers: { authorization: authHeader },
        body: form,
      });
    } catch {
      return { status: 'error', message: 'Network request failed.' };
    }

    if (res.status === 401 || res.status === 403) {
      return { status: 'error', message: 'Not authorized. Check the admin token.' };
    }
    if (res.status === 404 || res.status === 405) {
      return { status: 'error', message: 'Image uploads are not enabled on this server.' };
    }
    if (res.status === 413) {
      return { status: 'error', message: 'Image is too large (the limit is 5 MB).' };
    }
    if (res.status === 415) {
      return { status: 'error', message: 'Unsupported image type (use JPEG, PNG, WebP, or GIF).' };
    }
    if (res.status === 422) {
      return { status: 'error', message: 'Image could not be processed (check its dimensions).' };
    }
    if (!res.ok) return { status: 'error', message: `Unexpected status ${String(res.status)}.` };

    const body = (await res.json()) as { url?: string; publicUrl?: string };
    if (!body.url || !body.publicUrl) {
      return { status: 'error', message: 'Unexpected response from the server.' };
    }
    return { status: 'uploaded', url: body.url, publicUrl: body.publicUrl };
  };

  return { load, save, uploadAsset };
}
