/**
 * `takuhon admin verify [path] [--dir <name>]` — confirm a project's committed
 * admin bundle is exactly the one the installed `@takuhon/cli` ships.
 *
 * `create-takuhon` / `takuhon admin update` stamp a `.takuhon-admin-bundle.json`
 * provenance manifest into the bundle directory (see `admin-bundle-manifest.ts`).
 * This command re-derives the hashes and compares them against both that
 * manifest and the installed CLI's shipped bundle, so CI can catch a bundle that
 * has drifted from its pinned `@takuhon/cli` (or been edited by hand) instead of
 * relying on the README's "keep your @takuhon/* versions matching" prose.
 *
 * `--dir <name>` (default `admin-dist/`) names the bundle directory, matching
 * `takuhon admin update`; a shared-layout project passes `--dir public`.
 *
 * Argument handling is a pure function returning streams plus an exit code, like
 * the other one-shot commands; `index.ts` writes the streams and exits.
 *
 * Exit codes:
 *   0 — the bundle matches the installed @takuhon/cli (or `--help`); a stale
 *       recorded version whose bytes still match prints a warning but exits 0
 *   1 — the bundle drifted (missing manifest, or a hash mismatch)
 *   2 — bad arguments, the path is not a takuhon project, the bundle directory
 *       is missing, or the installed CLI's bundle could not be read
 */

import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  readCliVersion,
  verifyAdminBundle,
  type AdminBundleVerifyResult,
} from './admin-bundle-manifest.js';
import { parseAdminTargetArgs } from './admin-target.js';
import { resolveAdminBundleDir } from './scaffold/index.js';
import { ADMIN_DIST_DIRNAME } from './scaffold/wrangler-toml.js';

/** Marker file that identifies a directory as a takuhon project. */
const PROFILE_FILENAME = 'takuhon.json';

const USAGE = `Usage: takuhon admin verify [path] [--dir <name>]

Confirm a project's committed admin bundle matches the one shipped in this
@takuhon/cli. Re-hashes the bundle and checks it against its provenance manifest
and the installed CLI, so CI can catch a bundle that drifted from its pinned
@takuhon/cli. With no path, verifies the project in the current directory.

  --dir <name>   Bundle directory within the project (default ${ADMIN_DIST_DIRNAME}); use the
                 same value you pass to \`takuhon admin update\` (e.g. --dir public).

Exit codes: 0 = matches, 1 = drifted (regenerate with \`takuhon admin update\`),
2 = bad arguments / not a takuhon project / no bundle directory.
`;

export interface VerifyAdminOptions {
  /**
   * Installed CLI bundle directory. Defaults to the bundle shipped in this
   * package ({@link resolveAdminBundleDir}); overridable for tests.
   */
  readonly bundleDir?: string;
}

export interface VerifyAdminOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/**
 * Run `takuhon admin verify` against the arguments that follow the subcommand.
 * Never throws and never writes to the process streams — the caller renders the
 * returned `stdout` / `stderr` and exits with `code`.
 */
export async function runVerifyAdmin(
  args: readonly string[] = [],
  opts: VerifyAdminOptions = {},
): Promise<VerifyAdminOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseAdminTargetArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: ${parsed.error}\nRun \`takuhon admin verify --help\` for usage.\n`,
    };
  }

  const displayDir = parsed.pathArg ?? '.';
  const projectDir = resolve(parsed.pathArg ?? '.');
  const { dir } = parsed;

  try {
    await stat(join(projectDir, PROFILE_FILENAME));
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${displayDir}' is not a takuhon project (no ${PROFILE_FILENAME} found).\n`,
    };
  }

  const bundleTargetDir = join(projectDir, dir);
  const targetStat = await stat(bundleTargetDir).catch(() => undefined);
  if (targetStat === undefined) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${displayDir}' has no ${dir}/ directory to verify.\n`,
    };
  }
  if (!targetStat.isDirectory()) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${join(displayDir, dir)}' exists but is not a directory.\n`,
    };
  }

  const cliBundleDir = opts.bundleDir ?? resolveAdminBundleDir();
  const cliVersion = readCliVersion();

  let result: AdminBundleVerifyResult;
  try {
    result = await verifyAdminBundle({ dir: bundleTargetDir, cliBundleDir, cliVersion });
  } catch (err) {
    // Reading the installed CLI's shipped bundle failed (a broken/partial
    // install). Sanitize — the raw error would embed the absolute node_modules
    // path — and report it as operational (2), not drift (1).
    const code = isNodeErrnoException(err) ? ` (${err.code})` : '';
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: could not read the admin bundle shipped in @takuhon/cli${code}. ` +
        `Reinstall or upgrade @takuhon/cli and try again.\n`,
    };
  }

  const warn = result.warnings.map((w) => `takuhon: warning: ${w}\n`).join('');

  if (result.ok) {
    return {
      code: 0,
      stdout: `${dir}/ matches @takuhon/cli@${cliVersion} (provenance verified).\n`,
      stderr: warn,
    };
  }

  const detail = result.problems.map((problem) => `  - ${problem}`).join('\n');
  return {
    code: 1,
    stdout: '',
    stderr: `${warn}takuhon: ${dir}/ does not match @takuhon/cli@${cliVersion}:\n${detail}\n`,
  };
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}
