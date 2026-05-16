import { normalize, resolveLocale, schema, validate } from '@meport/core';

import exampleJson from '../../../examples/personal-profile/meport.json' with { type: 'json' };

import { withSecurityHeaders } from './security-headers.js';

// KV / R2 / secrets are introduced in later sub-phases (3.2+).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Env {}

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

function handleProfile(request: Request): Response {
  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') ?? undefined;
  const result = validate(exampleJson);
  if (!result.ok) {
    return problemResponse(500, 'Validation Error', 'Bundled fixture failed validation.');
  }
  const localized = resolveLocale(normalize(result.data), lang);
  return jsonResponse(localized);
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

function route(request: Request): Response {
  if (request.method !== 'GET') {
    return problemResponse(405, 'Method Not Allowed');
  }
  const url = new URL(request.url);
  switch (url.pathname) {
    case '/':
      return handleRoot();
    case '/api/profile':
      return handleProfile(request);
    case '/api/schema':
      return handleSchema();
    default:
      return problemResponse(404, 'Not Found');
  }
}

export default {
  fetch(request: Request, _env: Env): Response {
    return withSecurityHeaders(route(request));
  },
};
