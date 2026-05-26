import { normalize, validate, type Takuhon } from '@takuhon/core';
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
  it('GET / returns a plain-text landing page', async () => {
    const { app } = makeApp();
    const res = await fetchPath(app, '/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await res.text()).toContain('takuhon');
  });

  it('GET /api/profile uses storage data when present', async () => {
    const { app, storage } = makeApp();
    await storage.saveProfile(makeSample());
    const res = await fetchPath(app, '/api/profile');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.profile.displayName).toBe('Pat Rivera');
    expect(body.meta.locale).toBe('en');
    expect(body.meta.schemaVersion).toBe('0.2.0');
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
    expect(body.schemaVersion).toBe('0.2.0');
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
  // cookie (takuhon_locale), and Accept-Language with q-value ordering.
  // URL-path-based candidates are intentionally out of scope here.

  async function profile(headers: Record<string, string>, path = '/api/profile') {
    const { app } = makeApp();
    const res = await fetchPath(app, path, { headers });
    return (await res.json()) as { meta: { locale: string }; data: { profile: { displayName: string } } };
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

  function makeAppWith(profile: Takuhon): { app: ReturnType<typeof createPublicApp>; storage: FakeStorage } {
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
