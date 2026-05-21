import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { noopAuditLogger } from '../admin/audit-logger.js';
import { bearerMiddleware, constantTimeEqual, sha256Hex } from '../admin/bearer.js';
import { originMiddleware } from '../admin/origin.js';

function fetchPath(app: Hono, path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://x${path}`, init)));
}

describe('constantTimeEqual', () => {
  it('returns true for equal byte arrays', () => {
    const enc = new TextEncoder();
    expect(constantTimeEqual(enc.encode('hello'), enc.encode('hello'))).toBe(true);
  });
  it('returns false for different lengths', () => {
    const enc = new TextEncoder();
    expect(constantTimeEqual(enc.encode('abc'), enc.encode('abcd'))).toBe(false);
  });
  it('returns false for equal length but different content', () => {
    const enc = new TextEncoder();
    expect(constantTimeEqual(enc.encode('hello'), enc.encode('world'))).toBe(false);
  });
  it('returns true for two empty arrays', () => {
    expect(constantTimeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  });
});

describe('sha256Hex', () => {
  it('returns 64-character lowercase hex for "hello"', async () => {
    const hex = await sha256Hex('hello');
    expect(hex).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
  it('produces different digests for different inputs', async () => {
    expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'));
  });
});

describe('bearerMiddleware', () => {
  function makeApp(token: string | undefined, auditLogger = noopAuditLogger): Hono {
    const app = new Hono();
    app.use('*', bearerMiddleware({ getAdminToken: () => token, auditLogger }));
    app.get('/protected', (c) => c.text('ok'));
    return app;
  }

  it('rejects requests without Authorization header with 401', async () => {
    const res = await fetchPath(makeApp('secret'), '/protected');
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.dev/errors/unauthorized');
  });

  it('rejects requests with wrong token with 401', async () => {
    const res = await fetchPath(makeApp('secret'), '/protected', {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects every request when no admin token is configured', async () => {
    const res = await fetchPath(makeApp(undefined), '/protected', {
      headers: { authorization: 'Bearer anything' },
    });
    expect(res.status).toBe(401);
  });

  it('accepts a valid Bearer token and reaches the handler', async () => {
    const res = await fetchPath(makeApp('secret'), '/protected', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('emits admin.auth.success on valid token', async () => {
    const logger = vi.fn();
    await fetchPath(makeApp('secret', logger), '/protected', {
      headers: { authorization: 'Bearer secret' },
    });
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.auth.success',
        actor: { tokenHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) },
      }),
    );
  });

  it('emits admin.auth.failure with sha256:absent on missing token', async () => {
    const logger = vi.fn();
    await fetchPath(makeApp('secret', logger), '/protected');
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.auth.failure',
        actor: { tokenHash: 'sha256:absent' },
      }),
    );
  });
});

describe('originMiddleware', () => {
  function makeApp(allow: string[]): Hono {
    const app = new Hono();
    app.use('*', originMiddleware({ getAdminOrigins: () => allow }));
    app.get('/x', (c) => c.text('ok'));
    return app;
  }

  it('skips check when allowlist is empty', async () => {
    const res = await fetchPath(makeApp([]), '/x', {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(200);
  });

  it('allows requests whose Origin is in the allowlist', async () => {
    const res = await fetchPath(makeApp(['https://admin.example']), '/x', {
      headers: { origin: 'https://admin.example' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests whose Origin is not in the allowlist', async () => {
    const res = await fetchPath(makeApp(['https://admin.example']), '/x', {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.dev/errors/forbidden');
  });

  it('allows requests without an Origin header (CLI / server-to-server)', async () => {
    const res = await fetchPath(makeApp(['https://admin.example']), '/x');
    expect(res.status).toBe(200);
  });
});
