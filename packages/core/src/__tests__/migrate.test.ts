import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { migrateTakuhon, MigrationError, migrations, validate } from '../index.js';
import type { Takuhon } from '../index.js';

function cloneExample(): Takuhon {
  return JSON.parse(JSON.stringify(exampleJson)) as Takuhon;
}

describe('migrateTakuhon', () => {
  it('returns a structural clone when sourceVersion === targetVersion', () => {
    const input = cloneExample();
    const out = migrateTakuhon(input, input.schemaVersion);
    expect(out).toEqual(input);
    // Mutating the result does not touch the input.
    out.profile.displayName = { en: 'mutated' };
    expect(input.profile.displayName).not.toEqual({ en: 'mutated' });
  });

  it('throws MigrationError when no chain to an unknown target version exists', () => {
    const input = cloneExample();
    expect(() => migrateTakuhon(input, '9.9.9')).toThrow(MigrationError);
  });

  it('error message names both source and target versions', () => {
    const input = cloneExample();
    let caught: unknown;
    try {
      migrateTakuhon(input, '9.9.9');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MigrationError);
    expect((caught as Error).message).toContain(input.schemaVersion);
    expect((caught as Error).message).toContain('9.9.9');
  });

  it('does not mutate the input even when migrate throws', () => {
    const input = cloneExample();
    const snapshot = JSON.stringify(input);
    expect(() => migrateTakuhon(input, '9.9.9')).toThrow();
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('migrates a 0.1.0 input forward to 0.2.0 by adding nine empty arrays', () => {
    // Construct a minimal 0.1.0-shaped value as `unknown` and run it through
    // the registry. The expected output is the same value with
    // `schemaVersion: '0.2.0'` and the nine new top-level arrays initialised.
    const v010 = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v010, '0.2.0');
    expect(out.schemaVersion).toBe('0.2.0');
    expect(out.certifications).toEqual([]);
    expect(out.memberships).toEqual([]);
    expect(out.volunteering).toEqual([]);
    expect(out.honors).toEqual([]);
    expect(out.education).toEqual([]);
    expect(out.publications).toEqual([]);
    expect(out.languages).toEqual([]);
    expect(out.courses).toEqual([]);
    expect(out.patents).toEqual([]);
    // Pre-existing fields pass through untouched.
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(out.settings.defaultLocale).toBe('en');
  });

  it('preserves pre-existing additionalProperties values during migration (no overwrite)', () => {
    // Defensive: even though 0.1.0 schema closes the root, the migration
    // accepts unknown shapes and must not wipe a value at one of the nine
    // new keys (Codex review Q2, Spec §24-15).
    const input = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      certifications: [
        {
          id: 'pre-existing',
          title: { en: 'Pre' },
          issuingOrganization: { en: 'Org' },
          issueDate: '2024-01',
        },
      ],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(input, '0.2.0');
    expect(out.certifications).toHaveLength(1);
    expect(out.certifications[0]?.id).toBe('pre-existing');
  });

  it('migrates a 0.2.0 input forward to 0.3.0 by adding an empty testScores array', () => {
    // A 0.2.0-shaped value: the nine arrays present, no testScores. The
    // expected output is the same value with schemaVersion '0.3.0' and
    // testScores initialised to [].
    const v020 = {
      schemaVersion: '0.2.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      certifications: [],
      memberships: [],
      volunteering: [],
      honors: [],
      education: [],
      publications: [],
      languages: [],
      courses: [],
      patents: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v020, '0.3.0');
    expect(out.schemaVersion).toBe('0.3.0');
    expect(out.testScores).toEqual([]);
    // Pre-existing fields pass through untouched (additive migration).
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(out.settings.defaultLocale).toBe('en');
    expect(out.certifications).toEqual([]);
    expect(out.patents).toEqual([]);
    // The migrated document validates against the 0.3.0 schema (operational
    // -lifecycle §2.5: migration output must pass the target schema).
    expect(validate(out).ok).toBe(true);
  });

  it('preserves a pre-existing testScores value during migration (no overwrite)', () => {
    // Defensive: even though the 0.2.0 schema closes the root, the migration
    // accepts unknown shapes and must not wipe a value already present at
    // testScores (mirrors the 0.1.0 → 0.2.0 additionalProperties guard).
    const input = {
      schemaVersion: '0.2.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      certifications: [],
      memberships: [],
      volunteering: [],
      honors: [],
      education: [],
      publications: [],
      languages: [],
      courses: [],
      patents: [],
      testScores: [{ id: 'pre', title: { en: 'Pre' }, score: '100', date: '2024-01' }],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(input, '0.3.0');
    expect(out.testScores).toHaveLength(1);
    expect(out.testScores[0]?.id).toBe('pre');
  });

  it('chains 0.1.0 → 0.3.0 through both registered migrations', () => {
    const v010 = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v010, '0.3.0');
    expect(out.schemaVersion).toBe('0.3.0');
    // Both hops applied: the nine 0.2.0 arrays and the 0.3.0 testScores array
    // are all initialised.
    expect(out.certifications).toEqual([]);
    expect(out.patents).toEqual([]);
    expect(out.testScores).toEqual([]);
    // The chained output validates against the 0.3.0 schema.
    expect(validate(out).ok).toBe(true);
  });

  it('migrates a 0.3.0 input forward to 0.4.0 by adding an empty recommendations array', () => {
    const v030 = {
      schemaVersion: '0.3.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      certifications: [],
      memberships: [],
      volunteering: [],
      honors: [],
      education: [],
      publications: [],
      languages: [],
      courses: [],
      patents: [],
      testScores: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v030, '0.4.0');
    expect(out.schemaVersion).toBe('0.4.0');
    expect(out.recommendations).toEqual([]);
    // Pre-existing fields pass through untouched (additive migration).
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(out.testScores).toEqual([]);
    expect(out.patents).toEqual([]);
    expect(validate(out).ok).toBe(true);
  });

  it('preserves a pre-existing recommendations value during migration (no overwrite)', () => {
    const input = {
      schemaVersion: '0.3.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      recommendations: [{ id: 'pre', body: { en: 'Pre' }, author: { name: 'Ref' } }],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(input, '0.4.0');
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0]?.id).toBe('pre');
  });

  it('migrates a 0.4.0 input forward to 0.5.0 (version stamp; settings.activity is optional)', () => {
    const v040 = {
      schemaVersion: '0.4.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      recommendations: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v040, '0.5.0');
    expect(out.schemaVersion).toBe('0.5.0');
    // Additive, version-only: no settings.activity is invented.
    expect(out.settings.activity).toBeUndefined();
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(validate(out).ok).toBe(true);
  });

  it('chains 0.1.0 → 0.5.0 through all four registered migrations', () => {
    const v010 = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v010, '0.5.0');
    expect(out.schemaVersion).toBe('0.5.0');
    // All four hops applied: nine 0.2.0 arrays + 0.3.0 testScores + 0.4.0 recommendations.
    expect(out.certifications).toEqual([]);
    expect(out.testScores).toEqual([]);
    expect(out.recommendations).toEqual([]);
    expect(validate(out).ok).toBe(true);
  });

  it('migrates a 0.5.0 input forward to 0.6.0 (version stamp; settings.publicVisibility is optional)', () => {
    const v050 = {
      schemaVersion: '0.5.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      recommendations: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v050, '0.6.0');
    expect(out.schemaVersion).toBe('0.6.0');
    // Additive, version-only: no settings.publicVisibility is invented
    // (default is all-sections-visible, so an absent block is correct).
    expect(out.settings.publicVisibility).toBeUndefined();
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(validate(out).ok).toBe(true);
  });

  it('preserves a pre-existing settings.publicVisibility value during migration (no overwrite)', () => {
    const input = {
      schemaVersion: '0.5.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        publicVisibility: { education: false },
      },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(input, '0.6.0');
    expect(out.settings.publicVisibility).toEqual({ education: false });
  });

  it('migrates a 0.6.0 input forward to 0.7.0 (version stamp; per-item visibility is optional)', () => {
    const v060 = {
      schemaVersion: '0.6.0',
      profile: { displayName: { en: 'Test' } },
      links: [{ id: 'site', type: 'website', url: 'https://example.com' }],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v060, '0.7.0');
    expect(out.schemaVersion).toBe('0.7.0');
    // Additive, version-only: no item gains a visibility value (absent = public).
    expect(out.links[0]!.visibility).toBeUndefined();
    expect(validate(out).ok).toBe(true);
  });

  it('migrates a 0.7.0 input forward to 1.0.0 (version stamp; freeze tightens validation only)', () => {
    const v070 = {
      schemaVersion: '0.7.0',
      profile: { displayName: { en: 'Test' } },
      links: [{ id: 'site', type: 'website', url: 'https://example.com' }],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v070, '1.0.0');
    expect(out.schemaVersion).toBe('1.0.0');
    // Pure version stamp: the freeze only tightens validation, it never
    // rewrites a conforming value.
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(out.links[0]!.id).toBe('site');
    // A closed-safe 0.7.0 document validates unchanged against the 1.0.0 schema.
    expect(validate(out).ok).toBe(true);
  });

  it('migrates a 1.0.0 input forward to 1.1.0 (version stamp; settings.contact is optional)', () => {
    const v100 = {
      schemaVersion: '1.0.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v100, '1.1.0');
    expect(out.schemaVersion).toBe('1.1.0');
    // Pure version stamp: 1.1.0 only adds the optional settings.contact block.
    expect(out.profile.displayName).toEqual({ en: 'Test' });
    expect(out.settings.contact).toBeUndefined();
    expect(validate(out).ok).toBe(true);
  });

  it('chains 0.1.0 → 0.6.0 through all five registered migrations', () => {
    const v010 = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v010, '0.6.0');
    expect(out.schemaVersion).toBe('0.6.0');
    // All five hops applied through to the 0.6.0 version stamp.
    expect(out.certifications).toEqual([]);
    expect(out.testScores).toEqual([]);
    expect(out.recommendations).toEqual([]);
    expect(out.settings.publicVisibility).toBeUndefined();
    expect(validate(out).ok).toBe(true);
  });

  it('chains 0.1.0 → 1.0.0 through all seven registered migrations', () => {
    const v010 = {
      schemaVersion: '0.1.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    } as unknown as Takuhon;

    const out = migrateTakuhon(v010, '1.0.0');
    expect(out.schemaVersion).toBe('1.0.0');
    // All seven hops applied through to the 1.0.0 freeze.
    expect(out.certifications).toEqual([]);
    expect(out.testScores).toEqual([]);
    expect(out.recommendations).toEqual([]);
    expect(validate(out).ok).toBe(true);
  });

  it('MigrationError is an Error with the right name', () => {
    const err = new MigrationError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MigrationError);
    expect(err.name).toBe('MigrationError');
    expect(err.message).toBe('boom');
  });

  it('MigrationError preserves cause when supplied', () => {
    const cause = new Error('underlying');
    const err = new MigrationError('boom', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('migrations registry', () => {
  it('contains the v0.1.0 → … → v1.1.0 entries in chain order', () => {
    expect(migrations).toHaveLength(8);
    expect(migrations[0]).toMatchObject({ from: '0.1.0', to: '0.2.0' });
    expect(migrations[1]).toMatchObject({ from: '0.2.0', to: '0.3.0' });
    expect(migrations[2]).toMatchObject({ from: '0.3.0', to: '0.4.0' });
    expect(migrations[3]).toMatchObject({ from: '0.4.0', to: '0.5.0' });
    expect(migrations[4]).toMatchObject({ from: '0.5.0', to: '0.6.0' });
    expect(migrations[5]).toMatchObject({ from: '0.6.0', to: '0.7.0' });
    expect(migrations[6]).toMatchObject({ from: '0.7.0', to: '1.0.0' });
    expect(migrations[7]).toMatchObject({ from: '1.0.0', to: '1.1.0' });
  });
});
