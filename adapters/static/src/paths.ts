import * as path from 'node:path';

export interface ResolvedStoragePaths {
  profilePath: string;
  versionPath: string;
  /** Sibling document holding the synced developer-activity snapshot. */
  activityPath: string;
}

/**
 * Map a storage base directory to the conventional file locations used by
 * {@link StaticTakuhonStorage}. Kept as a pure function so test setups can
 * predict the layout without instantiating the storage class.
 */
export function resolveStoragePaths(baseDir: string): ResolvedStoragePaths {
  return {
    profilePath: path.join(baseDir, 'profile.json'),
    versionPath: path.join(baseDir, 'version.json'),
    activityPath: path.join(baseDir, 'activity.json'),
  };
}
