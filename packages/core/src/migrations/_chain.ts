/**
 * Module-private chain-building helper for the migration registry.
 *
 * Not re-exported from `@meport/core`'s public surface: the algorithm is an
 * implementation detail of {@link migrateMeport}, and adding it to the
 * public API would freeze its signature under semver. Unit tests import
 * this file directly to exercise the chain logic against synthetic
 * fixtures.
 */

import type { Meport } from '../types.js';

import type { Migration } from './index.js';

/**
 * Build a forward chain of migrations from `from` to `to`. Returns `[]`
 * when `from === to`, or `null` when no chain exists or a cycle is
 * encountered. The walk is linear (one outgoing edge per `from`); a
 * visited-set guards against cycles introduced by misconfigured registries.
 */
export function findMigrationChain(
  from: string,
  to: string,
  registry: readonly Migration<Meport, Meport>[],
): Migration<Meport, Meport>[] | null {
  if (from === to) return [];
  const byFrom = new Map<string, Migration<Meport, Meport>>();
  for (const m of registry) byFrom.set(m.from, m);
  const chain: Migration<Meport, Meport>[] = [];
  const visited = new Set<string>([from]);
  let cur = from;
  while (cur !== to) {
    const next = byFrom.get(cur);
    if (!next) return null;
    if (visited.has(next.to)) return null;
    chain.push(next);
    visited.add(next.to);
    cur = next.to;
  }
  return chain;
}
