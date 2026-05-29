import { resolveLocale, validate } from '@takuhon/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { TakuhonHead } from '../TakuhonHead.js';

const validated = validate(exampleJson);
if (!validated.ok) {
  throw new Error('Example fixture failed validation; UI tests cannot run.');
}
const exampleEn = resolveLocale(validated.data, 'en');
const exampleJa = resolveLocale(validated.data, 'ja');

// The canonical deployment serves the rendered profile at the site root,
// so the realistic advertised form is `/{locale}/` (resolved by the public
// app's `/` allowlist entry). A non-root page URL is also exercised below to
// document that TakuhonHead inserts the locale segment regardless of routing
// — serving such a page path is the deployment's responsibility, not the
// public app's.
const PAGE_URL = 'https://example.com/';
const SITE_URL = 'https://example.com';

describe('TakuhonHead', () => {
  it('sets document.title from profile.displayName', () => {
    render(<TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    expect(document.title).toBe('Pat Rivera');
  });

  it('emits meta description from profile.bio', () => {
    render(<TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const meta = document.head.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toContain('Pat Rivera');
  });

  it('emits canonical in path form for the current resolvedLocale', () => {
    render(<TakuhonHead data={exampleJa} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://example.com/ja/');
  });

  it('emits og:title, og:description, og:image, og:url, og:locale, and og:locale:alternate', () => {
    render(<TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    const ogDesc = document.head.querySelector('meta[property="og:description"]');
    const ogImage = document.head.querySelector('meta[property="og:image"]');
    const ogUrl = document.head.querySelector('meta[property="og:url"]');
    const ogLocale = document.head.querySelector('meta[property="og:locale"]');
    const ogAlternates = document.head.querySelectorAll('meta[property="og:locale:alternate"]');
    const canonical = document.head.querySelector('link[rel="canonical"]');

    expect(ogTitle?.getAttribute('content')).toBe('Pat Rivera');
    expect(ogDesc?.getAttribute('content')).toContain('Open-source');
    expect(ogImage?.getAttribute('content')).toBe('https://example.com/assets/avatar.webp');
    // og:url is the path-form self URL — identical to canonical.
    expect(ogUrl?.getAttribute('content')).toBe('https://example.com/en/');
    expect(ogUrl?.getAttribute('content')).toBe(canonical?.getAttribute('href'));
    expect(ogLocale?.getAttribute('content')).toBe('en');
    const alts = Array.from(ogAlternates).map((m) => m.getAttribute('content'));
    expect(alts).toEqual(['ja']);
  });

  it('emits hreflang link in path form for each available locale plus x-default', () => {
    render(<TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const alternates = document.head.querySelectorAll('link[rel="alternate"]');
    const entries = Array.from(alternates).map((l) => ({
      hreflang: l.getAttribute('hreflang'),
      href: l.getAttribute('href'),
    }));
    expect(entries).toEqual([
      { hreflang: 'en', href: 'https://example.com/en/' },
      { hreflang: 'ja', href: 'https://example.com/ja/' },
      { hreflang: 'x-default', href: 'https://example.com/en/' },
    ]);
  });

  it('inserts the locale into a non-root page path (deployment-routed)', () => {
    // A deployment that serves the rendered profile at a sub-path gets the
    // locale segment inserted there; serving that path is the deployment's
    // responsibility (the public app serves JSON, not the rendered profile).
    render(
      <TakuhonHead data={exampleJa} siteUrl={SITE_URL} pageUrl="https://example.com/profile" />,
    );
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://example.com/ja/profile');
  });

  it('replaces an existing locale segment rather than stacking prefixes', () => {
    // The current page is already locale-prefixed (/ja/profile). Alternates
    // must swap the segment (/en/profile), never stack it (/en/ja/profile).
    render(
      <TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl="https://example.com/ja/profile" />,
    );
    const alternates = document.head.querySelectorAll('link[rel="alternate"]');
    const hrefs = Array.from(alternates).map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual([
      'https://example.com/en/profile',
      'https://example.com/ja/profile',
      'https://example.com/en/profile',
    ]);
  });

  it('consolidates a regional path segment to an available primary subtag', () => {
    // Page served at /en-US/ but the profile only offers en/ja. The leading
    // segment is recognized via primary-subtag match and stripped, so the
    // canonical consolidates to /en/ rather than stacking to /en/en-US/.
    render(
      <TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl="https://example.com/en-US/" />,
    );
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://example.com/en/');
  });

  it('drops a legacy ?lang= query when building path-form URLs', () => {
    render(
      <TakuhonHead
        data={exampleJa}
        siteUrl={SITE_URL}
        pageUrl="https://example.com/profile?lang=en"
      />,
    );
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://example.com/ja/profile');
  });

  it('emits a JSON-LD script by default and omits it when enableJsonLd is false', () => {
    const { unmount } = render(
      <TakuhonHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />,
    );
    const script = document.head.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const payload = JSON.parse(script!.textContent ?? '[]') as Record<string, unknown>[];
    expect(payload[0]?.['@type']).toBe('ProfilePage');
    unmount();
    document.head.innerHTML = '';

    render(
      <TakuhonHead
        data={{ ...exampleEn, settings: { ...exampleEn.settings, enableJsonLd: false } }}
        siteUrl={SITE_URL}
        pageUrl={PAGE_URL}
      />,
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
