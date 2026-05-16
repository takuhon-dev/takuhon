/**
 * Forward migration entry point for ownport documents.
 *
 * {@link migrateMeport} composes a chain of {@link Migration} entries from
 * the registry (`./migrations`) and applies them in order. Phase 1 ships
 * with an empty registry, so any non-identity migration currently throws
 * {@link MigrationError}; the first concrete entry will land alongside
 * the v0.2.0 schema bump.
 *
 * Scope (deliberately narrow, mirroring `export.ts`):
 * - Pure data transform — no I/O, no backup creation, no storage write.
 * - Backup-before-migrate (operational-lifecycle §3.1) is the storage /
 *   API layer's responsibility; this function only transforms the
 *   in-memory document.
 * - Forward only (operational-lifecycle §2.4); downgrade is via restore.
 */

import { findMigrationChain } from './migrations/_chain.js';
import { migrations } from './migrations/index.js';
import type { Ownport } from './types.js';

/**
 * Thrown by {@link migrateMeport} when no forward chain connects the
 * source `schemaVersion` to `targetVersion`. The message includes both
 * versions so the API layer can surface an actionable RFC 7807 problem.
 */
export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

/**
 * Migrate a ownport document forward to `targetVersion`. Returns a deep
 * clone; the input is never mutated, even when a migration throws.
 *
 * @throws {MigrationError} when no forward chain exists from
 *         `data.schemaVersion` to `targetVersion`.
 */
export function migrateMeport(data: Ownport, targetVersion: string): Ownport {
  const sourceVersion = data.schemaVersion;
  if (sourceVersion === targetVersion) {
    return JSON.parse(JSON.stringify(data)) as Ownport;
  }
  const chain = findMigrationChain(sourceVersion, targetVersion, migrations);
  if (!chain) {
    throw new MigrationError(`No migration path from ${sourceVersion} to ${targetVersion}`);
  }
  let current: Ownport = JSON.parse(JSON.stringify(data)) as Ownport;
  for (const step of chain) {
    current = step.migrate(current);
  }
  return current;
}
