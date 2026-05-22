import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TargetDirectoryExistsError, writeProject } from '../scaffold/index.js';

describe('writeProject() — Phase 3.5 MVP scaffold', () => {
  let workDir: string;
  let targetDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-cli-scaffold-'));
    targetDir = join(workDir, 'my-profile');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('creates the target directory and writes all six MVP files in order', async () => {
    const result = await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: {
        spdxId: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    });

    expect(result.files).toEqual([
      'takuhon.json',
      'wrangler.toml',
      'package.json',
      'README.md',
      '.gitignore',
      '.env.example',
    ]);

    for (const relative of result.files) {
      const entry = await stat(join(targetDir, relative));
      expect(entry.isFile()).toBe(true);
    }
  });

  it('produces a takuhon.json that validates against @takuhon/core', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: {
        spdxId: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    });

    const raw = await readFile(join(targetDir, 'takuhon.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const result = validate(parsed);

    expect(result.ok).toBe(true);
  });

  it('writes the chosen license fragment into takuhon.json meta.contentLicense', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: {
        spdxId: 'Proprietary',
        rights: 'All rights reserved. Contact owner for usage permission.',
      },
    });

    const raw = await readFile(join(targetDir, 'takuhon.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      meta?: { contentLicense?: { spdxId?: string; url?: string; rights?: string } };
    };

    expect(parsed.meta?.contentLicense?.spdxId).toBe('Proprietary');
    expect(parsed.meta?.contentLicense?.rights).toMatch(/all rights reserved/i);
    expect(parsed.meta?.contentLicense?.url).toBeUndefined();
  });

  it('embeds the project name into wrangler.toml as the Worker name', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    });

    const toml = await readFile(join(targetDir, 'wrangler.toml'), 'utf8');
    expect(toml).toContain('name = "my-profile"');
    expect(toml).toContain('binding = "TAKUHON_KV"');
    expect(toml).toContain('TAKUHON_ADMIN_ORIGIN = ""');
    expect(toml).not.toMatch(/\bOWNPORT_/);
  });

  it('writes a package.json with takuhon-monorepo dependencies and the project name', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const raw = await readFile(join(targetDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      name?: string;
      type?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.name).toBe('my-profile');
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies).toMatchObject({
      '@takuhon/api': expect.any(String),
      '@takuhon/cloudflare': expect.any(String),
      '@takuhon/core': expect.any(String),
      hono: expect.any(String),
    });
    expect(pkg.devDependencies).toMatchObject({ wrangler: expect.any(String) });
    expect(pkg.scripts).toMatchObject({ dev: 'wrangler dev', deploy: 'wrangler deploy' });
  });

  it('renders the README with the project name and the chosen license URL', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: {
        spdxId: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    });

    const readme = await readFile(join(targetDir, 'README.md'), 'utf8');
    expect(readme).toMatch(/^# my-profile/);
    expect(readme).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(readme).toContain('`CC-BY-4.0`');
  });

  it('throws TargetDirectoryExistsError when the directory already exists', async () => {
    // First call creates the directory.
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    // Second call should refuse to overwrite.
    await expect(
      writeProject({
        targetDir,
        projectName: 'my-profile',
        license: { spdxId: 'CC0-1.0' },
      }),
    ).rejects.toThrow(TargetDirectoryExistsError);
  });

  it('rejects invalid Cloudflare Worker names (validated by wrangler-toml renderer)', async () => {
    await expect(
      writeProject({
        targetDir,
        projectName: 'Invalid Name With Spaces',
        license: { spdxId: 'CC0-1.0' },
      }),
    ).rejects.toThrow(/Invalid Cloudflare Worker name/);
  });
});
