import * as path from 'node:path';

export interface ResolvedStoragePaths {
  profilePath: string;
  versionPath: string;
}

/**
 * Map a storage base directory to the conventional file locations used by
 * {@link StaticOwnportStorage}. Kept as a pure function so test setups can
 * predict the layout without instantiating the storage class.
 */
export function resolveStoragePaths(baseDir: string): ResolvedStoragePaths {
  return {
    profilePath: path.join(baseDir, 'profile.json'),
    versionPath: path.join(baseDir, 'version.json'),
  };
}
