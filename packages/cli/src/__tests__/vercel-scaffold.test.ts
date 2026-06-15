import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeProject } from '../scaffold/index.js';
import { isValidVercelProjectName } from '../scaffold/vercel.js';

describe('writeProject({ platform: "vercel" })', () => {
  let workDir: string;
  let targetDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-cli-vercel-'));
    targetDir = join(workDir, 'my-profile');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function write(): Promise<{ files: readonly string[] }> {
    return writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      platform: 'vercel',
    });
  }

  it('writes the Vercel file set and none of the Cloudflare-only files', async () => {
    const result = await write();

    expect(result.files).toEqual([
      'takuhon.json',
      'package.json',
      'README.md',
      '.gitignore',
      '.env.example',
      'tsconfig.json',
      'next.config.mjs',
      'app/[[...route]]/route.ts',
    ]);
    // Cloudflare-only files must be absent.
    expect(result.files).not.toContain('wrangler.toml');
    expect(result.files).not.toContain('src/index.ts');

    for (const relative of result.files) {
      const entry = await stat(join(targetDir, relative));
      expect(entry.isFile()).toBe(true);
    }
  });

  it('generates a package.json wired to @takuhon/vercel + Next, not Cloudflare', async () => {
    await write();
    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(pkg.name).toBe('my-profile');
    expect(pkg.dependencies).toMatchObject({
      '@takuhon/vercel': expect.any(String),
      hono: expect.any(String),
      next: expect.any(String),
      react: expect.any(String),
      'react-dom': expect.any(String),
    });
    expect(pkg.dependencies['@takuhon/cloudflare']).toBeUndefined();
    expect(pkg.scripts).toMatchObject({ dev: 'next dev', build: 'next build' });
  });

  it('pins @takuhon/vercel to the published minor (lockstep guard)', async () => {
    await write();
    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const cli = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const [major, minor] = cli.version.split('.');
    expect(pkg.dependencies['@takuhon/vercel']).toBe(`^${major}.${minor}.0`);
  });

  it('generates a catch-all route handler mounting the Vercel app', async () => {
    await write();
    const route = await readFile(join(targetDir, 'app/[[...route]]/route.ts'), 'utf8');
    expect(route).toContain("import { handle } from 'hono/vercel'");
    expect(route).toContain('createTakuhonVercelApp');
    expect(route).toContain('BundledTakuhonStorage');
    expect(route).toContain("import takuhonJson from '../../takuhon.json'");
    expect(route).toContain('export const GET = handle(app)');
  });

  it('still emits a schema-valid takuhon.json', async () => {
    await write();
    const profile = JSON.parse(await readFile(join(targetDir, 'takuhon.json'), 'utf8'));
    expect(validate(profile).ok).toBe(true);
  });
});

describe('isValidVercelProjectName', () => {
  it('accepts typical project names', () => {
    expect(isValidVercelProjectName('my-profile')).toBe(true);
    expect(isValidVercelProjectName('site_2026')).toBe(true);
    expect(isValidVercelProjectName('a')).toBe(true);
  });

  it('rejects invalid names', () => {
    expect(isValidVercelProjectName('My-Profile')).toBe(false); // uppercase
    expect(isValidVercelProjectName('-leading')).toBe(false);
    expect(isValidVercelProjectName('trailing-')).toBe(false);
    expect(isValidVercelProjectName('has space')).toBe(false);
    expect(isValidVercelProjectName('a'.repeat(101))).toBe(false);
  });
});
