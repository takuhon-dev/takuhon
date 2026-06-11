import * as fs from 'node:fs/promises';

import { isActivitySnapshot, type ActivitySnapshot, type ActivityStorage } from '@takuhon/core';

import type { StaticStorageOptions } from './fs-storage.js';
import { atomicWriteFile, isENOENT } from './fs-utils.js';
import { resolveStoragePaths } from './paths.js';

/**
 * Filesystem implementation of {@link ActivityStorage}. Stores the synced
 * developer-activity snapshot as `activity.json` under the same base directory
 * {@link StaticTakuhonStorage} uses for the profile — a sibling document,
 * deliberately outside the canonical profile files.
 *
 * Reads are forgiving: an absent, unparseable, or malformed file resolves to
 * `null` (never throws), because a missing snapshot is the normal pre-sync /
 * opt-out state and the renderer simply omits the activity section. Writes are
 * last-writer-wins through the package's atomic write helper.
 */
export class StaticActivityStorage implements ActivityStorage {
  private readonly baseDir: string;
  private readonly activityPath: string;

  constructor(opts: StaticStorageOptions) {
    this.baseDir = opts.baseDir;
    this.activityPath = resolveStoragePaths(opts.baseDir).activityPath;
  }

  async getActivitySnapshot(): Promise<ActivitySnapshot | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.activityPath, 'utf8');
    } catch (e) {
      if (isENOENT(e)) return null;
      throw e;
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

  async saveActivitySnapshot(snapshot: ActivitySnapshot): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await atomicWriteFile(this.activityPath, JSON.stringify(snapshot, null, 2) + '\n');
  }
}
