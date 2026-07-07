import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADMIN_BUNDLE_MANIFEST,
  hashBundleDir,
  hashSelectedFiles,
  readAdminBundleManifest,
  readCliVersion,
  verifyAdminBundle,
  writeAdminBundleManifest,
} from '../admin-bundle-manifest.js';

/** Write a stand-in admin bundle (index.html + assets/) under `dir`. */
async function makeBundle(dir: string, marker = 'v1'): Promise<void> {
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'index.html'), `<!doctype html><title>${marker}</title>`, 'utf8');
  await writeFile(join(dir, 'assets', 'app.js'), `console.log("${marker}");`, 'utf8');
}

describe('admin bundle manifest', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-manifest-'));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  describe('hashBundleDir()', () => {
    it('hashes every file with sorted POSIX keys and sha256: values, excluding the manifest', async () => {
      const dir = join(workDir, 'bundle');
      await makeBundle(dir);
      await writeFile(join(dir, ADMIN_BUNDLE_MANIFEST), '{"stale":true}', 'utf8');

      const hashes = await hashBundleDir(dir);

      expect(Object.keys(hashes)).toEqual(['assets/app.js', 'index.html']); // sorted, no manifest
      for (const value of Object.values(hashes)) {
        expect(value).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    });

    it('is deterministic and content-sensitive', async () => {
      const a = join(workDir, 'a');
      const b = join(workDir, 'b');
      await makeBundle(a, 'same');
      await makeBundle(b, 'same');
      expect(await hashBundleDir(a)).toEqual(await hashBundleDir(b));

      await writeFile(join(b, 'index.html'), '<!doctype html><title>different</title>', 'utf8');
      expect(await hashBundleDir(a)).not.toEqual(await hashBundleDir(b));
    });
  });

  describe('hashSelectedFiles()', () => {
    it('hashes only the requested, existing files and skips path-traversal / absolute paths', async () => {
      const dir = join(workDir, 'bundle');
      await makeBundle(dir);

      const hashes = await hashSelectedFiles(dir, [
        'index.html',
        'assets/app.js',
        'missing.js', // not present → omitted
        '../escape', // traversal → refused
        'a/../../b', // traversal → refused
        '/etc/hosts', // absolute → refused
      ]);

      expect(Object.keys(hashes)).toEqual(['assets/app.js', 'index.html']);
    });
  });

  describe('write / read', () => {
    it('round-trips a manifest with the CLI version and file hashes', async () => {
      const dir = join(workDir, 'bundle');
      await makeBundle(dir);
      await writeAdminBundleManifest(dir, '9.9.9', Object.keys(await hashBundleDir(dir)));

      const manifest = await readAdminBundleManifest(dir);
      expect(manifest?.cliVersion).toBe('9.9.9');
      expect(Object.keys(manifest?.files ?? {})).toEqual(['assets/app.js', 'index.html']);

      // The written file is stable, pretty JSON with a trailing newline.
      const raw = await readFile(join(dir, ADMIN_BUNDLE_MANIFEST), 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      expect(JSON.parse(raw)).toEqual(manifest);
    });

    it('returns undefined for an absent or malformed manifest', async () => {
      const dir = join(workDir, 'bundle');
      await makeBundle(dir);
      expect(await readAdminBundleManifest(dir)).toBeUndefined();

      await writeFile(join(dir, ADMIN_BUNDLE_MANIFEST), 'not json', 'utf8');
      expect(await readAdminBundleManifest(dir)).toBeUndefined();

      await writeFile(join(dir, ADMIN_BUNDLE_MANIFEST), '{"cliVersion":1}', 'utf8');
      expect(await readAdminBundleManifest(dir)).toBeUndefined();
    });
  });

  describe('verifyAdminBundle()', () => {
    it('passes when committed == manifest == installed CLI bundle', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result).toEqual({ ok: true, problems: [], warnings: [] });
    });

    it('fails when the manifest is missing', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toContain(`no ${ADMIN_BUNDLE_MANIFEST} found`);
    });

    it('fails when a committed file is edited after stamping (hash mismatch)', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );

      await writeFile(
        join(committed, 'index.html'),
        '<!doctype html><title>tampered</title>',
        'utf8',
      );

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toContain('hash mismatch for index.html');
    });

    it('warns (does not fail) when the recorded CLI version is stale but the bytes match', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '2.0.0',
      });
      // Bytes are identical, so verification passes; the version drift is a warning.
      expect(result.ok).toBe(true);
      expect(result.problems).toEqual([]);
      expect(result.warnings.join('\n')).toContain('@takuhon/cli@1.0.0');
      expect(result.warnings.join('\n')).toContain('@2.0.0');
    });

    it('ignores unrelated siblings in the bundle directory (shared-dir support)', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );
      // A sibling added after stamping (e.g. a shared public/'s service worker):
      // not part of the bundle, so verify must ignore it.
      await writeFile(join(committed, 'sw.js'), 'self', 'utf8');

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result).toEqual({ ok: true, problems: [], warnings: [] });
    });

    it('fails when a committed bundle file is missing', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );
      await rm(join(committed, 'index.html'));

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toContain('missing file index.html');
    });

    it('fails when the installed CLI bundle ships a file the manifest does not record', async () => {
      const cli = join(workDir, 'cli');
      const committed = join(workDir, 'committed');
      await makeBundle(cli);
      await makeBundle(committed);
      await writeAdminBundleManifest(
        committed,
        '1.0.0',
        Object.keys(await hashBundleDir(committed)),
      );
      // The installed CLI grew a new bundle file the committed copy predates.
      await writeFile(join(cli, 'assets', 'new.js'), 'console.log("added");', 'utf8');

      const result = await verifyAdminBundle({
        dir: committed,
        cliBundleDir: cli,
        cliVersion: '1.0.0',
      });
      expect(result.ok).toBe(false);
      expect(result.problems.join('\n')).toContain('unexpected file assets/new.js');
    });
  });

  it('readCliVersion() returns this package’s semver', () => {
    expect(readCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
