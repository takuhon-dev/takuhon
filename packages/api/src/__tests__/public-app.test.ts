import { SCHEMA_VERSION, normalize, validate, type Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { parseAcceptLanguage } from '../locale-resolution.js';
import { createPublicApp } from '../public-app.js';
import { FakeStorage } from '../test-utils/fake-storage.js';

function makeSample(): Takuhon {
  const r = validate(exampleJson);
  if (!r.ok) throw new Error('fixture invalid');
  return normalize(r.data);
}

function makeApp(): { app: ReturnType<typeof createPublicApp>; storage: FakeStorage } {
  const storage = new FakeStorage();
  const app = createPublicApp({ storage, fallback: () => makeSample() });
  return { app, storage };
}

function fetchPath(
  app: ReturnType<typeof createPublicApp>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`https://app.example${path}`, init)));
}

describe('createPublicApp', () => {
  it('GET / server-renders the profile page with embedded JSON-LD', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = await res.text();
    expect(body.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(body).toContain('<html lang="en">');
    expect(body).toContain('Pat Rivera');
    // The JSON-LD a crawler reads is embedded in the page itself, not only on
    // the separate /api/jsonld endpoint.
    expect(body).toContain('<script type="application/ld+json">');
    expect(body).toContain('"ProfilePage"');
    // Canonical + hreflang are derived from this request's own origin.
    expect(body).toContain('<link rel="canonical" href="https://app.example/">');
    expect(body).toContain('<link rel="alternate" hreflang="ja" href="https://app.example/ja/">');
    expect(body).toContain('hreflang="x-default"');
  });

  it('GET /<locale>/ server-renders the localized profile page', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<html lang="ja">');
    expect(body).toContain('パット・リベラ');
    expect(body).toContain('<link rel="canonical" href="https://app.example/ja/">');
  });

  it('GET /health returns a storage-independent liveness payload', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/health');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('ok');
    expect(body.schemaVersion).toBe(SCHEMA_VERSION);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('GET /health succeeds even when storage throws (liveness, not readiness)', async () => {
    const storage = new FakeStorage();
    storage.getProfile = (): never => {
      throw new Error('storage is down');
    };
    const app = createPublicApp({ storage });
    const res = await fetchPath(app, '/health');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('ok');
  });

  it('exposes permissive CORS headers on public reads (read-anywhere)', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const paths = [
      '/',
      '/api/profile',
      '/api/jsonld',
      '/takuhon.json',
      '/api/schema',
      '/.well-known/takuhon.json',
    ];
    for (const path of paths) {
      const res = await fetchPath(app, path);
      expect(res.headers.get('access-control-allow-origin'), path).toBe('*');
      expect(res.headers.get('access-control-expose-headers'), path).toBe('ETag');
    }
  });

  it('answers a CORS preflight (OPTIONS) with 204 and the allowed methods', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile', {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'x-custom' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    // Requested headers are echoed back so any non-simple read is permitted.
    expect(res.headers.get('access-control-allow-headers')).toBe('x-custom');
    expect(res.headers.get('access-control-max-age')).toBe('86400');
  });

  it('keeps CORS headers on 404 / 405 / 500 responses', async () => {
    const { app } = makeApp();

    const notFound = await fetchPath(app, '/api/does-not-exist');
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('access-control-allow-origin')).toBe('*');

    const methodNotAllowed = await fetchPath(app, '/api/profile', { method: 'POST' });
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get('access-control-allow-origin')).toBe('*');

    const errStorage = new FakeStorage();
    errStorage.getProfile = (): never => {
      throw new Error('storage is down');
    };
    const errApp = createPublicApp({ storage: errStorage });
    const serverError = await fetchPath(errApp, '/api/profile');
    expect(serverError.status).toBe(500);
    expect(serverError.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('sets CORS headers on HEAD and on a locale-prefixed preflight', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());

    const head = await fetchPath(app, '/api/profile', { method: 'HEAD' });
    expect(head.headers.get('access-control-allow-origin')).toBe('*');

    const localePreflight = await fetchPath(app, '/ja/api/profile', { method: 'OPTIONS' });
    expect(localePreflight.status).toBe(204);
    expect(localePreflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(localePreflight.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('GET /api/profile uses storage data when present', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
    expect(body.meta.locale).toBe('en');
    expect(body.meta.schemaVersion).toBe('0.6.0');
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
  });

  it('GET /api/profile?lang=ja resolves Japanese content', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile?lang=ja');
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('GET /api/profile falls back to bundled fixture when storage is empty', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile');
    expect(res.headers.get('etag')).toBe('"bundled-fixture"');
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
  });

  it('GET /api/schema returns the JSON Schema document', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/schema');
    const body: any = await res.json();
    expect(body.$schema).toBeTruthy();
  });

  it('GET /api/jsonld returns a ProfilePage with Person mainEntity', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/ld\+json/);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    const body: any = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]['@type']).toBe('ProfilePage');
    expect(body[0].mainEntity['@type']).toBe('Person');
  });

  it('GET /api/jsonld?lang=ja localizes inLanguage to ja', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld?lang=ja');
    const body: any = await res.json();
    expect(body[0].inLanguage).toBe('ja');
  });

  it('GET /takuhon.json returns the raw Takuhon document', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/takuhon.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body: any = await res.json();
    expect(body.profile.displayName.en).toBe('Pat Rivera');
    expect(body.profile.displayName.ja).toBe('パット・リベラ');
    expect(body.data).toBeUndefined();
  });

  it('GET /.well-known/takuhon.json returns the 6-field metadata', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/.well-known/takuhon.json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    const body: any = await res.json();
    expect(body.schemaVersion).toBe('0.6.0');
    expect(body.canonical).toBe('/takuhon.json');
  });

  it('GET /unknown returns RFC 7807 with type=https://takuhon.org/errors/not-found', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/not-found');
    expect(body.instance).toBe('/does-not-exist');
  });

  it('POST /api/profile returns 405 with type=https://takuhon.org/errors/method-not-allowed', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile', { method: 'POST' });
    expect(res.status).toBe(405);
    const body: any = await res.json();
    expect(body.type).toBe('https://takuhon.org/errors/method-not-allowed');
    expect(body.instance).toBe('/api/profile');
  });

  it('every response carries the six baseline security headers', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/schema');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'self'/);
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
  });
});

describe('locale resolution priority', () => {
  // Fixture availableLocales: ["en", "ja"], defaultLocale: "en".
  // Assertions exercise the request-side priority chain: query (?lang=),
  // URL path prefix (/ja/), cookie (takuhon_locale), and Accept-Language
  // with q-value ordering. The URL-path tier is covered in the dedicated
  // 'URL path locale prefix' block below.

  async function profile(headers: Record<string, string>, path = '/api/profile') {
    const { app } = makeApp();
    const res = await fetchPath(app, path, { headers });
    return (await res.json()) as {
      meta: { locale: string };
      data: { profile: { displayName: string } };
    };
  }

  it('honors takuhon_locale cookie alone', async () => {
    const body = await profile({ cookie: 'takuhon_locale=ja' });
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('honors Accept-Language alone', async () => {
    const body = await profile({ 'accept-language': 'ja,en;q=0.5' });
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('orders Accept-Language entries by q-value descending', async () => {
    const body = await profile({ 'accept-language': 'en;q=0.3, ja;q=0.9' });
    expect(body.meta.locale).toBe('ja');
  });

  it('?lang= beats cookie', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile?lang=en', {
      headers: { cookie: 'takuhon_locale=ja' },
    });
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en');
  });

  it('cookie beats Accept-Language', async () => {
    const body = await profile({
      cookie: 'takuhon_locale=en',
      'accept-language': 'ja',
    });
    expect(body.meta.locale).toBe('en');
  });

  it('falls through invalid ?lang= to cookie', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile?lang=zz_invalid', {
      headers: { cookie: 'takuhon_locale=ja' },
    });
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
  });

  it('falls back to defaultLocale when Accept-Language tags are unavailable', async () => {
    const body = await profile({ 'accept-language': 'fr,de;q=0.5' });
    expect(body.meta.locale).toBe('en');
  });

  it('matches en-US in Accept-Language against available en via primary-subtag fallback', async () => {
    const body = await profile({ 'accept-language': 'en-US' });
    expect(body.meta.locale).toBe('en');
  });

  it('ignores the Accept-Language wildcard without crashing', async () => {
    const body = await profile({ 'accept-language': '*' });
    expect(body.meta.locale).toBe('en');
  });

  it('sets Vary: Accept-Language, Cookie on /api/profile and /api/jsonld', async () => {
    const { app } = makeApp();
    const profileRes = await fetchPath(app, '/api/profile');
    const profileVary = profileRes.headers.get('vary') ?? '';
    expect(profileVary).toMatch(/Accept-Language/i);
    expect(profileVary).toMatch(/Cookie/i);

    const jsonldRes = await fetchPath(app, '/api/jsonld');
    const jsonldVary = jsonldRes.headers.get('vary') ?? '';
    expect(jsonldVary).toMatch(/Accept-Language/i);
    expect(jsonldVary).toMatch(/Cookie/i);
  });

  it('omits Vary on locale-agnostic routes', async () => {
    const { app } = makeApp();
    const schemaRes = await fetchPath(app, '/api/schema');
    expect(schemaRes.headers.get('vary')).toBeNull();

    const rawRes = await fetchPath(app, '/takuhon.json');
    expect(rawRes.headers.get('vary')).toBeNull();
  });

  it('GET /api/jsonld honors Accept-Language (inLanguage matches q-ordered top)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld', {
      headers: { 'accept-language': 'ja,en;q=0.5' },
    });
    const body: any = await res.json();
    expect(body[0].inLanguage).toBe('ja');
  });

  it('substitutes the matched available locale on primary-subtag match (en → en-US)', async () => {
    // Build a profile whose availableLocales are region-tagged. A request
    // saying `Accept-Language: en` must resolve to en-US content, not the
    // settings-tier default. Without the substitution, the bare `en`
    // token would be forwarded to core, miss the en-US-keyed profile,
    // and fall through to defaultLocale.
    const base = makeSample();
    const regional: Takuhon = {
      ...base,
      settings: { ...base.settings, availableLocales: ['en-US', 'ja'], defaultLocale: 'ja' },
      profile: {
        ...base.profile,
        displayName: { 'en-US': 'Pat Rivera', ja: 'パット・リベラ' },
      },
    };
    const storage = new FakeStorage();
    await storage.saveProfile(regional);
    const app = createPublicApp({ storage, fallback: () => regional });
    const res = await fetchPath(app, '/api/profile', {
      headers: { 'accept-language': 'en' },
    });
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en-US');
    expect(body.data.profile.displayName).toBe('Pat Rivera');
  });
});

describe('URL path locale prefix', () => {
  // Fixture availableLocales: ["en", "ja"], defaultLocale: "en".
  // The public app's getPath strips a leading /{locale} so flat routes
  // match, and handlers feed the token in at priority #2 (after ?lang=,
  // before cookie).

  it('GET /ja/api/profile resolves Japanese content', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
    expect(body.data.profile.displayName).toBe('パット・リベラ');
  });

  it('GET /en/api/profile resolves English content', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/en/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en');
  });

  it('GET /ja/api/jsonld localizes inLanguage to ja', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/jsonld');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body[0].inLanguage).toBe('ja');
  });

  it('GET /ja/ serves the profile page (prefix maps to /)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('<html lang="ja">');
  });

  it('?lang= beats the path prefix (query is priority #1)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/profile?lang=en');
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en');
  });

  it('path prefix beats cookie (priority #2 over #3)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/profile', {
      headers: { cookie: 'takuhon_locale=en' },
    });
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
  });

  it('path prefix beats Accept-Language', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/profile', {
      headers: { 'accept-language': 'en' },
    });
    const body: any = await res.json();
    expect(body.meta.locale).toBe('ja');
  });

  it('falls through an unknown-but-shaped prefix to the default locale (200, not 404)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/fr/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en');
  });

  it('keeps Vary unchanged on a path-prefixed route', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/api/profile');
    const vary = res.headers.get('vary') ?? '';
    expect(vary).toMatch(/Accept-Language/i);
    expect(vary).toMatch(/Cookie/i);
  });

  it('resolves a region-tagged path prefix via primary-subtag match', async () => {
    const base = makeSample();
    const regional: Takuhon = {
      ...base,
      settings: { ...base.settings, availableLocales: ['en-US', 'ja'], defaultLocale: 'ja' },
      profile: {
        ...base.profile,
        displayName: { 'en-US': 'Pat Rivera', ja: 'パット・リベラ' },
      },
    };
    const storage = new FakeStorage();
    await storage.saveProfile(regional);
    const app = createPublicApp({ storage, fallback: () => regional });
    const res = await fetchPath(app, '/en-US/api/profile');
    const body: any = await res.json();
    expect(body.meta.locale).toBe('en-US');
    expect(body.data.profile.displayName).toBe('Pat Rivera');
  });

  // Locale-agnostic guard: a /{locale} prefix must never be honored ahead
  // of a non-locale-aware remainder, and bare agnostic paths are untouched.
  it('does not treat /api/schema as locale "api" + /schema', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/schema');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.$schema).toBeTruthy();
  });

  it('leaves /health, /takuhon.json, and /.well-known/takuhon.json unchanged', async () => {
    const { app } = makeApp();
    const health = await fetchPath(app, '/health');
    expect(health.status).toBe(200);
    const healthBody: any = await health.json();
    expect(healthBody.status).toBe('ok');

    const raw = await fetchPath(app, '/takuhon.json');
    expect(raw.status).toBe(200);

    const wk = await fetchPath(app, '/.well-known/takuhon.json');
    expect(wk.status).toBe(200);
    const wkBody: any = await wk.json();
    expect(wkBody.canonical).toBe('/takuhon.json');
  });

  it('404s a shaped prefix before an agnostic remainder (e.g. /ja/health)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/ja/health');
    expect(res.status).toBe(404);
  });

  it('404s the bare /api namespace root (reserved, not a locale)', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api');
    expect(res.status).toBe(404);
  });
});

describe('parseAcceptLanguage (unit)', () => {
  it('truncates input over 2048 bytes before parsing', () => {
    const padding = 'a'.repeat(3000);
    const header = `ja, ${padding}`;
    const tags = parseAcceptLanguage(header);
    // The truncated header still leaves `ja` parseable at the front.
    // The pathological padding is sliced off mid-token and discarded by
    // the BCP-47 validity check, so total candidate count stays small.
    expect(tags).toContain('ja');
    expect(tags.length).toBeLessThanOrEqual(16);
  });

  it('caps comma-separated entries at 16', () => {
    const tags = Array.from({ length: 25 }, (_, i) => `xx;q=0.${i % 10}`).join(',');
    // Each generated tag (`xx`) is a valid BCP-47 primary subtag; the
    // cap ensures we never look past entry 16.
    const parsed = parseAcceptLanguage(`${tags},ja`);
    expect(parsed.length).toBeLessThanOrEqual(16);
    // `ja` sits past the cap and must not appear in the output.
    expect(parsed).not.toContain('ja');
  });

  it('preserves caller-supplied casing on returned tags', () => {
    // BCP-47 comparison is case-insensitive but display casing matters
    // for downstream regional expansion. The parser must not lowercase.
    const tags = parseAcceptLanguage('EN-us, ZH-Hant-TW;q=0.8');
    expect(tags[0]).toBe('EN-us');
    expect(tags[1]).toBe('ZH-Hant-TW');
  });
});

describe('public privacy filter', () => {
  // Build a profile that carries every privacy-sensitive field so we can
  // observe stripping behavior end-to-end through the HTTP layer.
  function makeSensitiveProfile(opts: {
    hideCredentialIds?: boolean | undefined;
    hideEducationGrades?: boolean | undefined;
    showEmail?: boolean;
  }): Takuhon {
    const base = makeSample();
    const out: Takuhon = {
      ...base,
      certifications: [
        {
          id: 'cert-1',
          title: { en: 'Cert' },
          issuingOrganization: { en: 'Issuer' },
          issueDate: '2024-01',
          credentialId: 'SECRET-123',
        },
      ],
      education: [
        {
          id: 'edu-1',
          institution: { en: 'University' },
          startDate: '2014-04',
          grade: 'GPA 3.9',
        },
      ],
      contact: {
        ...base.contact,
        email: 'pat@example.com',
        showEmail: opts.showEmail ?? false,
      },
      meta: {
        ...base.meta,
        privacy: {
          ...(opts.hideCredentialIds !== undefined
            ? { hideCredentialIds: opts.hideCredentialIds }
            : {}),
          ...(opts.hideEducationGrades !== undefined
            ? { hideEducationGrades: opts.hideEducationGrades }
            : {}),
        },
      },
    };
    return out;
  }

  function makeAppWith(profile: Takuhon): {
    app: ReturnType<typeof createPublicApp>;
    storage: FakeStorage;
  } {
    const storage = new FakeStorage();
    const app = createPublicApp({ storage, fallback: () => profile });
    return { app, storage };
  }

  it('strips certifications[*].credentialId on /api/profile by default (privacy-by-default)', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({}));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.certifications[0]?.id).toBe('cert-1');
    expect(body.data.certifications[0]?.credentialId).toBeUndefined();
  });

  it('preserves credentialId when hideCredentialIds is explicitly false', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({ hideCredentialIds: false }));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.certifications[0]?.credentialId).toBe('SECRET-123');
  });

  it('strips education[*].grade on /api/profile by default', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({}));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.education[0]?.id).toBe('edu-1');
    expect(body.data.education[0]?.grade).toBeUndefined();
  });

  it('preserves grade when hideEducationGrades is explicitly false', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({ hideEducationGrades: false }));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.education[0]?.grade).toBe('GPA 3.9');
  });

  it('strips contact.email when showEmail !== true (drive-by fix of Spec §6.10)', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({ showEmail: false }));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.contact.email).toBeUndefined();
  });

  it('preserves contact.email when showEmail is explicitly true', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({ showEmail: true }));
    const res = await fetchPath(app, '/api/profile');
    const body: any = await res.json();
    expect(body.data.contact.email).toBe('pat@example.com');
  });

  it('also applies to /takuhon.json (raw shape)', async () => {
    const { app } = makeAppWith(makeSensitiveProfile({}));
    const res = await fetchPath(app, '/takuhon.json');
    const body: any = await res.json();
    expect(body.certifications[0]?.credentialId).toBeUndefined();
    expect(body.education[0]?.grade).toBeUndefined();
    expect(body.contact.email).toBeUndefined();
  });
});

describe('public section visibility (settings.publicVisibility) parity', () => {
  // A unique, owner-injected career organization so we can assert its absence
  // from any surface once the careers section is hidden.
  const HIDDEN_ORG = 'Hidden-Org-Acme-XYZ';

  function withVisibility(publicVisibility: Record<string, boolean>): Takuhon {
    const base = makeSample();
    return {
      ...base,
      careers: [
        {
          id: 'job-1',
          organization: { en: HIDDEN_ORG },
          role: { en: 'Engineer' },
          startDate: '2020-01',
        },
      ],
      contact: {
        ...base.contact,
        email: 'pat@example.com',
        showEmail: true,
        formUrl: 'https://example.com/contact',
      },
      settings: { ...base.settings, publicVisibility },
    };
  }

  function makeAppWith(profile: Takuhon): { app: ReturnType<typeof createPublicApp> } {
    const storage = new FakeStorage();
    const app = createPublicApp({ storage, fallback: () => profile });
    return { app };
  }

  it('empties a hidden array section on GET /api/profile', async () => {
    const { app } = makeAppWith(withVisibility({ careers: false }));
    const body: any = await (await fetchPath(app, '/api/profile')).json();
    expect(body.data.careers).toEqual([]);
  });

  it('empties a hidden array section on GET /takuhon.json (raw shape)', async () => {
    const { app } = makeAppWith(withVisibility({ careers: false }));
    const body: any = await (await fetchPath(app, '/takuhon.json')).json();
    expect(body.careers).toEqual([]);
  });

  it('empties a hidden contact section on /api/profile and /takuhon.json', async () => {
    const { app } = makeAppWith(withVisibility({ contact: false }));
    const profileBody: any = await (await fetchPath(app, '/api/profile')).json();
    expect(profileBody.data.contact).toEqual({});
    const rawBody: any = await (await fetchPath(app, '/takuhon.json')).json();
    expect(rawBody.contact).toEqual({});
  });

  it('leaves sibling sections visible when one is hidden', async () => {
    const { app } = makeAppWith(withVisibility({ careers: false }));
    const body: any = await (await fetchPath(app, '/api/profile')).json();
    // contact has no key → stays visible (default true).
    expect(body.data.contact.email).toBe('pat@example.com');
  });

  it('keeps a hidden-section value out of the server-rendered GET / (HTML + embedded JSON-LD)', async () => {
    const { app } = makeAppWith(withVisibility({ careers: false }));
    const html = await (await fetchPath(app, '/')).text();
    expect(html).not.toContain(HIDDEN_ORG);
  });

  it('keeps a hidden-section value out of GET /api/jsonld', async () => {
    const { app } = makeAppWith(withVisibility({ careers: false }));
    const text = await (await fetchPath(app, '/api/jsonld')).text();
    expect(text).not.toContain(HIDDEN_ORG);
  });
});

describe('fixture-leak regression (examples/personal-profile/takuhon.json)', () => {
  // The personal-profile example deliberately populates privacy-marked fields
  // (certifications[*].credentialId, education[*].grade, and contact.email
  // with showEmail !== true) so that privacy-by-default behavior is exercised
  // in the playground demo. This block guards against fixture edits that
  // re-introduce these values via paths the field-level filter does not
  // touch — for example, embedding a credentialId inside certifications[*].url
  // or copying a grade into a description body.
  //
  // The substrings below are intentionally coupled to the current fixture.
  // If a fixture refresh changes these credential / grade / email values,
  // update the list rather than weakening the assertion: the contract
  // is that no privacy-marked substring leaks via any embedded path.
  const PRIVACY_MARKED_SUBSTRINGS = [
    // certifications[*].credentialId — stripped by hideCredentialIds (default true)
    'CPACC-2022-PR-09231',
    'WAS-2023-PR-04522',
    // education[*].grade — stripped by hideEducationGrades (default true)
    'magna cum laude',
    // contact.email — stripped when showEmail !== true
    'pat@example.com',
  ] as const;

  function assertNoLeak(body: string, surface: string): void {
    for (const pattern of PRIVACY_MARKED_SUBSTRINGS) {
      expect(body, `"${pattern}" leaked into ${surface}`).not.toContain(pattern);
    }
  }

  it('omits privacy-marked substrings from GET /api/profile', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/profile');
    expect(res.status).toBe(200);
    assertNoLeak(await res.text(), '/api/profile');
  });

  it('omits privacy-marked substrings from GET /api/jsonld', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/api/jsonld');
    expect(res.status).toBe(200);
    assertNoLeak(await res.text(), '/api/jsonld');
  });

  it('omits privacy-marked substrings from the server-rendered GET /', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/');
    expect(res.status).toBe(200);
    assertNoLeak(await res.text(), '/');
  });

  it('omits privacy-marked substrings from GET /takuhon.json', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/takuhon.json');
    expect(res.status).toBe(200);
    assertNoLeak(await res.text(), '/takuhon.json');
  });
});
