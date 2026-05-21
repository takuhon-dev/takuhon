import {
  NotFoundError,
  SCHEMA_VERSION,
  generateJsonLd,
  normalize,
  resolveLocale,
  schema,
  type Ownport,
  type OwnportStorage,
} from '@takuhon/core';
import { Hono } from 'hono';

import { ERROR_SLUGS, problemResponse } from './error-envelope.js';

export interface PublicAppDeps {
  storage: OwnportStorage;
  /**
   * Returned when storage reports NotFoundError. Adapters that ship a
   * bundled example fixture (e.g. @takuhon/cloudflare) pass a thunk that
   * returns the validated document so initial-onboarding requests still
   * succeed before the first admin write.
   */
  fallback?: () => Ownport;
}

const FALLBACK_VERSION = 'bundled-fixture';

const PUBLIC_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

async function loadProfile(deps: PublicAppDeps): Promise<{ data: Ownport; version: string }> {
  try {
    return await deps.storage.getProfile();
  } catch (e) {
    if (e instanceof NotFoundError && deps.fallback) {
      return { data: deps.fallback(), version: FALLBACK_VERSION };
    }
    throw e;
  }
}

export function createPublicApp(deps: PublicAppDeps): Hono {
  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    h.set('x-content-type-options', 'nosniff');
    h.set('x-frame-options', 'DENY');
    h.set('referrer-policy', 'strict-origin-when-cross-origin');
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    h.set('content-security-policy', PUBLIC_CSP);
  });

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
      detail: `No route matches ${new URL(c.req.url).pathname}.`,
    }),
  );

  app.get('/', (c) => c.text('ownport — visit /api/profile or /api/schema\n'));

  app.get('/api/profile', async (c) => {
    const lang = c.req.query('lang');
    const { data, version } = await loadProfile(deps);
    const localized = resolveLocale(normalize(data), lang);
    const body = {
      data: localized,
      meta: {
        schemaVersion: localized.schemaVersion,
        locale: localized.resolvedLocale,
        updatedAt: localized.meta.updatedAt,
      },
    };
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300, s-maxage=300');
    return c.json(body);
  });

  app.get('/api/schema', (c) => c.json(schema));

  app.get('/api/jsonld', async (c) => {
    const lang = c.req.query('lang');
    const { data, version } = await loadProfile(deps);
    const localized = resolveLocale(normalize(data), lang);
    const ld = generateJsonLd(localized);
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300, s-maxage=300');
    c.header('content-type', 'application/ld+json; charset=utf-8');
    return c.body(JSON.stringify(ld));
  });

  app.get('/ownport.json', async (c) => {
    const { data, version } = await loadProfile(deps);
    c.header('etag', `"${version}"`);
    c.header('cache-control', 'public, max-age=300');
    return c.json(data);
  });

  app.get('/.well-known/ownport.json', (c) => {
    c.header('cache-control', 'public, max-age=3600');
    return c.json({
      schemaVersion: SCHEMA_VERSION,
      schemaUrl: '/api/schema',
      profile: '/api/profile',
      jsonld: '/api/jsonld',
      export: '/api/export',
      canonical: '/ownport.json',
    });
  });

  app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '*', (c) =>
    problemResponse(c, {
      slug: ERROR_SLUGS.methodNotAllowed,
      status: 405,
      title: 'Method Not Allowed',
      detail: `${c.req.method} ${new URL(c.req.url).pathname} is not supported on the public app.`,
    }),
  );

  return app;
}
