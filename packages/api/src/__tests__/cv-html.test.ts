import { deriveCv, normalize, resolveLocale, validate, type LocalizedTakuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { renderCvHtml } from '../html/cv-html.js';

function localized(overrides: Record<string, unknown> = {}, locale = 'en'): LocalizedTakuhon {
  const doc = {
    schemaVersion: '0.5.0',
    profile: {
      displayName: { en: 'Pat Rivera' },
      tagline: { en: 'Maintainer' },
      location: { display: { en: 'Lisbon' } },
    },
    links: [{ id: 'site', type: 'website', url: 'https://example.com', featured: true }],
    careers: [
      {
        id: 'job',
        organization: { en: 'Acme' },
        role: { en: 'Engineer' },
        startDate: '2020-01',
        isCurrent: true,
        description: { en: 'Built things.' },
      },
    ],
    projects: [],
    skills: [{ id: 's1', label: 'TypeScript' }],
    education: [
      { id: 'e1', institution: { en: 'Uni' }, degree: { en: 'BSc' }, startDate: '2016-09' },
    ],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
  const result = validate(doc);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.errors)}`);
  return resolveLocale(normalize(result.data), locale);
}

function render(overrides: Record<string, unknown> = {}, locale = 'en'): string {
  return renderCvHtml(deriveCv(localized(overrides, locale)));
}

describe('renderCvHtml()', () => {
  it('produces a complete A4 document with the résumé title and print styles', () => {
    const html = render();
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Pat Rivera — CV</title>');
    expect(html).toContain('@media print');
    expect(html).toContain('@page{size:A4');
  });

  it('renders the header and the CV sections present in the fixture', () => {
    const html = render();
    expect(html).toContain('<h1>Pat Rivera</h1>');
    expect(html).toContain('Lisbon');
    expect(html).toContain('Experience');
    expect(html).toContain('Engineer');
    expect(html).toContain('Acme');
    expect(html).toContain('Present'); // isCurrent → "Present"
    expect(html).toContain('Education');
    expect(html).toContain('Skills');
    expect(html).toContain('TypeScript');
  });

  it('omits links and other web-only sections from the CV', () => {
    const html = render();
    expect(html).not.toContain('example.com'); // the link is not a CV section
  });

  it('escapes profile-derived text (no raw markup injection)', () => {
    const html = render({
      profile: { displayName: { en: '<script>alert(1)</script>' } },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops an unsafe javascript: URL from an entry link', () => {
    const html = render({
      careers: [
        {
          id: 'job',
          organization: { en: 'Acme' },
          role: { en: 'Engineer' },
          startDate: '2020-01',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(html).not.toContain('javascript:');
    // The heading is still rendered, just not as a link.
    expect(html).toContain('Engineer');
  });

  it('renders an email link only when the contact exposes one', () => {
    expect(render()).not.toContain('mailto:');
    const withEmail = render({ contact: { email: 'pat@example.com', showEmail: true } });
    expect(withEmail).toContain('mailto:pat@example.com');
  });

  it('localizes content and the lang attribute (ja)', () => {
    const html = render(
      {
        profile: { displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' } },
        settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
      },
      'ja',
    );
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('パット・リベラ');
  });
});
