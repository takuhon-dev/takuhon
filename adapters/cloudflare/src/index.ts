import {
  NotFoundError,
  SCHEMA_VERSION,
  normalize,
  resolveLocale,
  schema,
  validate,
  type Meport,
} from '@meport/core';

import exampleJson from '../../../examples/personal-profile/meport.json' with { type: 'json' };

import { KvMeportStorage } from './kv-storage.js';
import { withSecurityHeaders } from './security-headers.js';

export interface Env {
  MEPORT_KV: KVNamespace;
}

const FALLBACK_VERSION = 'bundled-fixture';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function problemResponse(status: number, title: string, detail?: string): Response {
  const body: { type: string; title: string; status: number; detail?: string } = {
    type: 'about:blank',
    title,
    status,
  };
  if (detail !== undefined) body.detail = detail;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json; charset=utf-8' },
  });
}

async function loadProfile(env: Env): Promise<{ data: Meport; version: string }> {
  const storage = new KvMeportStorage(env.MEPORT_KV);
  try {
    return await storage.getProfile();
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
    const result = validate(exampleJson);
    if (!result.ok) {
      throw new Error('Bundled fixture failed validation.', { cause: e });
    }
    return { data: result.data, version: FALLBACK_VERSION };
  }
}

async function handleProfile(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') ?? undefined;
  let data: Meport;
  let version: string;
  try {
    ({ data, version } = await loadProfile(env));
  } catch (e) {
    return problemResponse(
      500,
      'Internal Error',
      e instanceof Error ? e.message : 'Unknown failure',
    );
  }
  const localized = resolveLocale(normalize(data), lang);
  const body = {
    data: localized,
    meta: {
      schemaVersion: localized.schemaVersion,
      locale: localized.resolvedLocale,
      updatedAt: localized.meta.updatedAt,
    },
  };
  return jsonResponse(body, {
    headers: {
      etag: `"${version}"`,
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}

async function handleMeportJson(env: Env): Promise<Response> {
  let data: Meport;
  let version: string;
  try {
    ({ data, version } = await loadProfile(env));
  } catch (e) {
    return problemResponse(
      500,
      'Internal Error',
      e instanceof Error ? e.message : 'Unknown failure',
    );
  }
  return jsonResponse(data, {
    headers: {
      etag: `"${version}"`,
      'cache-control': 'public, max-age=300',
    },
  });
}

function handleWellKnown(): Response {
  const body = {
    schemaVersion: SCHEMA_VERSION,
    schemaUrl: '/api/schema',
    profile: '/api/profile',
    jsonld: '/api/jsonld',
    export: '/api/export',
    canonical: '/meport.json',
  };
  return jsonResponse(body, {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}

function handleSchema(): Response {
  return jsonResponse(schema);
}

function handleRoot(): Response {
  return new Response('meport — visit /api/profile or /api/schema\n', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return problemResponse(405, 'Method Not Allowed');
  }
  const url = new URL(request.url);
  switch (url.pathname) {
    case '/':
      return handleRoot();
    case '/api/profile':
      return handleProfile(request, env);
    case '/api/schema':
      return handleSchema();
    case '/meport.json':
      return handleMeportJson(env);
    case '/.well-known/meport.json':
      return handleWellKnown();
    default:
      return problemResponse(404, 'Not Found');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
};
