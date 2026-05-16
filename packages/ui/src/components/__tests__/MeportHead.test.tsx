import { resolveLocale, validate } from '@meport/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/meport.json' with { type: 'json' };
import { MeportHead } from '../MeportHead.js';

const validated = validate(exampleJson);
if (!validated.ok) {
  throw new Error('Example fixture failed validation; UI tests cannot run.');
}
const exampleEn = resolveLocale(validated.data, 'en');
const exampleJa = resolveLocale(validated.data, 'ja');

const PAGE_URL = 'https://example.com/profile';
const SITE_URL = 'https://example.com';

describe('MeportHead', () => {
  it('sets document.title from profile.displayName', () => {
    render(<MeportHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    expect(document.title).toBe('Pat Rivera');
  });

  it('emits meta description from profile.bio', () => {
    render(<MeportHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const meta = document.head.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toContain('Pat Rivera');
  });

  it('emits canonical with current resolvedLocale as ?lang', () => {
    render(<MeportHead data={exampleJa} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://example.com/profile?lang=ja');
  });

  it('emits og:title, og:description, og:image, og:locale, and og:locale:alternate', () => {
    render(<MeportHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    const ogDesc = document.head.querySelector('meta[property="og:description"]');
    const ogImage = document.head.querySelector('meta[property="og:image"]');
    const ogLocale = document.head.querySelector('meta[property="og:locale"]');
    const ogAlternates = document.head.querySelectorAll('meta[property="og:locale:alternate"]');

    expect(ogTitle?.getAttribute('content')).toBe('Pat Rivera');
    expect(ogDesc?.getAttribute('content')).toContain('Open-source');
    expect(ogImage?.getAttribute('content')).toBe('https://example.com/assets/avatar.webp');
    expect(ogLocale?.getAttribute('content')).toBe('en');
    const alts = Array.from(ogAlternates).map((m) => m.getAttribute('content'));
    expect(alts).toEqual(['ja']);
  });

  it('emits hreflang link for each available locale plus x-default', () => {
    render(<MeportHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />);
    const alternates = document.head.querySelectorAll('link[rel="alternate"]');
    const entries = Array.from(alternates).map((l) => ({
      hreflang: l.getAttribute('hreflang'),
      href: l.getAttribute('href'),
    }));
    expect(entries).toEqual([
      { hreflang: 'en', href: 'https://example.com/profile?lang=en' },
      { hreflang: 'ja', href: 'https://example.com/profile?lang=ja' },
      { hreflang: 'x-default', href: 'https://example.com/profile?lang=en' },
    ]);
  });

  it('emits a JSON-LD script by default and omits it when enableJsonLd is false', () => {
    const { unmount } = render(
      <MeportHead data={exampleEn} siteUrl={SITE_URL} pageUrl={PAGE_URL} />,
    );
    const script = document.head.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const payload = JSON.parse(script!.textContent ?? '[]') as Record<string, unknown>[];
    expect(payload[0]?.['@type']).toBe('ProfilePage');
    unmount();
    document.head.innerHTML = '';

    render(
      <MeportHead
        data={{ ...exampleEn, settings: { ...exampleEn.settings, enableJsonLd: false } }}
        siteUrl={SITE_URL}
        pageUrl={PAGE_URL}
      />,
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
