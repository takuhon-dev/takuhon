import {
  applyPublicPrivacyFilter,
  normalize,
  validate,
  type ActivitySnapshot,
  type NormalizedTakuhon,
} from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { generateSite } from '../site.js';

/** A valid multi-locale (en + ja) 0.4.0 profile carrying privacy-sensitive fields. */
function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '0.4.0',
    profile: {
      displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' },
      tagline: { en: 'Maintainer', ja: 'メンテナ' },
    },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    certifications: [
      {
        id: 'c1',
        title: { en: 'Cert' },
        issuingOrganization: { en: 'Org' },
        issueDate: '2024-01',
        credentialId: 'CRED-SECRET',
      },
    ],
    education: [
      { id: 'e1', institution: { en: 'Uni' }, startDate: '2018-09', grade: 'GRADE-SECRET' },
    ],
    contact: { email: 'secret@example.com' },
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
}

/** Run the same upstream pipeline as `build` / `dev` to get a NormalizedTakuhon. */
function prepared(overrides: Record<string, unknown> = {}): NormalizedTakuhon {
  const result = validate(fixture(overrides));
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return applyPublicPrivacyFilter(normalize(result.data));
}

describe('generateSite()', () => {
  it('emits the default locale at "/" and each other locale under "/<locale>/"', () => {
    const pages = generateSite(prepared());
    const byRoute = new Map(pages.map((p) => [p.route, p]));

    expect([...byRoute.keys()].sort()).toEqual(['/', '/ja/']);
    expect(byRoute.get('/')?.file).toBe('index.html');
    expect(byRoute.get('/ja/')?.file).toBe('ja/index.html');
    expect(byRoute.get('/')?.html).toContain('<html lang="en">');
    expect(byRoute.get('/')?.html).toContain('Pat Rivera');
    expect(byRoute.get('/ja/')?.html).toContain('<html lang="ja">');
    expect(byRoute.get('/ja/')?.html).toContain('パット・リベラ');
  });

  it('lists the default locale first and de-duplicates it from availableLocales', () => {
    const pages = generateSite(
      prepared({ settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] } }),
    );
    expect(pages.map((p) => p.route)).toEqual(['/', '/ja/']);
  });

  it('injects absolute canonical + hreflang only with a baseUrl (switcher stays relative)', () => {
    const withBase = generateSite(prepared(), { baseUrl: 'https://me.example' });
    const root = withBase.find((p) => p.route === '/')!;
    expect(root.html).toContain('<link rel="canonical" href="https://me.example/">');
    expect(root.html).toContain('hreflang="ja" href="https://me.example/ja/"');
    expect(root.html).toContain('hreflang="x-default"');
    expect(root.html).toContain('href="ja/"'); // relative locale switcher

    const noBase = generateSite(prepared()).find((p) => p.route === '/')!;
    expect(noBase.html).not.toContain('rel="canonical"');
    expect(noBase.html).not.toContain('hreflang=');
  });

  it('emits JSON-LD by default and omits it when enableJsonLd is false', () => {
    expect(generateSite(prepared())[0]!.html).toContain('application/ld+json');
    const off = generateSite(
      prepared({
        settings: { defaultLocale: 'en', availableLocales: ['en'], enableJsonLd: false },
      }),
    );
    expect(off[0]!.html).not.toContain('application/ld+json');
  });

  it('applies the public privacy filter (email + credentialId + grade hidden by default)', () => {
    const html = generateSite(prepared())[0]!.html;
    expect(html).not.toContain('secret@example.com');
    expect(html).not.toContain('CRED-SECRET');
    expect(html).not.toContain('GRADE-SECRET');

    const shown = generateSite(
      prepared({ contact: { email: 'secret@example.com', showEmail: true } }),
    )[0]!.html;
    expect(shown).toContain('secret@example.com');
  });

  it('renders the activity snapshot on every page while settings.activity is enabled', () => {
    const snapshot: ActivitySnapshot = {
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
    };
    const pages = generateSite(
      prepared({
        settings: {
          defaultLocale: 'en',
          availableLocales: ['en', 'ja'],
          activity: { enabled: true, github: { username: 'octocat' } },
        },
      }),
      { activitySnapshot: snapshot },
    );
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      expect(page.html).toContain('<section class="activity">');
      expect(page.html).toContain('TypeScript 80%');
    }
  });

  it('drops the activity section when activity is not enabled, even with a snapshot', () => {
    const snapshot: ActivitySnapshot = {
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
    };
    const html = generateSite(prepared(), { activitySnapshot: snapshot })[0]!.html;
    expect(html).not.toContain('class="activity"');
  });
});
