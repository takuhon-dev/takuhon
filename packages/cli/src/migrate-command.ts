/**
 * `takuhon migrate [path] [--to <version>] [--out <file>] [--dry-run]` —
 * forward-migrate a `takuhon.json` to a newer schema version.
 *
 * Mirrors `validate-command.ts`: {@link runMigrate} is a pure,
 * side-effect-light function that reads/writes files itself but returns its
 * output as strings plus an exit code, leaving stdout/stderr writes and
 * `process.exit` to the entry layer. The source version is read from the
 * file's own `schemaVersion` (the file is the source of truth), so the
 * command takes only `--to`; the default target is the latest schema this
 * build of `@takuhon/core` ships ({@link SCHEMA_VERSION}).
 *
 * The transform is intentionally minimal — `migrateTakuhon` then a re-`validate`
 * gate, with no `meta.updatedAt` touch and no `normalize` pass — so a
 * migration stays lossless (operational-lifecycle §2.6) and its diff is
 * limited to the schema-shape change. Before an in-place write the original
 * bytes are backed up beside the file (§3.1 / §3.3). Migrations are
 * forward-only (§2.4); downgrades surface as a clear error pointing at
 * `takuhon restore`.
 *
 * Exit codes:
 *   0 — migrated, already at the target (no-op), `--dry-run`, or `--help`
 *   1 — the document was read but cannot be migrated to the target (no
 *       forward path / downgrade / unusable schemaVersion) or the migrated
 *       result unexpectedly failed re-validation
 *   2 — the command could not run: bad arguments, an out-of-window `--to`, a
 *       missing/unreadable file, or a file that is not valid JSON
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MigrationError,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  migrateTakuhon,
  validate,
} from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';

import {
  BackupError,
  backupDirFor,
  createBackup,
  migrateBackupName,
  writeFileAtomic,
} from './backup.js';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

const USAGE = `Usage: takuhon migrate [path] [--to <version>] [--out <file>] [--dry-run]

Forward-migrate a takuhon.json to a newer schema version. The source version
is read from the file's own schemaVersion. With no path, migrates
./takuhon.json in the current working directory.

Options:
  --to <version>   Target schema version (default: ${SCHEMA_VERSION}).
                   One of: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.
  --out <file>     Write the result to <file> instead of in place. The source
                   file is left unchanged and no backup is created.
  --dry-run        Report the planned migration and backup path; write nothing.

Before an in-place write the current file is backed up to .takuhon-backups/
beside it. Migrations are forward-only; to move to an older schema, restore
from a backup with \`takuhon restore\`.

Exit codes: 0 = migrated / already current / dry-run, 1 = cannot migrate,
2 = bad arguments / file missing / unreadable / not JSON.
`;

export interface MigrateOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/** Injectable dependencies, so tests can pin the backup timestamp. */
export interface MigrateDeps {
  /** Clock used for backup filenames. Defaults to `() => new Date()`. */
  now?: () => Date;
}

interface ParsedArgs {
  path: string;
  to: string;
  out?: string;
  dryRun: boolean;
}

/**
 * Run `takuhon migrate` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"migrate"`). Never throws
 * and never writes to the process streams.
 */
export function runMigrate(args: readonly string[] = [], deps: MigrateDeps = {}): MigrateOutcome {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon migrate --help\` for usage.\n`,
    };
  }

  const now = deps.now ?? (() => new Date());
  return migrateFile(parsed, now);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  let to: string | undefined;
  let out: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--to' || arg === '--out') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return { error: `takuhon: \`${arg}\` requires a value.` };
      }
      if (arg === '--to') to = value;
      else out = value;
      i++;
      continue;
    }
    if (arg.startsWith('--to=')) {
      to = arg.slice('--to='.length);
      continue;
    }
    if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`migrate\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `migrate` takes at most one path argument.' };
    }
    path = arg;
  }

  const target = to ?? SCHEMA_VERSION;
  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(target)) {
    return {
      error: `takuhon: unsupported --to version "${target}". Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
    };
  }

  return { path: path ?? DEFAULT_PATH, to: target, out, dryRun };
}

function migrateFile(parsed: ParsedArgs, now: () => Date): MigrateOutcome {
  const { path, to: target, out, dryRun } = parsed;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: cannot read '${path}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: '${path}' is not valid JSON: ${detail}\n` };
  }

  const source = (data as { schemaVersion?: unknown }).schemaVersion;
  if (typeof source !== 'string' || source.length === 0) {
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: '${path}' has no usable schemaVersion; cannot determine what to migrate from.\n`,
    };
  }

  if (source === target) {
    return {
      code: 0,
      stdout: `${path}: already at schemaVersion ${target}; nothing to do.\n`,
      stderr: '',
    };
  }

  // Back up the original bytes only for a genuine in-place write. `--out` to a
  // different name leaves the source untouched, so a backup would be redundant.
  // The write is atomic (write-temp-then-rename), which replaces the target
  // *name* rather than following it, so even an `--out` symlink that points at
  // the source cannot clobber the source unbacked — it just replaces the link.
  const writeTarget = out ?? path;
  const inPlace = resolve(writeTarget) === resolve(path);

  let migrated: Takuhon;
  try {
    migrated = migrateTakuhon(data as Takuhon, target);
  } catch (error) {
    if (error instanceof MigrationError) {
      return {
        code: 1,
        stdout: '',
        stderr:
          `takuhon: cannot migrate '${path}': ${error.message}.\n` +
          'Migrations are forward-only; to move to an older schema, restore from a backup with `takuhon restore`.\n',
      };
    }
    throw error;
  }

  // Re-validate as a structural safety gate. The bundled validator accepts the
  // entire supported window, so a non-latest `--to` still passes here;
  // `migrateTakuhon` is what guarantees the result carries the requested target
  // shape (it stops the chain at `target`). This catches only a migration that
  // produced something the schema rejects outright.
  const revalidated = validate(migrated);
  if (!revalidated.ok) {
    const lines = revalidated.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: migrated '${path}' to ${target} but the result failed validation:\n${lines.join('\n')}\n`,
    };
  }

  // One timestamp per run, shared by the dry-run preview and the real backup so
  // the reported and actual backup paths cannot drift.
  const stamp = now();

  // `--dry-run` previews only after the migration is proven feasible above, so
  // an impossible migration (e.g. a downgrade) still reports exit 1 rather than
  // a misleading "would migrate".
  if (dryRun) {
    const lines = [`${path}: would migrate ${source} -> ${target}`, `  write: ${writeTarget}`];
    if (inPlace) {
      lines.push(`  backup: ${backupDirFor(path)}/${migrateBackupName(source, stamp)}`);
    } else {
      lines.push('  (source left unchanged; no backup created)');
    }
    return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
  }

  let backupPath: string | undefined;
  if (inPlace) {
    try {
      backupPath = createBackup({
        targetPath: path,
        content: raw,
        name: (withMillis) => migrateBackupName(source, stamp, withMillis),
      });
    } catch (error) {
      const detail = error instanceof BackupError ? error.message : String(error);
      return {
        code: 2,
        stdout: '',
        stderr: `takuhon: refusing to migrate '${path}' — backup failed: ${detail}\n`,
      };
    }
  }

  try {
    writeFileAtomic(writeTarget, `${JSON.stringify(migrated, null, 2)}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: failed to write '${writeTarget}': ${detail}\n`,
    };
  }

  const lines = [`migrated ${path}: ${source} -> ${target}`];
  if (inPlace) {
    lines.push(`  backup: ${backupPath}`);
  } else {
    lines.push(`  wrote: ${writeTarget} (source left unchanged; no backup created)`);
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}
