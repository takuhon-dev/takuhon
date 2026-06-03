/**
 * `takuhon restore --from <backup> [path] [--yes]` — overwrite a profile with
 * a previously saved backup (operational-lifecycle §4.1 / §4.3).
 *
 * Like the other command runners this returns its output as strings plus an
 * exit code rather than touching the process streams. It is `async` because
 * the confirmation prompt is interactive: the entry layer injects a `confirm`
 * callback that reads from the terminal, while tests inject a deterministic
 * predicate (or pass `--yes` to skip the prompt entirely).
 *
 * Restore is destructive, so the flow is deliberately careful:
 *   1. read and schema-`validate` the backup — never restore an invalid file;
 *   2. confirm (unless `--yes`); a non-interactive run with neither `--yes`
 *      nor an injected `confirm` refuses rather than overwriting silently;
 *   3. back up the current profile to `.takuhon-backups/pre-restore-…json`;
 *   4. write the backup's bytes to the target verbatim (a faithful
 *      reproduction; `validate` is only the gate, not a rewrite).
 *
 * Edge-cache purge (§4.1 step 4) is a remote-adapter concern and does not
 * apply to this local-file command.
 *
 * Exit codes:
 *   0 — restored, aborted at the prompt, or `--help`
 *   1 — the backup was read but failed schema validation
 *   2 — the command could not run: bad arguments, a missing `--from`, an
 *       unreadable backup or current profile, a non-JSON backup, or a refusal
 *       to overwrite without confirmation
 */

import { readFileSync } from 'node:fs';

import { validate } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';

import {
  BackupError,
  backupDirFor,
  createBackup,
  preRestoreName,
  writeFileAtomic,
} from './backup.js';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

const USAGE = `Usage: takuhon restore --from <backup> [path] [--yes]

Overwrite a profile with a previously saved backup. With no path, restores
./takuhon.json in the current working directory.

Options:
  --from <backup>  Backup file to restore from (required).
  --yes, -y        Skip the confirmation prompt.

The backup is schema-validated first, and the current profile is saved to
.takuhon-backups/pre-restore-<timestamp>.json before being overwritten.

Exit codes: 0 = restored / aborted, 1 = backup failed validation,
2 = bad arguments / file missing / unreadable / not JSON / unconfirmed.
`;

export interface RestoreOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/** Injectable dependencies for deterministic tests and interactive prompting. */
export interface RestoreDeps {
  /** Clock used for the pre-restore backup filename. Defaults to `() => new Date()`. */
  now?: () => Date;
  /**
   * Confirmation prompt. Receives the rendered message and resolves to the
   * user's decision. Omitted in non-interactive contexts, where restore then
   * refuses unless `--yes` was passed.
   */
  confirm?: (message: string) => boolean | Promise<boolean>;
}

interface ParsedArgs {
  from: string;
  path: string;
  yes: boolean;
}

/**
 * Run `takuhon restore` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"restore"`).
 */
export async function runRestore(
  args: readonly string[] = [],
  deps: RestoreDeps = {},
): Promise<RestoreOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon restore --help\` for usage.\n`,
    };
  }

  const now = deps.now ?? (() => new Date());
  return restoreFile(parsed, now, deps.confirm);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let from: string | undefined;
  let path: string | undefined;
  let yes = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--yes' || arg === '-y') {
      yes = true;
      continue;
    }
    if (arg === '--from') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        return { error: 'takuhon: `--from` requires a value.' };
      }
      from = value;
      i++;
      continue;
    }
    if (arg.startsWith('--from=')) {
      from = arg.slice('--from='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`restore\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `restore` takes at most one path argument.' };
    }
    path = arg;
  }

  if (from === undefined || from.length === 0) {
    return { error: 'takuhon: `restore` requires `--from <backup>`.' };
  }

  return { from, path: path ?? DEFAULT_PATH, yes };
}

async function restoreFile(
  parsed: ParsedArgs,
  now: () => Date,
  confirm: RestoreDeps['confirm'],
): Promise<RestoreOutcome> {
  const { from, path, yes } = parsed;

  let backupRaw: string;
  try {
    backupRaw = readFileSync(from, 'utf8');
  } catch {
    return { code: 2, stdout: '', stderr: `takuhon: cannot read backup '${from}'.\n` };
  }

  let backupData: unknown;
  try {
    backupData = JSON.parse(backupRaw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: backup '${from}' is not valid JSON: ${detail}\n`,
    };
  }

  const result = validate(backupData);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: backup '${from}' is not a valid takuhon profile; refusing to restore:\n${lines.join('\n')}\n`,
    };
  }

  // Read the current profile up front: its existence shapes the confirmation
  // message and decides whether a pre-restore backup is needed.
  let currentRaw: string | undefined;
  try {
    currentRaw = readFileSync(path, 'utf8');
  } catch (error) {
    if (!isNotFound(error)) {
      return { code: 2, stdout: '', stderr: `takuhon: cannot read current profile '${path}'.\n` };
    }
  }

  // One timestamp per run, shared by the prompt preview and the actual
  // pre-restore backup so the reported and written paths cannot drift.
  const stamp = now();
  const preRestorePath = `${backupDirFor(path)}/${preRestoreName(stamp)}`;

  if (!yes) {
    if (!confirm) {
      return {
        code: 2,
        stdout: '',
        stderr:
          `takuhon: refusing to overwrite '${path}' without confirmation.\n` +
          'Re-run interactively, or pass `--yes` to skip the prompt.\n',
      };
    }
    const decided = await confirm(
      confirmationMessage(path, from, result.data, currentRaw, preRestorePath),
    );
    if (!decided) {
      return { code: 0, stdout: 'Aborted; no changes made.\n', stderr: '' };
    }
  }

  let savedPath: string | undefined;
  if (currentRaw !== undefined) {
    try {
      savedPath = createBackup({
        targetPath: path,
        content: currentRaw,
        name: (withMillis) => preRestoreName(stamp, withMillis),
      });
    } catch (error) {
      const detail = error instanceof BackupError ? error.message : String(error);
      return {
        code: 2,
        stdout: '',
        stderr: `takuhon: refusing to restore '${path}' — pre-restore backup failed: ${detail}\n`,
      };
    }
  }

  // Write the backup's bytes verbatim: restore is a faithful reproduction of
  // the saved state, and `validate` above was only the gate.
  try {
    writeFileAtomic(path, backupRaw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: failed to write '${path}': ${detail}\n` };
  }

  const lines = [`restored ${path} from ${from}`];
  if (savedPath !== undefined) {
    lines.push(`  previous profile saved to ${savedPath}`);
  }
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

function confirmationMessage(
  path: string,
  from: string,
  data: Takuhon,
  currentRaw: string | undefined,
  preRestorePath: string,
): string {
  const when = typeof data.meta.updatedAt === 'string' ? ` (from ${data.meta.updatedAt})` : '';
  const preNote =
    currentRaw !== undefined
      ? `Your current profile will be saved as ${preRestorePath}.`
      : `(no existing profile at ${path} to preserve)`;
  return (
    `This will overwrite the profile at ${path} with the backup ${from}${when}.\n` +
    `${preNote}\n` +
    'Continue? [y/N]'
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
