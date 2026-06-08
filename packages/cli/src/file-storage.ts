/**
 * Filesystem-backed {@link TakuhonStorage} for the local admin server
 * (`takuhon admin`). Persists the single profile document as the project's
 * `takuhon.json` so the form editor writes the same file the rest of the CLI
 * (build / dev / export / sync) reads.
 *
 * The opaque `version` is the SHA-256 of the file's bytes. This is stateless
 * (no sidecar metadata) and doubles as external-edit detection: if the file is
 * changed on disk between the editor's load and save, the hashes differ and the
 * `If-Match` precondition fails with a {@link ConflictError} — surfaced to the
 * SPA as a 409 conflict. Writes go through {@link writeFileAtomic} after a
 * backup, mirroring `import` / `migrate` / `restore`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';

import { ConflictError, NotFoundError, type Takuhon, type TakuhonStorage } from '@takuhon/core';

import { createBackup, preAdminSaveName, writeFileAtomic } from './backup.js';

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

/** Read the file's bytes, or `undefined` when it does not exist. */
function readMaybe(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

export interface FileStorageDeps {
  /** Clock for backup timestamps; injectable for deterministic tests. */
  now?: () => Date;
}

export class FileStorage implements TakuhonStorage {
  private readonly now: () => Date;

  constructor(
    private readonly path: string,
    deps: FileStorageDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  // The filesystem work is synchronous, but the TakuhonStorage contract is
  // async. Each method runs its body inside `Promise.resolve().then(...)` so a
  // synchronous throw becomes a rejected promise (e.g. NotFoundError →
  // ConflictError mapping in the admin API) rather than an exception the caller
  // must catch outside `await`.

  getProfile(): Promise<{ data: Takuhon; version: string }> {
    return Promise.resolve().then(() => {
      const raw = readMaybe(this.path);
      if (raw === undefined) {
        // No path in the message: it is serialized into the admin API response,
        // and the SPA maps 404 to its empty-state import flow regardless.
        throw new NotFoundError('No profile is stored yet.');
      }
      let data: Takuhon;
      try {
        data = JSON.parse(raw) as Takuhon;
      } catch (err) {
        // Surfaced by the admin API as a 500; the form's job is to fix invalid
        // *schema*, but unparseable JSON cannot be loaded into the editor. Keep
        // the host path out of the message (it goes in `cause` for local logs).
        throw new Error('The profile file is not valid JSON.', { cause: err });
      }
      return { data, version: sha256Hex(raw) };
    });
  }

  saveProfile(data: Takuhon, ifMatch?: string): Promise<{ version: string }> {
    return Promise.resolve().then(() => {
      const current = readMaybe(this.path);

      if (ifMatch !== undefined) {
        const currentVersion = current === undefined ? undefined : sha256Hex(current);
        if (currentVersion !== ifMatch) {
          throw new ConflictError(
            `If-Match preconditioned on version "${ifMatch}" but current is "${currentVersion ?? 'absent'}".`,
            { currentVersion },
          );
        }
      }

      // Back up the file we are about to overwrite (none on first write).
      if (current !== undefined) {
        const stamp = this.now();
        createBackup({
          targetPath: this.path,
          content: current,
          name: (withMillis) => preAdminSaveName(stamp, withMillis),
        });
      }

      const content = `${JSON.stringify(data, null, 2)}\n`;
      writeFileAtomic(this.path, content);
      return { version: sha256Hex(content) };
    });
  }

  deleteProfile(): Promise<void> {
    return Promise.resolve().then(() => {
      const current = readMaybe(this.path);
      if (current === undefined) return;
      const stamp = this.now();
      createBackup({
        targetPath: this.path,
        content: current,
        name: (withMillis) => preAdminSaveName(stamp, withMillis),
      });
      rmSync(this.path, { force: true });
    });
  }
}
