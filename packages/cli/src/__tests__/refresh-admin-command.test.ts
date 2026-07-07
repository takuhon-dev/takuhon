import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADMIN_BUNDLE_MANIFEST,
  hashBundleDir,
  readAdminBundleManifest,
  writeAdminBundleManifest,
} from '../admin-bundle-manifest.js';
import { runRefreshAdmin } from '../refresh-admin-command.js';
import { ADMIN_DIST_DIRNAME } from '../scaffold/wrangler-toml.js';

describe('runRefreshAdmin() — takuhon admin update', () => {
  let workDir: string;
  let bundleDir: string;
  let projectDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-cli-admin-update-'));

    // The new bundle to copy in — a stand-in for the built apps/admin/dist that
    // ships in @takuhon/cli's admin-bundle/ (index.html plus an assets/ subdir),
    // so the copy is exercised recursively without a real build of apps/admin.
    bundleDir = join(workDir, 'admin-bundle');
    await mkdir(join(bundleDir, 'assets'), { recursive: true });
    await writeFile(join(bundleDir, 'index.html'), '<!doctype html><title>new</title>', 'utf8');
    await writeFile(join(bundleDir, 'assets', 'app.js'), 'console.log("new");', 'utf8');

    // A scaffolded project: takuhon.json plus a stale admin-dist/ to be replaced.
    projectDir = join(workDir, 'my-profile');
    await mkdir(join(projectDir, ADMIN_DIST_DIRNAME, 'assets'), { recursive: true });
    await writeFile(join(projectDir, 'takuhon.json'), '{}', 'utf8');
    await writeFile(
      join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'),
      '<!doctype html><title>old</title>',
      'utf8',
    );
    // A file present only in the old bundle; the refresh must drop it.
    await writeFile(join(projectDir, ADMIN_DIST_DIRNAME, 'assets', 'stale.js'), 'old', 'utf8');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('replaces admin-dist/ with the shipped bundle and reports the version', async () => {
    const result = await runRefreshAdmin([projectDir], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(
      new RegExp(
        `^Refreshed ${ADMIN_DIST_DIRNAME}/ from @takuhon/cli@\\d+\\.\\d+\\.\\d+ \\(2 files\\)\\.\\n$`,
      ),
    );

    const index = await readFile(join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'), 'utf8');
    expect(index).toBe('<!doctype html><title>new</title>');
    const js = await readFile(join(projectDir, ADMIN_DIST_DIRNAME, 'assets', 'app.js'), 'utf8');
    expect(js).toBe('console.log("new");');
  });

  it('drops bundle files the previous manifest recorded but the new bundle no longer ships', async () => {
    // Record the current (old) bundle in a manifest so the refresh knows which
    // files it placed and may drop — stale.js is tracked, so it will go.
    const adminDist = join(projectDir, ADMIN_DIST_DIRNAME);
    await writeAdminBundleManifest(adminDist, '0.0.1', Object.keys(await hashBundleDir(adminDist)));

    await runRefreshAdmin([projectDir], { bundleDir });

    await expect(stat(join(adminDist, 'assets', 'stale.js'))).rejects.toThrow();
    expect(await readFile(join(adminDist, 'assets', 'app.js'), 'utf8')).toBe('console.log("new");');
  });

  it('refreshes the project in the current directory when no path is given', async () => {
    const cwd = process.cwd();
    process.chdir(projectDir);
    try {
      const result = await runRefreshAdmin([], { bundleDir });
      expect(result.code).toBe(0);
    } finally {
      process.chdir(cwd);
    }

    const index = await readFile(join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'), 'utf8');
    expect(index).toBe('<!doctype html><title>new</title>');
  });

  it('prints usage for --help without touching the filesystem', async () => {
    const result = await runRefreshAdmin(['--help'], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: takuhon admin update');

    // admin-dist/ is untouched (still the old content).
    const index = await readFile(join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'), 'utf8');
    expect(index).toBe('<!doctype html><title>old</title>');
  });

  it('rejects an unknown flag', async () => {
    const result = await runRefreshAdmin(['--force'], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown option '--force'");
  });

  it('rejects more than one path argument', async () => {
    const result = await runRefreshAdmin(['a', 'b'], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('at most one path argument');
  });

  it('refuses a directory that is not a takuhon project', async () => {
    const notAProject = join(workDir, 'empty');
    await mkdir(notAProject, { recursive: true });

    const result = await runRefreshAdmin([notAProject], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('is not a takuhon project');
  });

  it('refuses a project that has no admin-dist/ to refresh', async () => {
    const noBundle = join(workDir, 'no-bundle');
    await mkdir(noBundle, { recursive: true });
    await writeFile(join(noBundle, 'takuhon.json'), '{}', 'utf8');

    const result = await runRefreshAdmin([noBundle], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain(`no ${ADMIN_DIST_DIRNAME}/ directory to refresh`);
  });

  it('refuses when admin-dist exists but is not a directory', async () => {
    const fileBundle = join(workDir, 'file-bundle');
    await mkdir(fileBundle, { recursive: true });
    await writeFile(join(fileBundle, 'takuhon.json'), '{}', 'utf8');
    await writeFile(join(fileBundle, ADMIN_DIST_DIRNAME), 'not a dir', 'utf8');

    const result = await runRefreshAdmin([fileBundle], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('is not a directory');
  });

  it('stamps a provenance manifest recording the CLI version and file hashes', async () => {
    await runRefreshAdmin([projectDir], { bundleDir });

    const manifest = await readAdminBundleManifest(join(projectDir, ADMIN_DIST_DIRNAME));
    expect(manifest?.cliVersion).toMatch(/^\d+\.\d+\.\d+/);
    // The manifest indexes the bundle files (not itself) with sha256 values.
    expect(Object.keys(manifest?.files ?? {})).toEqual(['assets/app.js', 'index.html']);
    for (const value of Object.values(manifest?.files ?? {})) {
      expect(value).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    // The count in the success message excludes the manifest (source bundle files).
    // (asserted by the "(2 files)" regex above.)
  });

  it('refreshes a shared --dir directory and preserves unrelated user files (incl. nested)', async () => {
    // A shared assets dir (e.g. Cloudflare public/) holding both the admin bundle
    // and the user's own files — including one NESTED under assets/, the very
    // directory the bundle also uses. None of these are in any manifest.
    const shared = join(projectDir, 'public');
    await mkdir(join(shared, 'assets'), { recursive: true });
    await writeFile(join(shared, 'sw.js'), 'self.addEventListener("fetch",()=>{});', 'utf8');
    await writeFile(join(shared, 'assets', 'logo.png'), 'PNG-BYTES', 'utf8');

    const result = await runRefreshAdmin([projectDir, '--dir', 'public'], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Refreshed public/ from @takuhon/cli@');

    // Bundle files were written into public/…
    expect(await readFile(join(shared, 'index.html'), 'utf8')).toBe(
      '<!doctype html><title>new</title>',
    );
    expect(await readFile(join(shared, 'assets', 'app.js'), 'utf8')).toBe('console.log("new");');
    // …a manifest was stamped…
    await expect(stat(join(shared, ADMIN_BUNDLE_MANIFEST))).resolves.toBeDefined();
    // …and the user's files survived — the top-level sibling AND the one nested
    // under assets/ (file-level replacement, not a whole-directory wipe).
    expect(await readFile(join(shared, 'sw.js'), 'utf8')).toBe(
      'self.addEventListener("fetch",()=>{});',
    );
    expect(await readFile(join(shared, 'assets', 'logo.png'), 'utf8')).toBe('PNG-BYTES');
  });

  it('rejects an unsafe --dir value', async () => {
    const result = await runRefreshAdmin([projectDir, '--dir', '../escape'], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("'--dir' must be a single directory name");
  });
});
