import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';

import {
  ConflictError,
  NotFoundError,
  StorageError,
  type Ownport,
  type OwnportStorage,
} from '@takuhon/core';

import { resolveStoragePaths } from './paths.js';

export interface StaticStorageOptions {
  /**
   * Directory (absolute path recommended) holding `profile.json` and
   * `version.json`. Created on first write if missing.
   */
  baseDir: string;
}

export interface StaticVersionMetadata {
  version: string;
  updatedAt: string;
}

/**
 * Filesystem implementation of {@link OwnportStorage}. Stores the profile
 * document and its version metadata as two JSON files under a single base
 * directory:
 *
 * - `profile.json` holds the raw `Ownport` document.
 * - `version.json` holds `{ version, updatedAt }` and powers HTTP `If-Match`
 *   optimistic locking exactly like the Cloudflare KV adapter.
 *
 * Writes are atomic per file (write to a temp sibling, then `rename`). The
 * write order is profile first, version last, so a crash between the two
 * renames leaves the on-disk version pointing at the *previous* document at
 * worst — never at a newer one. Concurrent writers from multiple processes
 * are out of scope for the MVP; see the package README.
 */
export class StaticOwnportStorage implements OwnportStorage {
  private readonly baseDir: string;
  private readonly profilePath: string;
  private readonly versionPath: string;

  constructor(opts: StaticStorageOptions) {
    this.baseDir = opts.baseDir;
    const paths = resolveStoragePaths(opts.baseDir);
    this.profilePath = paths.profilePath;
    this.versionPath = paths.versionPath;
  }

  async getProfile(): Promise<{ data: Ownport; version: string }> {
    let profileRaw: string;
    let versionRaw: string;
    try {
      profileRaw = await fs.readFile(this.profilePath, 'utf8');
      versionRaw = await fs.readFile(this.versionPath, 'utf8');
    } catch (e) {
      if (isENOENT(e)) {
        throw new NotFoundError(`No profile is stored under "${this.baseDir}".`);
      }
      throw new StorageError(`Failed to read profile from "${this.baseDir}".`, { cause: e });
    }

    let data: Ownport;
    try {
      data = JSON.parse(profileRaw) as Ownport;
    } catch (e) {
      throw new StorageError(`Failed to parse "${this.profilePath}".`, { cause: e });
    }
    let metadata: StaticVersionMetadata;
    try {
      metadata = JSON.parse(versionRaw) as StaticVersionMetadata;
    } catch (e) {
      throw new StorageError(`Failed to parse "${this.versionPath}".`, { cause: e });
    }
    if (!metadata.version) {
      throw new StorageError(`Corrupt version metadata in "${this.versionPath}".`);
    }

    return { data, version: metadata.version };
  }

  async saveProfile(data: Ownport, ifMatch?: string): Promise<{ version: string }> {
    if (ifMatch !== undefined) {
      let currentVersion: string | undefined;
      try {
        const current = await this.getProfile();
        currentVersion = current.version;
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
      }
      if (currentVersion !== ifMatch) {
        throw new ConflictError(
          `If-Match preconditioned on version "${ifMatch}" but current is "${currentVersion ?? 'absent'}".`,
          { currentVersion },
        );
      }
    }

    await fs.mkdir(this.baseDir, { recursive: true });

    const version = randomUUID();
    const updatedAt = new Date().toISOString();
    const metadata: StaticVersionMetadata = { version, updatedAt };

    await atomicWriteFile(this.profilePath, JSON.stringify(data, null, 2) + '\n');
    await atomicWriteFile(this.versionPath, JSON.stringify(metadata) + '\n');

    return { version };
  }

  async deleteProfile(): Promise<void> {
    // Version first so getProfile() degrades to NotFoundError mid-deletion.
    await unlinkIfExists(this.versionPath);
    await unlinkIfExists(this.profilePath);
  }
}

export function createStaticStorage(opts: StaticStorageOptions): StaticOwnportStorage {
  return new StaticOwnportStorage(opts);
}

async function atomicWriteFile(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.unlink(tmp).catch(() => undefined);
    throw new StorageError(`Failed to atomically write "${target}".`, { cause: e });
  }
}

async function unlinkIfExists(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch (e) {
    if (!isENOENT(e)) {
      throw new StorageError(`Failed to delete "${p}".`, { cause: e });
    }
  }
}

function isENOENT(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT';
}
