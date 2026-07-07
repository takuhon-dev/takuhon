/**
 * Provenance manifest for the admin SPA bundle.
 *
 * The admin form UI is a compiled bundle that `create-takuhon` / `takuhon admin
 * update` copy from the installed `@takuhon/cli` into a project (its
 * `admin-dist/`, or any `--dir`), where it is committed. Nothing otherwise ties
 * that committed copy to a specific CLI version — the scaffold README merely
 * asks the operator to keep `@takuhon/*` on a matching version. This module
 * makes that link machine-checkable: every copy stamps a
 * `.takuhon-admin-bundle.json` recording the CLI version and a SHA-256 of each
 * bundle file, and `takuhon admin verify` re-derives those hashes to confirm the
 * committed bundle is exactly what the pinned CLI ships.
 *
 * The hashing lives here (a single implementation) so the stamp written on copy
 * and the digest re-computed on verify can never disagree on format.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Filename of the provenance manifest, written at the root of the bundle dir. */
export const ADMIN_BUNDLE_MANIFEST = '.takuhon-admin-bundle.json';

/**
 * Manifest document format version. Bumped only if the manifest's own shape
 * changes (a new field, a different digest layout) — it lets a future `verify`
 * discriminate formats. Independent of the frozen `takuhon.json` schema.
 */
export const ADMIN_BUNDLE_MANIFEST_VERSION = 1;

export interface AdminBundleManifest {
  /** Manifest document format version ({@link ADMIN_BUNDLE_MANIFEST_VERSION}). */
  readonly manifestVersion: number;
  /** The `@takuhon/cli` version that produced the bundle (from its package.json). */
  readonly cliVersion: string;
  /**
   * Map of POSIX-relative file path -> `"sha256:<hex>"` for every file in the
   * bundle, excluding the manifest itself. Keys are sorted for a stable diff.
   */
  readonly files: Readonly<Record<string, string>>;
}

/**
 * The running CLI's version, read from its own `package.json` at runtime
 * (relative to the compiled bundle) so it can never drift from the admin bundle
 * shipped in this `@takuhon/cli`. Mirrors the resolver in `refresh-admin-command`.
 */
export function readCliVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/** Recursively collect every file (absolute path) under `dir`. */
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(abs)));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

/** sha256 of a single file as `"sha256:<hex>"`. */
async function hashFile(abs: string): Promise<string> {
  return `sha256:${createHash('sha256')
    .update(await readFile(abs))
    .digest('hex')}`;
}

/**
 * Hash every file under `dir` (excluding the manifest itself), keyed by its
 * POSIX-relative path and sorted. Values are `"sha256:<hex>"` so the algorithm
 * is self-describing in the committed manifest. Used for a *dedicated* bundle
 * directory (the source bundle shipped in the CLI); a shared assets directory is
 * hashed with {@link hashSelectedFiles} instead, so unrelated siblings are not
 * pulled in.
 */
export async function hashBundleDir(dir: string): Promise<Record<string, string>> {
  const absPaths = await collectFiles(dir);
  const pairs: [string, string][] = [];
  for (const abs of absPaths) {
    const rel = relative(dir, abs).split(sep).join('/');
    if (rel === ADMIN_BUNDLE_MANIFEST) continue;
    pairs.push([rel, await hashFile(abs)]);
  }
  return sortedRecord(pairs);
}

/**
 * Hash the given POSIX-relative paths within `dir`, skipping any that are
 * missing (a caller detects a missing bundle file by the gap between the
 * requested paths and the returned keys). Unlike {@link hashBundleDir} this does
 * not walk the directory, so files that are not part of the bundle (a shared
 * `public/`'s PWA assets, service worker, images) are ignored.
 */
export async function hashSelectedFiles(
  dir: string,
  relpaths: readonly string[],
): Promise<Record<string, string>> {
  const pairs: [string, string][] = [];
  for (const rel of relpaths) {
    // Never follow a relpath out of the bundle directory: a hand-crafted
    // manifest could otherwise make verify hash arbitrary files via `..`.
    if (!isSafeRelpath(rel)) continue;
    try {
      pairs.push([rel, await hashFile(join(dir, ...rel.split('/')))]);
    } catch {
      // Missing file: omit it; the diff against the manifest reports the gap.
    }
  }
  return sortedRecord(pairs);
}

/**
 * A bundle-relative path that stays inside the bundle. Rejects absolute paths,
 * Windows drive-relative paths (`C:foo`), and any `.`/`..`/empty segment.
 * Splits on both separators so a `\` cannot smuggle a `..` past a POSIX-only
 * split when the path is later resolved on Windows. Exported so a caller that
 * acts on manifest-supplied relpaths (e.g. dropping stale files) can refuse an
 * unsafe one before touching the filesystem.
 */
export function isSafeRelpath(rel: string): boolean {
  if (rel === '' || rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) {
    return false;
  }
  return rel
    .split(/[/\\]/)
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function sortedRecord(pairs: [string, string][]): Record<string, string> {
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(pairs);
}

/**
 * Write the provenance manifest into `dir`, recording `cliVersion` and a hash of
 * each bundle file named by `relpaths` (the file set the bundle ships, so a
 * shared assets directory's unrelated siblings are excluded). Overwrites any
 * existing manifest. Called after the bundle is copied/refreshed into a project.
 */
export async function writeAdminBundleManifest(
  dir: string,
  cliVersion: string,
  relpaths: readonly string[],
): Promise<void> {
  const files = await hashSelectedFiles(dir, relpaths);
  const manifest: AdminBundleManifest = {
    manifestVersion: ADMIN_BUNDLE_MANIFEST_VERSION,
    cliVersion,
    files,
  };
  await writeFile(
    join(dir, ADMIN_BUNDLE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

/** Read and shape-check the manifest in `dir`; `undefined` when absent or invalid. */
export async function readAdminBundleManifest(
  dir: string,
): Promise<AdminBundleManifest | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(dir, ADMIN_BUNDLE_MANIFEST), 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return isManifest(parsed) ? parsed : undefined;
}

function isManifest(value: unknown): value is AdminBundleManifest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.manifestVersion !== 'number') return false;
  if (typeof v.cliVersion !== 'string') return false;
  if (typeof v.files !== 'object' || v.files === null) return false;
  return Object.values(v.files as Record<string, unknown>).every((h) => typeof h === 'string');
}

export interface AdminBundleVerifyResult {
  /** True when the committed bundle's bytes match the pinned CLI (warnings don't fail). */
  readonly ok: boolean;
  /** Byte-level drift that fails verification; empty when `ok`. */
  readonly problems: readonly string[];
  /** Non-fatal notes (e.g. a stale recorded version whose bytes still match). */
  readonly warnings: readonly string[];
}

/**
 * Verify a committed admin bundle against its manifest and the installed CLI:
 *   1. the manifest exists (else fail);
 *   2. the committed files hash to exactly what the manifest records
 *      (catches a local edit / partial copy — checkable offline);
 *   3. the manifest's file set is byte-identical to the bundle the installed CLI
 *      ships (the authoritative "committed == what the pinned CLI would install");
 *   4. the manifest's `cliVersion` matches the installed `@takuhon/cli` — a
 *      *warning*, not a failure: the byte checks above are authoritative, so a
 *      CLI release that leaves the admin bundle unchanged does not turn CI red.
 *
 * `ok` reflects only the byte checks (2, 3); version drift surfaces as a warning.
 */
export async function verifyAdminBundle(opts: {
  /** The project's committed bundle directory. */
  readonly dir: string;
  /** The installed CLI's shipped bundle (`resolveAdminBundleDir()`). */
  readonly cliBundleDir: string;
  /** The installed CLI version (`readCliVersion()`). */
  readonly cliVersion: string;
}): Promise<AdminBundleVerifyResult> {
  const manifest = await readAdminBundleManifest(opts.dir);
  if (!manifest) {
    return {
      ok: false,
      problems: [
        `no ${ADMIN_BUNDLE_MANIFEST} found — run \`takuhon admin update\` to stamp provenance.`,
      ],
      warnings: [],
    };
  }

  const problems: string[] = [];

  // Hash only the bundle's own files (from the manifest) within `dir`, so a
  // shared assets directory's unrelated siblings are ignored.
  const committed = await hashSelectedFiles(opts.dir, Object.keys(manifest.files));
  problems.push(...diffHashes('committed bundle vs its manifest', manifest.files, committed));

  // The authoritative check: the file set the manifest records must equal the
  // bundle the installed CLI ships. Combined with the committed-vs-manifest
  // check above, this proves the committed bundle is what the pinned CLI ships.
  const shipped = await hashBundleDir(opts.cliBundleDir);
  problems.push(
    ...diffHashes('manifest vs installed @takuhon/cli bundle', manifest.files, shipped),
  );

  // Version drift is only a warning: when the bytes above still match, a CLI
  // release that did not touch the admin bundle should not fail verification.
  const warnings: string[] = [];
  if (manifest.cliVersion !== opts.cliVersion) {
    warnings.push(
      `bundle was stamped by @takuhon/cli@${manifest.cliVersion} but the installed CLI is ` +
        `@${opts.cliVersion} — run \`takuhon admin update\` to re-stamp (and match your ` +
        `@takuhon/* dependencies).`,
    );
  }

  return { ok: problems.length === 0, problems, warnings };
}

/** Report files that are missing, unexpected, or whose hash differs, `expected` vs `actual`. */
function diffHashes(
  label: string,
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const [file, hash] of Object.entries(expected)) {
    if (!(file in actual)) problems.push(`${label}: missing file ${file}`);
    else if (actual[file] !== hash) problems.push(`${label}: hash mismatch for ${file}`);
  }
  for (const file of Object.keys(actual)) {
    if (!(file in expected)) problems.push(`${label}: unexpected file ${file}`);
  }
  return problems;
}
