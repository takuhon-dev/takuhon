/**
 * `takuhon admin update [path] [--dir <name>]` — refresh a project's committed
 * admin form-UI bundle with the one shipped in this `@takuhon/cli`.
 *
 * `create-takuhon` copies the admin SPA into a new project's `admin-dist/` at
 * scaffold time, where it is then frozen (see `scaffold/index.ts`). When the CLI
 * is upgraded to a release carrying a newer admin UI, this command replaces the
 * project's bundle with that newer one, so the form UI can be updated without
 * re-scaffolding. It only refreshes an existing bundle directory; creating one
 * is `create-takuhon`'s job.
 *
 * `--dir <name>` (default `admin-dist/`) names the bundle directory. A project
 * that serves the bundle from a *shared* assets directory (e.g. a Cloudflare
 * `public/` that also holds PWA/static files) passes `--dir public`. The refresh
 * replaces only the bundle's own files (tracked by the manifest) and drops the
 * ones a previous bundle placed but the new one no longer ships, so unrelated
 * files a shared directory holds — even nested under a directory the bundle also
 * uses — are left untouched. For a dedicated `admin-dist/` this refreshes the
 * whole bundle as before.
 *
 * After copying, a `.takuhon-admin-bundle.json` provenance manifest is stamped
 * so `takuhon admin verify` can confirm the committed bundle matches a pinned
 * `@takuhon/cli`.
 *
 * Argument handling is a pure function returning streams plus an exit code, like
 * the other one-shot commands; `index.ts` writes the streams and exits.
 *
 * Exit codes:
 *   0 — refreshed (or `--help`)
 *   2 — bad arguments, the path is not a takuhon project, the bundle directory
 *       is missing, or the copy failed (operational errors)
 */

import { cp, mkdir, mkdtemp, realpath, rename, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  hashBundleDir,
  isSafeRelpath,
  readAdminBundleManifest,
  readCliVersion,
  writeAdminBundleManifest,
} from './admin-bundle-manifest.js';
import { parseAdminTargetArgs } from './admin-target.js';
import { resolveAdminBundleDir } from './scaffold/index.js';
import { ADMIN_DIST_DIRNAME } from './scaffold/wrangler-toml.js';

/** Marker file that identifies a directory as a takuhon project. */
const PROFILE_FILENAME = 'takuhon.json';

const USAGE = `Usage: takuhon admin update [path] [--dir <name>]

Refresh a project's admin form-UI bundle with the one shipped in this
@takuhon/cli. Use it after upgrading @takuhon/cli to pick up a newer admin UI
without re-scaffolding. With no path, refreshes the project in the current
directory.

  --dir <name>   Bundle directory within the project (default ${ADMIN_DIST_DIRNAME}). Pass the
                 assets directory a shared-layout project serves the bundle from
                 (e.g. --dir public); only the bundle's own files are replaced,
                 leaving other assets in that directory untouched.

The bundle directory must already exist (created by create-takuhon, or your own
shared assets directory); this command updates it, it does not create one.

Exit codes: 0 = refreshed, 2 = bad arguments / not a takuhon project /
no bundle directory / copy failed.
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
 * replaces the project's bundle with the shipped one and stamps a provenance
 * manifest. Never throws and never writes to the process streams — the caller
 * renders the returned `stdout` / `stderr` and exits with `code`.
 */
export async function runRefreshAdmin(
  args: readonly string[] = [],
  opts: RefreshAdminOptions = {},
): Promise<RefreshAdminOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseAdminTargetArgs(args);
  if ('error' in parsed) return usageError(parsed.error);

  const displayDir = parsed.pathArg ?? '.';
  const projectDir = resolve(parsed.pathArg ?? '.');
  const { dir } = parsed;

  // Guard 1: a takuhon.json marks this as a takuhon project, so we never
  // clobber an unrelated directory in some other kind of tree.
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
  const bundleTargetDir = join(projectDir, dir);
  const targetStat = await stat(bundleTargetDir).catch(() => undefined);
  if (targetStat === undefined) {
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: '${displayDir}' has no ${dir}/ directory to refresh.\n` +
        `Scaffold one with create-takuhon, or pass --dir to name an existing bundle directory.\n`,
    };
  }
  if (!targetStat.isDirectory()) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${join(displayDir, dir)}' exists but is not a directory.\n`,
    };
  }

  // Guard 3: the target must resolve to a directory inside the project. `--dir`
  // is a single segment, but the directory itself could be a symlink pointing
  // elsewhere — refuse it so the destructive replacement below can never delete
  // files outside the project.
  const realProject = await realpath(projectDir);
  const realTarget = await realpath(bundleTargetDir);
  if (realTarget !== realProject && !realTarget.startsWith(realProject + sep)) {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${join(displayDir, dir)}' resolves outside the project; refusing to modify it.\n`,
    };
  }

  const bundleDir = opts.bundleDir ?? resolveAdminBundleDir();

  // Files the previous refresh placed (from its manifest), so we can drop the
  // ones the new bundle no longer ships without touching unrelated files a
  // shared assets directory may hold. Untrusted (committed), so path-guarded.
  const previous = await readAdminBundleManifest(bundleTargetDir);
  const oldRelpaths = previous ? Object.keys(previous.files).filter(isSafeRelpath) : [];

  let staged: string | undefined;
  try {
    // Stage the fresh bundle on the same filesystem as the target, then move it
    // in one file at a time. This touches exactly the bundle's own files, so a
    // dedicated admin-dist/ is fully refreshed while a shared public/ keeps its
    // unrelated files — even ones nested under a directory the bundle also uses
    // (e.g. a user's public/assets/logo.png survives an assets/-based bundle).
    staged = await mkdtemp(join(projectDir, '.takuhon-admin-stage-'));
    await cp(bundleDir, staged, { recursive: true });
    const newRelpaths = Object.keys(await hashBundleDir(staged));

    for (const rel of newRelpaths) {
      const segments = rel.split('/');
      const dest = join(bundleTargetDir, ...segments);
      await mkdir(dirname(dest), { recursive: true });
      await rm(dest, { force: true });
      await rename(join(staged, ...segments), dest);
    }
    // Drop files the previous bundle placed that the new one no longer ships,
    // then best-effort remove any directory they left empty (rmdir fails, and is
    // ignored, when the directory still holds unrelated files).
    for (const rel of oldRelpaths) {
      if (newRelpaths.includes(rel)) continue;
      const dest = join(bundleTargetDir, ...rel.split('/'));
      await rm(dest, { force: true });
      await rmdir(dirname(dest)).catch(() => undefined);
    }
    await rm(staged, { recursive: true, force: true });
    staged = undefined;
    // Stamp provenance over the freshly-copied bundle so `takuhon admin verify`
    // can later confirm it matches a pinned @takuhon/cli.
    await writeAdminBundleManifest(bundleTargetDir, readCliVersion(), newRelpaths);

    const fileCount = newRelpaths.length;
    const plural = fileCount === 1 ? '' : 's';
    return {
      code: 0,
      stdout: `Refreshed ${dir}/ from @takuhon/cli@${readCliVersion()} (${fileCount} file${plural}).\n`,
      stderr: '',
    };
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
        `takuhon: failed to refresh ${dir}/ from @takuhon/cli${code}. ` +
        `Reinstall or upgrade @takuhon/cli and try again.\n`,
    };
  }
}

function usageError(message: string): RefreshAdminOutcome {
  return {
    code: 2,
    stdout: '',
    stderr: `takuhon: ${message}\nRun \`takuhon admin update --help\` for usage.\n`,
  };
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}
