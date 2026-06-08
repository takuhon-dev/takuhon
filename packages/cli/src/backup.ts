/**
 * Local backup helpers shared by `takuhon migrate` and `takuhon restore`.
 *
 * Backups are written to a `.takuhon-backups/` directory co-located with the
 * profile file being mutated, rather than a `~/.takuhon/backups/{slug}/`
 * tree: a local `takuhon.json` operated on by path has no guaranteed slug,
 * and the restore flow documented in operational-lifecycle §4.1 / §4.3 reads
 * and writes `.takuhon-backups/...` relative to the working file. Keeping the
 * backups beside the source also mirrors the Vercel / Static adapter layout
 * (§3.1), which is the closest analogue for a local file workflow.
 *
 * Naming follows §3.1 (`takuhon-backup-v{version}-{timestamp}.json`) and the
 * pre-restore convention of §4.1 (`pre-restore-{timestamp}.json`). Timestamps
 * are ISO 8601 basic format in UTC at second precision; {@link createBackup}
 * implements the §3.3 overwrite guard by falling back to millisecond
 * precision when a same-second name already exists.
 */

import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Directory (relative to the target file) that holds local backups. */
export const BACKUP_DIR_NAME = '.takuhon-backups';

/**
 * Thrown by {@link createBackup} when a backup cannot be written without
 * overwriting an existing file even after disambiguating with milliseconds.
 */
export class BackupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackupError';
  }
}

/**
 * Format `date` as a compact ISO 8601 basic-format UTC timestamp.
 *
 * @example
 * compactTimestamp(new Date('2026-05-11T12:00:00.123Z'))       // "20260511T120000Z"
 * compactTimestamp(new Date('2026-05-11T12:00:00.123Z'), true) // "20260511T120000.123Z"
 */
export function compactTimestamp(date: Date, withMillis = false): string {
  const iso = date.toISOString(); // e.g. "2026-05-11T12:00:00.123Z"
  const trimmed = withMillis ? iso : iso.replace(/\.\d{3}Z$/, 'Z');
  // Drop the extended-format separators; the millisecond `.` (if kept) stays.
  return trimmed.replace(/[-:]/g, '');
}

/** Build the migration pre-backup filename for a given source `version`. */
export function migrateBackupName(version: string, date: Date, withMillis = false): string {
  return `takuhon-backup-v${version}-${compactTimestamp(date, withMillis)}.json`;
}

/** Build the pre-restore backup filename (operational-lifecycle §4.1). */
export function preRestoreName(date: Date, withMillis = false): string {
  return `pre-restore-${compactTimestamp(date, withMillis)}.json`;
}

/** Build the pre-import backup filename (operational-lifecycle §5.3 step 3). */
export function preImportName(date: Date, withMillis = false): string {
  return `pre-import-${compactTimestamp(date, withMillis)}.json`;
}

/** Build the pre-save backup filename for a `takuhon admin` write. */
export function preAdminSaveName(date: Date, withMillis = false): string {
  return `pre-admin-${compactTimestamp(date, withMillis)}.json`;
}

/** Resolve the `.takuhon-backups/` directory beside `targetPath`. */
export function backupDirFor(targetPath: string): string {
  return join(dirname(targetPath), BACKUP_DIR_NAME);
}

/**
 * Write `content` into `.takuhon-backups/` beside `targetPath`, returning the
 * path actually written.
 *
 * `name(withMillis)` yields the second-precision filename when `false` and a
 * millisecond-precision variant when `true`. The directory is created if
 * absent and writes use the `wx` flag so an existing file is never
 * overwritten (operational-lifecycle §3.3): a same-second collision retries
 * once at millisecond precision, and a further collision throws
 * {@link BackupError}.
 */
export function createBackup(params: {
  targetPath: string;
  content: string;
  name: (withMillis: boolean) => string;
}): string {
  const dir = backupDirFor(params.targetPath);
  mkdirSync(dir, { recursive: true });

  const primary = join(dir, params.name(false));
  try {
    writeFileSync(primary, params.content, { flag: 'wx' });
    return primary;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
  }

  const fallback = join(dir, params.name(true));
  try {
    writeFileSync(fallback, params.content, { flag: 'wx' });
    return fallback;
  } catch (error) {
    if (isAlreadyExists(error)) {
      throw new BackupError(
        `backup target already exists and could not be disambiguated: ${fallback}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST'
  );
}

/**
 * Write `content` to `target` atomically: stage it in a sibling temp file and
 * `rename` it into place. A `rename` within a directory is atomic, so a reader
 * never observes a half-written profile and an interrupted write (crash,
 * ENOSPC) cannot truncate the existing file — it is replaced whole or not at
 * all. The temp file is removed on failure. Pairs with the backup-before-write
 * ordering in the migrate / restore commands.
 */
export function writeFileAtomic(target: string, content: string): void {
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, target);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
