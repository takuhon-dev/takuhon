import { describe, expect, it } from 'vitest';

import minimalProfile from '../../../../examples/minimal-profile/takuhon.json';
import personalProfile from '../../../../examples/personal-profile/takuhon.json';

import { deriveBundle } from './derive';

const STAMP = '2026-06-15T00:00:00.000Z';

describe('deriveBundle', () => {
  it('derives per-locale public artifacts for a multi-locale profile', () => {
    const result = deriveBundle(personalProfile, STAMP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { public: bundle } = result;

    // The default locale first, then the rest.
    expect(bundle.meta.locales).toEqual(['en', 'ja']);
    expect(bundle.meta.default_locale).toBe('en');
    expect(bundle.meta.schema_version).toBe('0.7.0');
    expect(bundle.meta.generated_at).toBe(STAMP);

    // A privacy-filtered, locale-resolved profile envelope per locale.
    expect(Object.keys(bundle.profiles).sort()).toEqual(['en', 'ja']);
    expect(bundle.profiles.en?.meta.locale).toBe('en');
    expect(bundle.profiles.ja?.meta.locale).toBe('ja');
    expect(bundle.profiles.en?.meta.schemaVersion).toBe('0.7.0');

    // JSON-LD per locale.
    expect(Object.keys(bundle.jsonld).sort()).toEqual(['en', 'ja']);

    // A server-rendered HTML document per locale.
    expect(Object.keys(bundle.pages).sort()).toEqual(['en', 'ja']);
    expect(bundle.pages.en).toContain('<!DOCTYPE html>');
    expect(bundle.pages.ja).toContain('<!DOCTYPE html>');

    // Locale-independent canonical profile, the schema, and the master.
    expect(bundle.canonical).toBeTypeOf('object');
    expect(bundle.schema).toBeTypeOf('object');
    expect(result.master).toBeTypeOf('object');
  });

  it('handles a single-locale profile', () => {
    const result = deriveBundle(minimalProfile, STAMP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.public.meta.locales).toEqual(['en']);
    expect(Object.keys(result.public.profiles)).toEqual(['en']);
    expect(Object.keys(result.public.pages)).toEqual(['en']);
  });

  it('applies the public privacy filter to the derived artifacts', () => {
    // Hide the careers section via section-level visibility; the example has
    // career entries, so the filtered output must drop them.
    const original = personalProfile as { careers?: unknown[]; settings: Record<string, unknown> };
    expect(Array.isArray(original.careers) && original.careers.length > 0).toBe(true);

    const hidden = structuredClone(personalProfile) as typeof original;
    hidden.settings = { ...hidden.settings, publicVisibility: { careers: false } };

    const result = deriveBundle(hidden, STAMP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const canonical = result.public.canonical as { careers?: unknown[] };
    expect(canonical.careers ?? []).toEqual([]);

    const en = result.public.profiles.en?.data as { careers?: unknown[] };
    expect(en.careers ?? []).toEqual([]);
  });

  it('reports validation errors for an invalid profile', () => {
    const result = deriveBundle({ not: 'a takuhon profile' }, STAMP);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
