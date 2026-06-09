/**
 * `takuhon admin update [path]` — refresh a scaffolded project's `admin-dist/`
 * with the admin form-UI bundle shipped in this `@takuhon/cli`.
 *
 * `create-takuhon` copies the admin SPA into a new project's `admin-dist/` at
 * scaffold time, where it is then frozen (see `scaffold/index.ts`). When the
 * CLI is upgraded to a release that carries a newer admin UI, this command
 * replaces the project's `admin-dist/` with that newer bundle, so the form UI
 * can be updated without re-scaffolding (which would clobber the rest of the
 * project). It only refreshes an existing `admin-dist/`; creating one is
 * `create-takuhon`'s job.
 *
 * Argument handling is a pure function returning streams plus an exit code,
 * like the other one-shot commands; `index.ts` writes the streams and exits.
 *
 * Exit codes:
 *   0 — refreshed (or `--help`)
 *   2 — bad arguments, the path is not a takuhon project, the project has no
 *       `admin-dist/` to refresh, or the bundle copy failed (operational
 *       errors)
 */

import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { resolveAdminBundleDir } from './scaffold/index.js';
import { ADMIN_DIST_DIRNAME } from './scaffold/wrangler-toml.js';

/** Marker file that identifies a directory as a takuhon project. */
const PROFILE_FILENAME = 'takuhon.json';

const USAGE = `Usage: takuhon admin update [path]

Refresh a project's ${ADMIN_DIST_DIRNAME}/ with the admin form-UI bundle shipped in
this @takuhon/cli. Use it after upgrading @takuhon/cli to pick up a newer admin
UI without re-scaffolding. With no path, refreshes the project in the current
directory. The project must already have an ${ADMIN_DIST_DIRNAME}/ (created by
create-takuhon); this command updates it, it does not create one.

Exit codes: 0 = refreshed, 2 = bad arguments / not a takuhon project /
no ${ADMIN_DIST_DIRNAME}/ to refresh / copy failed.
`;

export interface RefreshAdminOptions {
  /**
   * Source bundle directory. Defaults to the bundle shipped in this package
   * ({@link resolveAdminBundleDir}); overridable for tests.
   */
  readonly bundleDir?: string;
}

export interface RefreshAdminOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/**
 * Run `takuhon admin update` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"admin" "update"`).
 *
 * Handles `--help` / `-h`, rejects unknown flags and extra positionals, then
 * replaces the project's `admin-dist/` with the shipped bundle. Never throws
 * and never writes to the process streams — the caller renders the returned
 * `stdout` / `stderr` and exits with `code`.
 */
export async function runRefreshAdmin(
  args: readonly string[] = [],
  opts: RefreshAdminOptions = {},
): Promise<RefreshAdminOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const unknownFlag = args.find((arg) => arg.startsWith('-'));
  if (unknownFlag !== undefined) {
    return usageError(`unknown option '${unknownFlag}'.`);
  }

  if (args.length > 1) {
    return usageError('`admin update` takes at most one path argument.');
  }

  const displayDir = args[0] ?? '.';
  const projectDir = resolve(args[0] ?? '.');

  // Guard 1: a takuhon.json marks this as a takuhon project, so we never
  // clobber an unrelated admin-dist/ in some other kind of directory.
  try {
    await stat(join(projectDir, PROFILE_FILENAME));
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: '${displayDir}' is not a takuhon project (no ${PROFILE_FILENAME} found).\n` +
        `Run \`takuhon admin update\` from a project created by create-takuhon.\n`,
    };
  }

  // Guard 2: refresh updates an existing bundle; it does not install one.
  const adminDist = join(projectDir, ADMIN_DIST_DIRNAME);
  const adminDistStat = await stat(adminDist).catch(() => undefined);
  if (adminDistStat === undefined) {
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: '${displayDir}' has no ${ADMIN_DIST_DIRNAME}/ directory to refresh.\n` +
        `This project was not scaffolded with the admin form UI; create a new project ` +
        `with create-takuhon to add it.\n`,
    };
  }
  if (!adminDistStat.isDirectory()) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${join(displayDir, ADMIN_DIST_DIRNAME)}' exists but is not a directory.\n`,
    };
  }

  const bundleDir = opts.bundleDir ?? resolveAdminBundleDir();

  let fileCount: number;
  let staged: string | undefined;
  try {
    fileCount = (await readdir(bundleDir, { recursive: true, withFileTypes: true })).filter(
      (entry) => entry.isFile(),
    ).length;
    // Stage the new bundle in a temp directory alongside admin-dist/, then swap
    // it in with a rename. A mid-copy failure leaves the staging dir (cleaned up
    // below), never a half-written admin-dist/, and the rename also drops any
    // stale files the previous bundle had that the new one does not.
    staged = await mkdtemp(join(projectDir, `.${ADMIN_DIST_DIRNAME}-`));
    await cp(bundleDir, staged, { recursive: true });
    await rm(adminDist, { recursive: true, force: true });
    await rename(staged, adminDist);
    staged = undefined;
  } catch (err) {
    if (staged !== undefined) {
      await rm(staged, { recursive: true, force: true }).catch(() => undefined);
    }
    // The bundle ships inside @takuhon/cli, so a copy failure usually means a
    // broken or incomplete install. Surface a sanitized message — the raw error
    // would embed the absolute node_modules path of this package.
    const code = isNodeErrnoException(err) ? ` (${err.code})` : '';
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: failed to refresh ${ADMIN_DIST_DIRNAME}/ from @takuhon/cli${code}. ` +
        `Reinstall or upgrade @takuhon/cli and try again.\n`,
    };
  }

  const plural = fileCount === 1 ? '' : 's';
  return {
    code: 0,
    stdout: `Refreshed ${ADMIN_DIST_DIRNAME}/ from @takuhon/cli@${readVersion()} (${fileCount} file${plural}).\n`,
    stderr: '',
  };
}

function usageError(message: string): RefreshAdminOutcome {
  return {
    code: 2,
    stdout: '',
    stderr: `takuhon: ${message}\nRun \`takuhon admin update --help\` for usage.\n`,
  };
}

/**
 * The reported version is sourced from package.json at runtime (relative to
 * this module) so it can never drift from the bundle actually shipped in this
 * `@takuhon/cli`.
 */
function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}
