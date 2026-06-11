import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';

import { StorageError } from '@takuhon/core';

/**
 * Filesystem helpers shared by the storage implementations in this package
 * ({@link StaticTakuhonStorage} and {@link StaticActivityStorage}).
 */

export async function atomicWriteFile(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.unlink(tmp).catch(() => undefined);
    throw new StorageError(`Failed to atomically write "${target}".`, { cause: e });
  }
}

export function isENOENT(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT';
}
