import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { SCHEMA_VERSION } from '../index.js';
import type { LinkCustom, Takuhon } from '../types.js';

// JSON imports widen string literals (e.g. `links[].type` becomes `string` instead
// of `LinkType`), so a direct `const example: Takuhon = exampleJson` assignment is
// rejected by TypeScript even when the data is otherwise compatible. Cast through
// the type at the boundary; deeper drift detection (every value matches the schema)
// arrives with the Ajv-based `validate()` test suite in the next commit.
const example = exampleJson as Takuhon;

describe('examples/personal-profile/takuhon.json', () => {
  it('matches the bundled SCHEMA_VERSION', () => {
    expect(example.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('contains every required top-level field', () => {
    const keys = Object.keys(example).sort();
    expect(keys).toEqual(
      [
        'schemaVersion',
        'profile',
        'links',
        'careers',
        'projects',
        'skills',
        'contact',
        'settings',
        'meta',
      ].sort(),
    );
  });

  it('exercises the multilingual title fields across multiple locales', () => {
    expect(Object.keys(example.profile.displayName).sort()).toEqual(['en', 'ja']);
    expect(example.profile.tagline?.en).toBeTypeOf('string');
    expect(example.profile.tagline?.ja).toBeTypeOf('string');
    expect(example.profile.bio?.en).toBeTypeOf('string');
  });

  it('declares all locales the profile advertises in settings', () => {
    expect(example.settings.availableLocales).toEqual(expect.arrayContaining(['en', 'ja']));
    expect(example.settings.defaultLocale).toBe('en');
  });

  it('exercises every Settings flag from Spec §6.11', () => {
    expect(example.settings.theme).toBeTypeOf('string');
    expect(example.settings.showPoweredBy).toBeTypeOf('boolean');
    expect(example.settings.enableJsonLd).toBeTypeOf('boolean');
    expect(example.settings.enableApi).toBeTypeOf('boolean');
    expect(example.settings.enableAnalytics).toBe(false);
  });

  it('populates Meta.generator', () => {
    expect(example.meta.generator).toBeTypeOf('string');
  });

  it('gives every skill an id and uses Spec §6.9 recommended categories', () => {
    expect(example.skills.length).toBeGreaterThan(0);
    const recommended = new Set([
      'programming',
      'design',
      'business',
      'communication',
      'language',
      'music',
      'art',
      'sports',
      'other',
    ]);
    for (const skill of example.skills) {
      expect(skill.id).toBeTypeOf('string');
      expect(skill.id.length).toBeGreaterThan(0);
      if (skill.category !== undefined) {
        expect(recommended.has(skill.category)).toBe(true);
      }
    }
  });

  it('chooses a non-empty content license (no implicit default)', () => {
    expect(example.meta.contentLicense.spdxId).toBeTypeOf('string');
    expect(example.meta.contentLicense.spdxId.length).toBeGreaterThan(0);
  });

  it('contains a current career entry plus at least one past entry', () => {
    const current = example.careers.find((career) => career.isCurrent === true);
    const past = example.careers.find((career) => career.isCurrent !== true);
    expect(current).toBeDefined();
    expect(current?.endDate).toBeNull();
    expect(past).toBeDefined();
    expect(typeof past?.endDate).toBe('string');
  });

  it('demonstrates a custom-type link with the required iconUrl', () => {
    const customLink = example.links.find((link) => link.type === 'custom');
    expect(customLink).toBeDefined();
    expect(customLink?.iconUrl).toBeTypeOf('string');
  });

  it('rejects custom links missing iconUrl at compile time', () => {
    // The discriminated union mirrors the schema's allOf/if/then rule:
    // omitting iconUrl on a `type: 'custom'` link is a TS error before Ajv
    // validation even runs. The @ts-expect-error below trips the typecheck if
    // the constraint regresses.
    // @ts-expect-error iconUrl is required when type is 'custom'.
    const _invalid: LinkCustom = {
      id: 'invalid-custom',
      type: 'custom',
      url: 'https://example.com/missing-icon',
    };
    void _invalid;
    expect(true).toBe(true);
  });

  it('ties at least one project to a career via relatedCareerId', () => {
    const linked = example.projects.find((project) => project.relatedCareerId !== undefined);
    expect(linked).toBeDefined();
    const careerIds = new Set(example.careers.map((career) => career.id));
    expect(careerIds.has(linked?.relatedCareerId ?? '')).toBe(true);
  });
});
