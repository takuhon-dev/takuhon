import { getPresentLabel, normalize, resolveLocale } from '@takuhon/core';
import type { ActivitySnapshot, LocalizedTakuhon, Takuhon } from '@takuhon/core';
import { describe, expect, it } from 'vitest';

import { escapeHtml, renderProfileHtml, type RenderInput } from '../html/build-html.js';

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

  it('renders dates as localized <time> elements with the ISO value preserved', () => {
    const html = render(localized());
    expect(html).toContain('<time datetime="2020-01">Jan 2020</time>');
  });

  it('localizes dates and the Present marker for the resolved locale', () => {
    const overrides = {
      profile: { displayName: { en: 'Pat', ja: 'パット' }, tagline: { en: 'Maintainer' } },
      careers: [
        {
          id: 'job',
          organization: { en: 'Acme', ja: 'アクメ' },
          role: { en: 'Engineer', ja: 'エンジニア' },
          startDate: '2020-01',
          isCurrent: true,
        },
      ],
      settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    };

    const en = render(localized(overrides, 'en'));
    expect(en).toContain('<time datetime="2020-01">Jan 2020</time>');
    expect(en).toContain(`– ${getPresentLabel('en')}`); // "Present"
    expect(en).not.toContain('現在');

    const ja = render(localized(overrides, 'ja'));
    expect(ja).toContain('<time datetime="2020-01">2020年1月</time>');
    expect(ja).toContain(`– ${getPresentLabel('ja')}`); // "現在"
    expect(ja).not.toContain('Present');
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

  it('renders the inline-SVG activity section when a snapshot is supplied', () => {
    const snapshot: ActivitySnapshot = {
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      languages: [{ name: 'TypeScript', bytes: 800, percent: 80 }],
    };
    const html = render(localized(), { activitySnapshot: snapshot });
    expect(html).toContain('<section class="activity"><h2>Activity</h2><svg');
    expect(html).toContain('TypeScript 80%');
  });

  it('omits the activity section without a snapshot or when it has no metrics', () => {
    expect(render(localized())).not.toContain('class="activity"');
    const empty = render(localized(), {
      activitySnapshot: { lastSyncedAt: '2026-06-11T00:00:00.000Z' },
    });
    expect(empty).not.toContain('class="activity"');
  });

  it('embeds the contact widget (stylesheet + data-attribute script, no inline script) when configured', () => {
    const html = render(localized(), { contact: { siteKey: '0xABC' } });
    expect(html).toContain('<link rel="stylesheet" href="/contact-widget.css">');
    expect(html).toContain(
      '<script src="/contact-widget.js" data-site-key="0xABC" defer></script>',
    );
    // The config travels as a data attribute — never as an inline bootstrap
    // script — so the page CSP needs no 'unsafe-inline'.
    expect(html).not.toContain('TAKUHON_CONTACT');
  });

  it('adds data-endpoint only when a custom endpoint is given', () => {
    const withEndpoint = render(localized(), {
      contact: { siteKey: '0xABC', endpoint: '/api/contact' },
    });
    expect(withEndpoint).toContain('data-endpoint="/api/contact"');
    const withoutEndpoint = render(localized(), { contact: { siteKey: '0xABC' } });
    expect(withoutEndpoint).not.toContain('data-endpoint');
  });

  it('escapes the site key in the data attribute', () => {
    const html = render(localized(), { contact: { siteKey: '"><img src=x>' } });
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain('data-site-key="&quot;&gt;&lt;img src=x&gt;"');
  });

  it('omits the contact widget when not configured', () => {
    const html = render(localized());
    expect(html).not.toContain('contact-widget.js');
    expect(html).not.toContain('contact-widget.css');
  });
});

describe('renderProfileHtml() appearance tokens (settings.appearance)', () => {
  /** Build a localized doc whose settings carry the given appearance block. */
  function withAppearance(appearance: unknown): LocalizedTakuhon {
    return localized({
      settings: { defaultLocale: 'en', availableLocales: ['en'], appearance },
    });
  }

  it('emits the built-in :root token defaults when appearance is absent', () => {
    const html = render(localized());
    expect(html).toContain(':root{');
    expect(html).toContain('--takuhon-color-bg:#fff');
    expect(html).toContain('--takuhon-color-text:#1a1a1a');
    expect(html).toContain('--takuhon-color-primary:#0b5fff');
    expect(html).toContain('--takuhon-font-family:');
    // No dark block is emitted without colorsDark.
    expect(html).not.toContain('prefers-color-scheme:dark');
  });

  it('the static rules reference tokens, not hard-coded colors', () => {
    const html = render(localized());
    expect(html).toContain('background:var(--takuhon-color-bg)');
    expect(html).toContain('color:var(--takuhon-color-text)');
    expect(html).toContain('a{color:var(--takuhon-color-primary)}');
    // The pre-token literals are gone.
    expect(html).not.toContain('background:#fff}');
    expect(html).not.toContain('color:var(--muted)');
  });

  it('merges owner color and font overrides into :root (override wins)', () => {
    const html = render(
      withAppearance({
        fontFamily: 'Inter, system-ui, sans-serif',
        colors: { bg: '#0b1020', text: 'rgb(230, 236, 245)', accent: '#f59e0b' },
      }),
    );
    expect(html).toContain('--takuhon-color-bg:#0b1020');
    expect(html).toContain('--takuhon-color-text:rgb(230, 236, 245)');
    expect(html).toContain('--takuhon-color-accent:#f59e0b');
    expect(html).toContain('--takuhon-font-family:Inter, system-ui, sans-serif');
    // A token the owner did not set keeps its default.
    expect(html).toContain('--takuhon-color-border:#e5e5e5');
    // Each token is declared once (the override replaces the default, not appends).
    expect(html.match(/--takuhon-color-bg:/g)).toHaveLength(1);
  });

  it('emits a prefers-color-scheme: dark block only for colorsDark keys', () => {
    const html = render(
      withAppearance({
        colors: { bg: '#ffffff' },
        colorsDark: { bg: '#0f172a', text: '#e2e8f0' },
      }),
    );
    const darkMatch = /@media \(prefers-color-scheme:dark\)\{:root\{([^}]*)\}\}/.exec(html);
    expect(darkMatch).not.toBeNull();
    const darkBlock = darkMatch![1];
    expect(darkBlock).toContain('--takuhon-color-bg:#0f172a');
    expect(darkBlock).toContain('--takuhon-color-text:#e2e8f0');
    // Dark block carries only the overridden keys, not the full default set.
    expect(darkBlock).not.toContain('--takuhon-color-border');
  });

  it('drops unsafe token values and keeps the default (CSS-injection guard)', () => {
    const html = render(
      withAppearance({
        colors: {
          // Attempts to close the declaration / element are rejected outright.
          bg: 'red;} body{display:none',
          text: '#111} </style><script>alert(1)</script>',
          accent: '#00ff00',
        },
      }),
    );
    // Malicious values never reach the stylesheet.
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('</style><script>');
    // The rejected tokens fall back to their defaults; the safe one is applied.
    expect(html).toContain('--takuhon-color-bg:#fff');
    expect(html).toContain('--takuhon-color-text:#1a1a1a');
    expect(html).toContain('--takuhon-color-accent:#00ff00');
  });

  it('drops url()/fetch-bearing color values (no external-request injection)', () => {
    const html = render(
      withAppearance({
        colors: {
          // These carry no ;{}<> yet would trigger a third-party fetch or a
          // reference if emitted verbatim. Only an allowlist stops them.
          bg: 'url(//evil.example/track.png)',
          surface: 'url(track.png)',
          text: 'image-set(a.png)',
          border: 'var(--x)',
          accent: 'rgb(0, 255, 0)', // a legitimate function value still passes
        },
      }),
    );
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('url(');
    expect(html).not.toContain('image-set(');
    expect(html).not.toContain('var(--x)');
    // Rejected tokens keep defaults; the valid rgb() override is applied.
    expect(html).toContain('--takuhon-color-bg:#fff');
    expect(html).toContain('--takuhon-color-accent:rgb(0, 255, 0)');
  });

  it('accepts hex, named, and modern color functions', () => {
    const html = render(
      withAppearance({
        colors: {
          bg: '#0b1020',
          surface: 'rebeccapurple',
          text: 'currentColor',
          border: 'hsl(210 40% 20%)',
          accent: 'oklch(0.7 0.1 200 / 0.5)',
        },
      }),
    );
    expect(html).toContain('--takuhon-color-bg:#0b1020');
    expect(html).toContain('--takuhon-color-surface:rebeccapurple');
    expect(html).toContain('--takuhon-color-text:currentColor');
    expect(html).toContain('--takuhon-color-border:hsl(210 40% 20%)');
    expect(html).toContain('--takuhon-color-accent:oklch(0.7 0.1 200 / 0.5)');
  });
});
