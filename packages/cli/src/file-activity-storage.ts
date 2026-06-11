/**
 * Filesystem-backed {@link ActivityStorage} for the CLI. Persists the synced
 * developer-activity snapshot as an `activity.json` beside the project's
 * `takuhon.json` — the sibling-document layout the design mandates: the
 * snapshot is machine-written, externally sourced, and therefore lives outside
 * the canonical, owner-curated profile.
 *
 * Reads are deliberately forgiving: an absent, unparseable, or malformed file
 * resolves to `null` (never throws), because a missing snapshot is the normal
 * pre-sync / opt-out state and the renderer simply omits the activity section.
 * Writes are last-writer-wins through {@link writeFileAtomic}, so a reader
 * never observes a half-written snapshot.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { isActivitySnapshot, type ActivitySnapshot, type ActivityStorage } from '@takuhon/core';

import { writeFileAtomic } from './backup.js';

/** Sibling-document filename holding the synced activity snapshot. */
export const ACTIVITY_FILENAME = 'activity.json';

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

/** Absolute path of the `activity.json` beside the given profile path. */
export function activityPathFor(profilePath: string): string {
  return join(dirname(resolve(profilePath)), ACTIVITY_FILENAME);
}

function readSnapshotFile(path: string): ActivitySnapshot | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A truncated or corrupt snapshot is treated as absent, not fatal: the
    // next sync rewrites it whole, and the renderer omits the section.
    return null;
  }
  return isActivitySnapshot(parsed) ? parsed : null;
}

/**
 * Synchronous read of the snapshot beside `profilePath` (or `null`), for the
 * synchronous render pipelines (`takuhon build` / `dev`) that cannot await the
 * {@link ActivityStorage} contract.
 */
export function readActivitySnapshotSync(profilePath: string): ActivitySnapshot | null {
  return readSnapshotFile(activityPathFor(profilePath));
}

export class FileActivityStorage implements ActivityStorage {
  /** Absolute path of the `activity.json` this storage reads and writes. */
  readonly path: string;

  constructor(profilePath: string) {
    this.path = activityPathFor(profilePath);
  }

  // The filesystem work is synchronous, but the ActivityStorage contract is
  // async. Each method runs its body inside `Promise.resolve().then(...)` so a
  // synchronous throw becomes a rejected promise rather than an exception the
  // caller must catch outside `await` (same pattern as FileStorage).

  getActivitySnapshot(): Promise<ActivitySnapshot | null> {
    return Promise.resolve().then(() => readSnapshotFile(this.path));
  }

  saveActivitySnapshot(snapshot: ActivitySnapshot): Promise<void> {
    return Promise.resolve().then(() => {
      writeFileAtomic(this.path, `${JSON.stringify(snapshot, null, 2)}\n`);
    });
  }
}
