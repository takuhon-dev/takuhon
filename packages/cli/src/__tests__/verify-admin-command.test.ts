import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashBundleDir, writeAdminBundleManifest } from '../admin-bundle-manifest.js';
import { runRefreshAdmin } from '../refresh-admin-command.js';
import { ADMIN_DIST_DIRNAME } from '../scaffold/wrangler-toml.js';
import { runVerifyAdmin } from '../verify-admin-command.js';

describe('runVerifyAdmin() — takuhon admin verify', () => {
  let workDir: string;
  let bundleDir: string;
  let projectDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-admin-verify-'));

    // The installed CLI's shipped bundle (stand-in for admin-bundle/).
    bundleDir = join(workDir, 'admin-bundle');
    await mkdir(join(bundleDir, 'assets'), { recursive: true });
    await writeFile(join(bundleDir, 'index.html'), '<!doctype html><title>ui</title>', 'utf8');
    await writeFile(join(bundleDir, 'assets', 'app.js'), 'console.log("ui");', 'utf8');

    // A scaffolded project with a committed admin-dist/ produced by `admin update`.
    projectDir = join(workDir, 'my-profile');
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'takuhon.json'), '{}', 'utf8');
    await mkdir(join(projectDir, ADMIN_DIST_DIRNAME), { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('passes for a bundle freshly written by `admin update`', async () => {
    await runRefreshAdmin([projectDir], { bundleDir });

    const result = await runVerifyAdmin([projectDir], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(
      new RegExp(
        `^${ADMIN_DIST_DIRNAME}/ matches @takuhon/cli@\\d+\\.\\d+\\.\\d+ \\(provenance verified\\)\\.\\n$`,
      ),
    );
  });

  it('fails (exit 1) when the committed bundle has no manifest', async () => {
    // A bundle placed by hand (or an old create-takuhon) without a manifest.
    await writeFile(join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'), '<!doctype html>', 'utf8');

    const result = await runVerifyAdmin([projectDir], { bundleDir });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('does not match');
    expect(result.stderr).toContain('run `takuhon admin update`');
  });

  it('fails (exit 1) when a committed file was edited after stamping', async () => {
    await runRefreshAdmin([projectDir], { bundleDir });
    await writeFile(
      join(projectDir, ADMIN_DIST_DIRNAME, 'index.html'),
      '<!doctype html><title>hand-edited</title>',
      'utf8',
    );

    const result = await runVerifyAdmin([projectDir], { bundleDir });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('hash mismatch for index.html');
  });

  it('warns (exit 0) when the recorded CLI version is stale but the bytes match', async () => {
    // Stamp the committed bundle with an older CLI version than the one now
    // installed (whose bundle still matches byte-for-byte). Bytes are the
    // authoritative check, so this passes with a warning rather than failing.
    await runRefreshAdmin([projectDir], { bundleDir });
    const committedDir = join(projectDir, ADMIN_DIST_DIRNAME);
    await writeAdminBundleManifest(
      committedDir,
      '0.0.1',
      Object.keys(await hashBundleDir(committedDir)),
    );

    const result = await runVerifyAdmin([projectDir], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('provenance verified');
    expect(result.stderr).toContain('warning');
    expect(result.stderr).toContain('@takuhon/cli@0.0.1');
  });

  it('verifies a shared --dir bundle without touching its siblings', async () => {
    const shared = join(projectDir, 'public');
    await mkdir(shared, { recursive: true });
    // A sibling asset that is not part of the admin bundle.
    await writeFile(join(shared, 'sw.js'), 'self.addEventListener("fetch",()=>{});', 'utf8');

    await runRefreshAdmin([projectDir, '--dir', 'public'], { bundleDir });
    const result = await runVerifyAdmin([projectDir, '--dir', 'public'], { bundleDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('public/ matches @takuhon/cli@');
  });

  it('prints usage for --help', async () => {
    const result = await runVerifyAdmin(['--help'], { bundleDir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: takuhon admin verify');
  });

  it('refuses a directory that is not a takuhon project', async () => {
    const notAProject = join(workDir, 'empty');
    await mkdir(notAProject, { recursive: true });

    const result = await runVerifyAdmin([notAProject], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('is not a takuhon project');
  });

  it('refuses a project with no bundle directory', async () => {
    const noBundle = join(workDir, 'no-bundle');
    await mkdir(noBundle, { recursive: true });
    await writeFile(join(noBundle, 'takuhon.json'), '{}', 'utf8');

    const result = await runVerifyAdmin([noBundle], { bundleDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain(`no ${ADMIN_DIST_DIRNAME}/ directory to verify`);
  });

  it('rejects an unsafe --dir value', async () => {
    const result = await runVerifyAdmin([projectDir, '--dir', '../escape'], { bundleDir });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("'--dir' must be a single directory name");
  });
});
