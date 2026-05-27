import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { migrateTakuhon, MigrationError, migrations } from '../index.js';
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
  it('contains the v0.1.0 → v0.2.0 entry', () => {
    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({ from: '0.1.0', to: '0.2.0' });
  });
});
