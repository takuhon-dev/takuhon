import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { migrateOwnport, MigrationError, migrations } from '../index.js';
import type { Ownport } from '../index.js';

function cloneExample(): Ownport {
  return JSON.parse(JSON.stringify(exampleJson)) as Ownport;
}

describe('migrateOwnport', () => {
  it('returns a structural clone when sourceVersion === targetVersion', () => {
    const input = cloneExample();
    const out = migrateOwnport(input, input.schemaVersion);
    expect(out).toEqual(input);
    // Mutating the result does not touch the input.
    out.profile.displayName = { en: 'mutated' };
    expect(input.profile.displayName).not.toEqual({ en: 'mutated' });
  });

  it('throws MigrationError when no chain exists in the Phase 1 registry', () => {
    const input = cloneExample();
    expect(() => migrateOwnport(input, '0.2.0')).toThrow(MigrationError);
  });

  it('error message names both source and target versions', () => {
    const input = cloneExample();
    let caught: unknown;
    try {
      migrateOwnport(input, '9.9.9');
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
    expect(() => migrateOwnport(input, '0.2.0')).toThrow();
    expect(JSON.stringify(input)).toBe(snapshot);
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

describe('migrations registry (Phase 1 baseline)', () => {
  it('is empty until the first concrete migration lands', () => {
    expect(migrations).toEqual([]);
  });
});
