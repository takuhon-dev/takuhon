import { normalize, validate, type Takuhon } from '@takuhon/core';
import { describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { createAdminApiApp } from '../admin/admin-api-app.js';
import { noopAuditLogger, type AuditEvent, type AuditLogger } from '../admin/audit-logger.js';
import { noopCachePurger, type CachePurger } from '../admin/cache-purger.js';
import { FakeStorage } from '../test-utils/fake-storage.js';

function makeSample(): Takuhon {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('fixture invalid');
  return normalize(r.data);
}

interface SetupOpts {
  token?: string | undefined;
  origins?: string[];
  auditLogger?: AuditLogger;
  cachePurger?: CachePurger;
}

function makeApp(opts: SetupOpts = {}): {
  app: ReturnType<typeof createAdminApiApp>;
  storage: FakeStorage;
} {
  const storage = new FakeStorage();
  const app = createAdminApiApp({
    storage,
    getAdminToken: () => opts.token ?? 'test-token',
    getAdminOrigins: () => opts.origins ?? [],
    cachePurger: opts.cachePurger ?? noopCachePurger,
    auditLogger: opts.auditLogger ?? noopAuditLogger,
  });
  return { app, storage };
}

function authHeaders(
  token = 'test-token',
  extra: Record<string, string> = {},
): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra };
}

function fetchPath(
  app: ReturnType<typeof createAdminApiApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://x${path}`, init)));
}

describe('createAdminApiApp PUT /profile', () => {
  it('returns 200 with new version on a valid first write (no If-Match)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(makeSample()),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.profile.displayName.en).toBe('Pat Rivera');
    expect(body.meta.version).toBe('v1');
    expect(body.meta.schemaVersion).toBe('0.5.0');
    expect(typeof body.meta.updatedAt).toBe('string');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 200 when If-Match matches the stored version', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders('test-token', { 'if-match': '"v1"' }),
      body: JSON.stringify(makeSample()),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.meta.version).toBe('v2');
  });

  it('returns 409 Conflict with currentVersion on If-Match mismatch', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders('test-token', { 'if-match': '"stale"' }),
      body: JSON.stringify(makeSample()),
    });
    expect(res.status).toBe(409);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/conflict');
    expect(body.currentVersion).toBe('v1');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(makeSample()),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when Origin is set but not in the allowlist', async () => {
    const { app } = makeApp({ origins: ['https://admin.example'] });
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: { ...authHeaders(), origin: 'https://evil.example' },
      body: JSON.stringify(makeSample()),
    });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/forbidden');
  });

  it('returns 415 when Content-Type is not application/json', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: { authorization: 'Bearer test-token', 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(res.status).toBe(415);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/unsupported-media-type');
  });

  it('returns 400 on malformed JSON body', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: '{ not json',
    });
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/bad-request');
  });

  it('returns 422 with JSON Pointer errors on schema violation', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/validation-failed');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    for (const fieldErr of body.errors as { path: string; message: string }[]) {
      expect(typeof fieldErr.path).toBe('string');
      expect(fieldErr.path.startsWith('#')).toBe(true);
      expect(typeof fieldErr.message).toBe('string');
    }
  });

  it('invokes cachePurger.profileUpdated exactly once on success', async () => {
    const profileUpdated = vi.fn().mockResolvedValue(undefined);
    const profileDeleted = vi.fn().mockResolvedValue(undefined);
    const cachePurger: CachePurger = { profileUpdated, profileDeleted };
    const { app } = makeApp({ cachePurger });
    await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(makeSample()),
    });
    expect(profileUpdated).toHaveBeenCalledTimes(1);
    expect(profileDeleted).not.toHaveBeenCalled();
  });

  it('emits admin.profile.update audit event with version on success', async () => {
    const logger = vi.fn();
    const { app } = makeApp({ auditLogger: logger });
    await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(makeSample()),
    });
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.profile.update',
        result: { status: 200, version: 'v1' },
      }),
    );
  });
});

describe('createAdminApiApp DELETE /profile', () => {
  it('returns 204 No Content on success', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/profile', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(204);
  });

  it('invokes cachePurger.profileDeleted exactly once on success', async () => {
    const profileUpdated = vi.fn().mockResolvedValue(undefined);
    const profileDeleted = vi.fn().mockResolvedValue(undefined);
    const cachePurger: CachePurger = { profileUpdated, profileDeleted };
    const { app } = makeApp({ cachePurger });
    await fetchPath(app, '/profile', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(profileDeleted).toHaveBeenCalledTimes(1);
    expect(profileUpdated).not.toHaveBeenCalled();
  });

  it('emits admin.profile.delete audit event with status 204', async () => {
    const logger = vi.fn();
    const { app } = makeApp({ auditLogger: logger });
    await fetchPath(app, '/profile', {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.profile.delete',
        result: { status: 204 },
      }),
    );
  });
});

describe('createAdminApiApp method and route handling', () => {
  it('returns 405 on PATCH /profile (deferred to a later phase)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/profile', {
      method: 'PATCH',
      headers: authHeaders(),
      body: '[]',
    });
    expect(res.status).toBe(405);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/method-not-allowed');
  });

  it('returns 404 on unknown admin route under valid auth', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/unknown', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/not-found');
  });
});

describe('createAdminApiApp GET /export', () => {
  it('returns 401 without a Bearer token', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/export', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when no profile has been stored', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(404);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/not-found');
  });

  it('returns the full stored document, bypassing the public privacy filter', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    const body = (await res.json()) as Takuhon & { data?: unknown };
    // Raw transport form: the document itself, not a { data, meta } envelope.
    expect(body.schemaVersion).toBe('0.5.0');
    expect(body.data).toBeUndefined();
    // Privacy-sensitive fields the public read filter strips are present here.
    expect(body.contact?.email).toBeTruthy();
    expect(body.certifications.some((cert) => typeof cert.credentialId === 'string')).toBe(true);
    expect(body.education.some((edu) => typeof edu.grade === 'string')).toBe(true);
  });

  it('exposes the stored version as a quoted ETag usable as the next If-Match', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());

    const exported = await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(exported.headers.get('etag')).toBe('"v1"');

    // The ETag round-trips: sending it back as If-Match on the next PUT
    // matches the stored version and is accepted (optimistic locking).
    const saved = await fetchPath(app, '/profile', {
      method: 'PUT',
      headers: authHeaders('test-token', { 'if-match': exported.headers.get('etag') ?? '' }),
      body: JSON.stringify(makeSample()),
    });
    expect(saved.status).toBe(200);
  });

  it('advances the ETag after a write so the editor can re-sync', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.headers.get('etag')).toBe('"v2"');
  });

  it('preserves the stored meta.updatedAt (no export-time restamp)', async () => {
    const sample = makeSample();
    const { app, storage } = makeApp();
    await storage.saveProfile(sample);
    const res = await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    const body: any = await res.json();
    expect(body.meta.updatedAt).toBe(sample.meta.updatedAt);
  });

  it('emits an admin.profile.export audit event on success', async () => {
    const auditLogger = vi.fn<(event: AuditEvent) => void>();
    const { app, storage } = makeApp({ auditLogger });
    await storage.saveProfile(makeSample());
    await fetchPath(app, '/export', {
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
    });
    // The bearer middleware also logs `admin.auth.success`, so locate the
    // export event among the recorded calls rather than asserting a count.
    const exportEvent = auditLogger.mock.calls
      .map((call) => call[0])
      .find((e) => e.type === 'admin.profile.export');
    expect(exportEvent).toBeDefined();
    expect(exportEvent?.result.status).toBe(200);
    expect(exportEvent?.request.method).toBe('GET');
  });
});
