import { normalize, resolveLocale } from '@takuhon/core';
import type { LocalizedTakuhon, Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { escapeHtml, renderProfileHtml, type RenderInput } from '../build-html.js';

/** Build a LocalizedTakuhon from a partial multi-locale document. */
function localized(overrides: Record<string, unknown> = {}, locale = 'en'): LocalizedTakuhon {
  const doc = {
    schemaVersion: '0.4.0',
    profile: { displayName: { en: 'Pat Rivera' }, tagline: { en: 'Maintainer' } },
    links: [{ id: 'site', type: 'website', url: 'https://example.com', featured: true }],
    careers: [
      {
        id: 'job',
        organization: { en: 'Acme' },
        role: { en: 'Engineer' },
        startDate: '2020-01',
      },
    ],
    projects: [],
    skills: [{ id: 's1', label: 'TypeScript' }],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  } as unknown as Takuhon;
  return resolveLocale(normalize(doc), locale);
}

function render(data: LocalizedTakuhon, extra: Partial<RenderInput> = {}): string {
  return renderProfileHtml({
    localized: data,
    alternates: [],
    localeNav: [],
    jsonLd: true,
    ...extra,
  });
}

describe('escapeHtml()', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('renderProfileHtml()', () => {
  it('produces a complete document with the resolved lang and core sections', () => {
    const html = render(localized());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1>Pat Rivera</h1>');
    expect(html).toContain('Engineer'); // Experience section
    expect(html).toContain('TypeScript'); // Skills section
    expect(html).toContain('https://example.com'); // Links section
  });

  it('escapes profile-derived text (no raw markup injection)', () => {
    const html = render(
      localized({ profile: { displayName: { en: '<script>alert(1)</script>' } } }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('unicode-escapes < in the JSON-LD payload so it cannot close the script tag', () => {
    const html = render(localized({ profile: { displayName: { en: 'A </script> B' } } }));
    // The only real closing tag is the script element itself; the data-derived
    // "</script>" must appear unicode-escaped inside the JSON-LD payload.
    expect(html).toContain('application/ld+json');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('A </script> B');
  });

  it('drops unsafe URL schemes (javascript:) but keeps the label as text', () => {
    const html = render(
      localized({
        links: [{ id: 'x', type: 'website', url: 'javascript:alert(1)', label: { en: 'Evil' } }],
      }),
    );
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('Evil');
  });

  it('omits JSON-LD when disabled', () => {
    const html = render(localized(), { jsonLd: false });
    expect(html).not.toContain('application/ld+json');
  });

  it('renders the locale switcher only when more than one locale is present', () => {
    const single = render(localized(), {
      localeNav: [{ locale: 'en', href: './', current: true }],
    });
    expect(single).not.toContain('nav class="locales"');
    const multi = render(localized(), {
      localeNav: [
        { locale: 'en', href: './', current: true },
        { locale: 'ja', href: 'ja/', current: false },
      ],
    });
    expect(multi).toContain('nav class="locales"');
    expect(multi).toContain('href="ja/"');
  });

  it('emits canonical and hreflang links when provided', () => {
    const html = render(localized(), {
      canonicalUrl: 'https://me.example/',
      alternates: [
        { hreflang: 'en', href: 'https://me.example/' },
        { hreflang: 'x-default', href: 'https://me.example/' },
      ],
    });
    expect(html).toContain('<link rel="canonical" href="https://me.example/">');
    expect(html).toContain('hreflang="x-default"');
  });
});
