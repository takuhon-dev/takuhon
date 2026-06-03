/**
 * `takuhon import <file> [path]` — load a previously exported profile into a
 * local `takuhon.json` (operational-lifecycle §5.3 / §17.2).
 *
 * Like the other command runners this returns its output as strings plus an
 * exit code. The flow follows §5.3: read the input, migrate it forward to the
 * current schema version if it is older (core's `importTakuhon` deliberately
 * does *not* auto-migrate, so the CLI composes `migrateTakuhon` +
 * `importTakuhon`), validate the result, back up the current profile, then
 * write the imported document. Unlike `restore` (a verbatim reproduction),
 * `import` writes the migrated-and-validated document re-serialised in
 * canonical form.
 *
 * Import overwrites the target, but a backup is taken first, so — matching the
 * spec, which mandates a confirmation prompt only for `restore` — there is no
 * interactive prompt. Asset expansion and edge-cache purge (§5.3 steps 5-6)
 * are remote concerns and do not apply to this local-file command.
 *
 * Exit codes:
 *   0 — imported
 *   1 — the input was read but cannot be imported (missing/unusable
 *       schemaVersion, no migration path to the current version, or the
 *       result failed validation)
 *   2 — the command could not run: bad arguments, a missing/unreadable input
 *       or target, a non-JSON input, or a failed write
 */

import { readFileSync } from 'node:fs';

import {
  ImportError,
  MigrationError,
  SCHEMA_VERSION,
  importTakuhon,
  migrateTakuhon,
} from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';

import { BackupError, createBackup, preImportName, writeFileAtomic } from './backup.js';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

const USAGE = `Usage: takuhon import <file> [path]

Load a previously exported profile from <file> into a local takuhon.json,
migrating it to the current schema version if needed. With no path, writes
./takuhon.json in the current working directory.

The current profile (if any) is backed up to
.takuhon-backups/pre-import-<timestamp>.json before being overwritten.

Exit codes: 0 = imported, 1 = input cannot be imported (invalid / unsupported
version), 2 = bad arguments / file missing / unreadable / not JSON / write failed.
`;

export interface ImportOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/** Injectable dependencies, so tests can pin the backup timestamp. */
export interface ImportDeps {
  /** Clock used for the pre-import backup filename. Defaults to `() => new Date()`. */
  now?: () => Date;
}

interface ParsedArgs {
  file: string;
  path: string;
}

/**
 * Run `takuhon import` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"import"`).
 */
export function runImport(args: readonly string[] = [], deps: ImportDeps = {}): ImportOutcome {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon import --help\` for usage.\n`,
    };
  }

  const now = deps.now ?? (() => new Date());
  return importFile(parsed, now);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`import\`.` };
    }
    positionals.push(arg);
  }

  if (positionals.length === 0) {
    return { error: 'takuhon: `import` requires an input <file>.' };
  }
  if (positionals.length > 2) {
    return { error: 'takuhon: `import` takes at most an input <file> and a target path.' };
  }

  return { file: positionals[0]!, path: positionals[1] ?? DEFAULT_PATH };
}

function importFile(parsed: ParsedArgs, now: () => Date): ImportOutcome {
  const { file, path } = parsed;

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return { code: 2, stdout: '', stderr: `takuhon: cannot read '${file}'.\n` };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: '${file}' is not valid JSON: ${detail}\n` };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: '${file}' is not a takuhon profile (expected a JSON object).\n`,
    };
  }

  const source = (data as { schemaVersion?: unknown }).schemaVersion;
  if (typeof source !== 'string' || source.length === 0) {
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: '${file}' has no usable schemaVersion; cannot import.\n`,
    };
  }

  // Bring the input up to the current schema version (§5.3 step 2). core's
  // importTakuhon does not auto-migrate, so we migrate first when needed.
  let candidate: unknown = data;
  if (source !== SCHEMA_VERSION) {
    try {
      candidate = migrateTakuhon(data as Takuhon, SCHEMA_VERSION);
    } catch (error) {
      if (error instanceof MigrationError) {
        return {
          code: 1,
          stdout: '',
          stderr: `takuhon: cannot import '${file}': ${error.message}.\n`,
        };
      }
      throw error;
    }
  }

  let imported: Takuhon;
  try {
    imported = importTakuhon(candidate as Takuhon);
  } catch (error) {
    if (error instanceof ImportError) {
      const lines = (error.errors ?? []).map((e) => `  ${e.pointer || '/'}: ${e.message}`);
      const detail = lines.length > 0 ? `:\n${lines.join('\n')}` : '.';
      return {
        code: 1,
        stdout: '',
        stderr: `takuhon: '${file}' is not a valid takuhon profile; refusing to import${detail}\n`,
      };
    }
    throw error;
  }

  // Back up the current profile before overwriting it (§5.3 step 3). A missing
  // target is fine — there is nothing to preserve on a fresh import.
  let currentRaw: string | undefined;
  try {
    currentRaw = readFileSync(path, 'utf8');
  } catch (error) {
    if (!isNotFound(error)) {
      return { code: 2, stdout: '', stderr: `takuhon: cannot read current profile '${path}'.\n` };
    }
  }

  let savedPath: string | undefined;
  if (currentRaw !== undefined) {
    // One timestamp for the backup name (createBackup may call the builder
    // twice on a same-second collision).
    const stamp = now();
    try {
      savedPath = createBackup({
        targetPath: path,
        content: currentRaw,
        name: (withMillis) => preImportName(stamp, withMillis),
      });
    } catch (error) {
      const detail = error instanceof BackupError ? error.message : String(error);
      return {
        code: 2,
        stdout: '',
        stderr: `takuhon: refusing to import into '${path}' — pre-import backup failed: ${detail}\n`,
      };
    }
  }

  try {
    writeFileAtomic(path, `${JSON.stringify(imported, null, 2)}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: failed to write '${path}': ${detail}\n` };
  }

  const lines = [`imported ${file} -> ${path} (schemaVersion ${imported.schemaVersion})`];
  if (savedPath !== undefined) {
    lines.push(`  previous profile saved to ${savedPath}`);
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
