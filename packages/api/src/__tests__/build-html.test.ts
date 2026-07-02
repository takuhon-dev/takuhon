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

  /** Extract the declarations inside the `prefers-color-scheme: dark` `:root` block. */
  function darkRoot(html: string): string {
    const m = /@media \(prefers-color-scheme:dark\)\{:root\{([^}]*)\}\}/.exec(html);
    expect(m).not.toBeNull();
    return m?.[1] ?? '';
  }

  /** Extract the declarations inside the light `:root` block (first match). */
  function lightRoot(html: string): string {
    const m = /:root\{([^}]*)\}/.exec(html);
    expect(m).not.toBeNull();
    return m?.[1] ?? '';
  }

  it('emits the built-in :root token defaults plus a default dark block when appearance is absent', () => {
    const html = render(localized());
    expect(html).toContain(':root{');
    // Light defaults.
    expect(html).toContain('--takuhon-color-bg:#ffffff');
    expect(html).toContain('--takuhon-color-text:#1f2933');
    expect(html).toContain('--takuhon-color-primary:#2563eb');
    expect(html).toContain('--takuhon-font-family:');
    // Internal design-scale tokens (not owner-overridable) are also emitted.
    expect(html).toContain('--takuhon-space-4:16px');
    expect(html).toContain('--takuhon-line-height:1.7');
    // A default dark palette now ships (standard renderer gained dark mode).
    const darkBlock = darkRoot(html);
    expect(darkBlock).toContain('--takuhon-color-bg:#0f172a');
    expect(darkBlock).toContain('--takuhon-color-text:#e2e8f0');
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
    // A token the owner did not set keeps its light default.
    expect(html).toContain('--takuhon-color-border:#d8dee7');
    // Each token is declared once in :root (the override replaces the default).
    expect(lightRoot(html).match(/--takuhon-color-bg:/g)).toHaveLength(1);
  });

  it('merges owner colorsDark over the default dark palette (override wins, others keep dark defaults)', () => {
    const html = render(
      withAppearance({
        colorsDark: { bg: '#000000', text: '#ffffff' },
      }),
    );
    const darkBlock = darkRoot(html);
    // Owner overrides win in the dark block.
    expect(darkBlock).toContain('--takuhon-color-bg:#000000');
    expect(darkBlock).toContain('--takuhon-color-text:#ffffff');
    // A dark token the owner did not set keeps the built-in dark default.
    expect(darkBlock).toContain('--takuhon-color-border:#334155');
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
    expect(html).toContain('--takuhon-color-bg:#ffffff');
    expect(html).toContain('--takuhon-color-text:#1f2933');
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
    expect(html).toContain('--takuhon-color-bg:#ffffff');
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

  // Visual-regression guard for the shared string renderer: the whole <style>
  // block (tokens + static rules) is snapshotted so any unintended change to the
  // default look — across every adapter that uses renderProfileHtml — shows up as
  // a reviewable diff. Update deliberately with `vitest -u` when the design changes.
  it('matches the design-foundation stylesheet snapshot', () => {
    const html = render(localized());
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
    expect(style).toMatchSnapshot();
  });
});

describe('renderProfileHtml() links (brand icons + featured/other split)', () => {
  const linkDoc = {
    links: [
      { id: 'gh', type: 'github', url: 'https://github.com/pat', featured: true, order: 2 },
      { id: 'li', type: 'linkedin', url: 'https://linkedin.com/in/pat', featured: true, order: 1 },
      { id: 'site', type: 'website', url: 'https://pat.example', label: { en: 'Home' } },
      { id: 'bad', type: 'website', url: 'javascript:alert(1)', label: { en: 'Evil' } },
    ],
  };

  /** The `<nav class="…">…</nav>` block for a link group, or '' if absent. */
  function navBlock(html: string, cls: string): string {
    const re = new RegExp(`<nav class="${cls}"[\\s\\S]*?</nav>`);
    return re.exec(html)?.[0] ?? '';
  }

  it('splits links into a featured group then an other group', () => {
    const html = render(localized(linkDoc));
    expect(html).toContain('<nav class="featured-links" aria-label="Featured links">');
    expect(html).toContain('<nav class="other-links" aria-label="Links">');
    // Featured group precedes the other group (compare the nav elements, not the
    // shared `.featured-links,.other-links` CSS rule in the <style> block).
    expect(html.indexOf('<nav class="featured-links"')).toBeLessThan(
      html.indexOf('<nav class="other-links"'),
    );
  });

  it('orders featured links by their `order` field', () => {
    const featured = navBlock(render(localized(linkDoc)), 'featured-links');
    // order 1 (linkedin) comes before order 2 (github).
    expect(featured.indexOf('linkedin.com')).toBeLessThan(featured.indexOf('github.com'));
  });

  it('inlines a brand glyph for recognized types and none for the rest', () => {
    const html = render(localized(linkDoc));
    // github link carries an inline brand-icon svg with currentColor fill.
    expect(html).toContain('<svg class="brand-icon"');
    expect(html).toContain('fill="currentColor"');
    // The glyph is inline SVG — never an <img> — so no img-src is needed.
    expect(html).not.toContain('<img');
    // website has no brand mark: its list item carries a link-main but no svg.
    const other = navBlock(html, 'other-links');
    expect(other).toContain('Home');
    expect(other).not.toContain('<svg');
  });

  it('marks links rel="me noopener" and drops unsafe URLs to plain text', () => {
    const html = render(localized(linkDoc));
    expect(html).toContain('rel="me noopener"');
    // The javascript: URL is not emitted as an href; its label survives as text.
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('Evil');
  });

  it('reuses the RSS glyph for blog links (no invented icon)', () => {
    const html = render(
      localized({
        links: [
          { id: 'b', type: 'blog', url: 'https://blog.example', label: { en: 'Blog' } },
          { id: 'f', type: 'rss', url: 'https://blog.example/feed.xml', label: { en: 'Feed' } },
        ],
      }),
    );
    // The blog link carries a brand-icon svg (the RSS glyph), same as the rss link.
    expect((html.match(/<svg class="brand-icon"/g) ?? []).length).toBe(2);
    expect(html).toContain('Blog');
  });

  it('omits an empty group', () => {
    const html = render(
      localized({
        links: [{ id: 'gh', type: 'github', url: 'https://github.com/pat' }],
      }),
    );
    // No featured links → no featured-links nav element; the sole link is in
    // other-links. (Both class names still appear in the <style> CSS rule, so
    // assert on the nav element, not the bare substring.)
    expect(html).not.toContain('<nav class="featured-links"');
    expect(html).toContain('<nav class="other-links"');
  });
});

describe('renderProfileHtml() section layouts (timeline / cards)', () => {
  it('renders the Experience section as a timeline and marks the current role', () => {
    const html = render(
      localized({
        careers: [
          {
            id: 'now',
            organization: { en: 'Acme' },
            role: { en: 'Staff Engineer' },
            startDate: '2022-01',
            isCurrent: true,
          },
          {
            id: 'past',
            organization: { en: 'Globex' },
            role: { en: 'Engineer' },
            startDate: '2019-01',
            endDate: '2021-12',
          },
        ],
      }),
    );
    expect(html).toContain('<ul class="entries entries--timeline">');
    // Only the ongoing role carries the is-current marker (accent dot); the
    // inner entry markup is otherwise the shared renderEntry output.
    expect((html.match(/<li class="is-current">/g) ?? []).length).toBe(1);
  });

  it('renders the Projects section as cards and marks a highlighted project', () => {
    const html = render(
      localized({
        projects: [
          { id: 'p1', title: { en: 'Alpha' }, highlighted: true },
          { id: 'p2', title: { en: 'Beta' } },
        ],
      }),
    );
    expect(html).toContain('<ul class="entries entries--cards">');
    expect((html.match(/<li class="is-highlighted">/g) ?? []).length).toBe(1);
  });

  it('renders a flat skill chip list when no categories are configured', () => {
    const html = render(
      localized({
        skills: [
          { id: 'ts', label: 'TypeScript', category: 'programming' },
          { id: 'misc', label: 'Curiosity' },
        ],
      }),
    );
    expect(html).toContain('<ul class="skills">');
    // No grouping container element (the class name still appears as a <style> selector).
    expect(html).not.toContain('<div class="skills-groups">');
  });

  it('groups skills under configured localized headings, in declared order, dropping none', () => {
    const html = render(
      localized({
        skills: [
          { id: 'ts', label: 'TypeScript', category: 'programming' },
          { id: 'react', label: 'React', category: 'programming' },
          { id: 'wcag', label: 'WCAG', category: 'design' },
          { id: 'k8s', label: 'Kubernetes', category: 'cloud-infra' },
          { id: 'misc', label: 'Curiosity' },
        ],
        settings: {
          defaultLocale: 'en',
          availableLocales: ['en'],
          skillCategories: [
            { id: 'design', label: { en: 'Design & a11y' } },
            { id: 'programming', label: { en: 'Programming' } },
          ],
        },
      }),
    );
    expect(html).toContain('<div class="skills-groups">');
    expect(html).toContain('<div class="skill-group"><h3>Design &amp; a11y</h3>');
    expect(html).toContain('<h3>Programming</h3>');
    // Declared order wins over first-seen data order (design precedes programming).
    expect(html.indexOf('<h3>Design &amp; a11y</h3>')).toBeLessThan(
      html.indexOf('<h3>Programming</h3>'),
    );
    // A category present on a skill but not configured heads a trailing group with its raw key.
    expect(html).toContain('<h3>cloud-infra</h3>');
    // The uncategorized skill is never dropped (trailing heading-less group).
    expect(html).toContain('Curiosity');
  });

  it('localizes category headings for the resolved locale', () => {
    const doc = {
      skills: [{ id: 'ts', label: 'TypeScript', category: 'programming' }],
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en', 'ja'],
        skillCategories: [
          { id: 'programming', label: { en: 'Programming', ja: 'プログラミング' } },
        ],
      },
    };
    expect(render(localized(doc, 'ja'))).toContain('<h3>プログラミング</h3>');
    expect(render(localized(doc, 'en'))).toContain('<h3>Programming</h3>');
  });

  it('leaves other entry sections as the default flat list (no variant)', () => {
    const html = render(
      localized({
        // Clear the default career so the only timeline candidate is gone, then
        // assert education keeps the plain `.entries` list.
        careers: [],
        education: [
          {
            id: 'e1',
            institution: { en: 'State University' },
            degree: { en: 'BSc' },
            startDate: '2015-09',
            endDate: '2019-06',
          },
        ],
      }),
    );
    expect(html).toContain('State University');
    // The bare list — `<ul class="entries">` — is present (education), and no
    // timeline/cards variant list is emitted. (The variant class names still
    // appear as selectors in the <style> block, so assert on the <ul> element.)
    expect(html).toContain('<ul class="entries">');
    expect(html).not.toContain('<ul class="entries entries--timeline">');
    expect(html).not.toContain('<ul class="entries entries--cards">');
  });
});

describe('renderProfileHtml() composition seam (skip link / labels / slots / omitSections)', () => {
  it('always emits a skip link targeting <main id="main">', () => {
    const html = render(localized());
    expect(html).toContain('<a class="skip-link" href="#main">Skip to main content</a>');
    expect(html).toContain('<main id="main">');
  });

  it('overrides section headings and chrome labels for the resolved locale (defaults stay English)', () => {
    const html = render(localized(), {
      labels: {
        experience: '経歴',
        skills: 'スキル',
        skipLink: 'メインコンテンツへスキップ',
        featuredLinks: '主要リンク',
      },
    });
    expect(html).toContain('<h2>経歴</h2>');
    expect(html).toContain('<h2>スキル</h2>');
    expect(html).toContain('<a class="skip-link" href="#main">メインコンテンツへスキップ</a>');
    expect(html).toContain('aria-label="主要リンク"');
    // An un-overridden label keeps its English default.
    expect(html).not.toContain('<h2>Experience</h2>');
    expect(html).not.toContain('<h2>Skills</h2>');
  });

  it('escapes overridden label text', () => {
    const html = render(localized(), { labels: { skills: '<b>x</b>' } });
    expect(html).toContain('<h2>&lt;b&gt;x&lt;/b&gt;</h2>');
    expect(html).not.toContain('<h2><b>x</b></h2>');
  });

  it('injects the head slot verbatim (raw, not escaped) after the <style> block', () => {
    const html = render(localized(), {
      slots: { head: '<meta property="og:title" content="Pat & Co">' },
    });
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)![1] ?? '';
    expect(head).toContain('<meta property="og:title" content="Pat & Co">');
    expect(head.indexOf('</style>')).toBeLessThan(head.indexOf('og:title'));
  });

  it('injects the mainEnd slot inside <main>, after the sections', () => {
    const html = render(localized(), {
      slots: { mainEnd: '<section id="social">posts</section>' },
    });
    const main = /<main id="main">([\s\S]*?)<\/main>/.exec(html)![1] ?? '';
    expect(main).toContain('<section id="social">posts</section>');
    // Sits after a rendered section (Skills is present in the fixture).
    expect(main.indexOf('<h2>Skills</h2>')).toBeLessThan(main.indexOf('id="social"'));
  });

  it('injects the bodyEnd slot before </body>, after the contact script', () => {
    const html = render(localized(), {
      slots: { bodyEnd: '<script>beacon()</script>' },
    });
    expect(html).toContain('<script>beacon()</script></body>');
    // Outside <main>.
    const main = /<main id="main">([\s\S]*?)<\/main>/.exec(html)![1] ?? '';
    expect(main).not.toContain('beacon()');
  });

  it('emits nothing for absent slots (byte-identical to no-slots)', () => {
    const withEmpty = render(localized(), { slots: {} });
    const without = render(localized());
    expect(withEmpty).toBe(without);
  });

  it('omitSections suppresses a section in the visible body but NOT in the JSON-LD', () => {
    const withSkills = render(localized());
    const omitted = render(localized(), { omitSections: ['skills'] });
    // Visible section gone.
    expect(withSkills).toContain('<h2>Skills</h2>');
    expect(omitted).not.toContain('<h2>Skills</h2>');
    // JSON-LD is generated from the full document, so it is byte-identical
    // regardless of which visible sections are omitted.
    const jsonLd = (h: string) =>
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1];
    expect(jsonLd(omitted)).toBe(jsonLd(withSkills));
  });
});
