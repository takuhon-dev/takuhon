import { describe, expect, it } from 'vitest';

import { findMigrationChain } from '../migrations/_chain.js';
import type { Migration } from '../migrations/index.js';
import type { Meport } from '../types.js';

function step(from: string, to: string): Migration<Meport, Meport> {
  return {
    from,
    to,
    migrate: (data) => ({ ...data, schemaVersion: to }),
  };
}

describe('findMigrationChain (synthetic fixtures)', () => {
  it('returns [] when from === to (identity short-circuit)', () => {
    expect(findMigrationChain('0.1.0', '0.1.0', [])).toEqual([]);
  });

  it('returns null when no edge exists in an empty registry', () => {
    expect(findMigrationChain('0.1.0', '0.2.0', [])).toBeNull();
  });

  it('returns a single-hop chain when the direct edge exists', () => {
    const reg = [step('0.1.0', '0.2.0')];
    const chain = findMigrationChain('0.1.0', '0.2.0', reg);
    expect(chain).toHaveLength(1);
    expect(chain?.[0]?.from).toBe('0.1.0');
    expect(chain?.[0]?.to).toBe('0.2.0');
  });

  it('chains multi-hop forward migrations (0.1.0 → 0.3.0)', () => {
    const reg = [step('0.1.0', '0.2.0'), step('0.2.0', '0.3.0')];
    const chain = findMigrationChain('0.1.0', '0.3.0', reg);
    expect(chain?.map((m) => `${m.from}->${m.to}`)).toEqual(['0.1.0->0.2.0', '0.2.0->0.3.0']);
  });

  it('returns null when the chain terminates short of the target', () => {
    const reg = [step('0.1.0', '0.2.0')];
    expect(findMigrationChain('0.1.0', '0.3.0', reg)).toBeNull();
  });

  it('breaks cycles by visited-set tracking', () => {
    // Misconfigured registry that loops 0.1.0 → 0.2.0 → 0.1.0.
    const reg = [step('0.1.0', '0.2.0'), step('0.2.0', '0.1.0')];
    // Walking toward an unreachable target traverses the cycle once,
    // then must bail out with null rather than looping forever.
    expect(findMigrationChain('0.1.0', '0.3.0', reg)).toBeNull();
  });
});
