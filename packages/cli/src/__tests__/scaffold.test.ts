import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_VERSION, validate } from '@takuhon/core';
import ts from 'typescript';
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

  it('creates the target directory and writes all scaffold files in order', async () => {
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
      'tsconfig.json',
      'src/index.ts',
    ]);

    for (const relative of result.files) {
      const entry = await stat(join(targetDir, relative));
      expect(entry.isFile()).toBe(true);
    }
  });

  it('generates a src/index.ts that composes the takuhon Worker via @takuhon/cloudflare', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const worker = await readFile(join(targetDir, 'src', 'index.ts'), 'utf8');

    // Imports the public factory from @takuhon/cloudflare.
    expect(worker).toContain("import { createTakuhonWorker } from '@takuhon/cloudflare'");
    // Pulls the project's own takuhon.json via a relative JSON import.
    expect(worker).toContain("import takuhonJson from '../takuhon.json' with { type: 'json' }");
    // Validates the bundled JSON before constructing the fallback.
    expect(worker).toContain("import { validate } from '@takuhon/core'");
    expect(worker).toContain('validate(takuhonJson)');
    // Default-exports the result of createTakuhonWorker (the shape wrangler expects).
    expect(worker).toMatch(/export default createTakuhonWorker\(\{\s*fallback/);
  });

  it('generates a src/index.ts that parses cleanly (no syntax errors)', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const worker = await readFile(join(targetDir, 'src', 'index.ts'), 'utf8');

    // `transpileModule` parses + lowers without resolving module imports, so
    // it catches syntax errors (unbalanced braces, malformed template literals,
    // unterminated strings) without needing a tsconfig + the @takuhon/* deps
    // resolvable on disk. We treat any Error-level syntactic diagnostic as a
    // failure; type-level diagnostics are out of scope here because the
    // referenced packages are not installed inside the tmpdir under test.
    const result = ts.transpileModule(worker, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        resolveJsonModule: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
      },
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics ?? []).filter(
      (d) => d.category === ts.DiagnosticCategory.Error,
    );
    expect(errors).toEqual([]);
  });

  it('generates a tsconfig.json with the settings the Worker entry depends on', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const raw = await readFile(join(targetDir, 'tsconfig.json'), 'utf8');
    const config = JSON.parse(raw) as {
      compilerOptions?: Record<string, unknown>;
      include?: unknown;
    };

    // Critical compiler flags for the generated src/index.ts to type-check:
    expect(config.compilerOptions?.resolveJsonModule).toBe(true);
    expect(config.compilerOptions?.moduleResolution).toBe('Bundler');
    expect(config.compilerOptions?.module).toBe('ESNext');
    expect(config.compilerOptions?.strict).toBe(true);
    expect(config.compilerOptions?.noEmit).toBe(true);
    // Source files are picked up from src/ (where src/index.ts lives).
    expect(config.include).toEqual(['src/**/*']);
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

  it('stamps takuhon.json with the current @takuhon/core SCHEMA_VERSION', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const raw = await readFile(join(targetDir, 'takuhon.json'), 'utf8');
    const parsed = JSON.parse(raw) as { schemaVersion?: string };

    // Mirrors examples-fixtures.test.ts: keep the scaffold template in lockstep
    // with the canonical schema generation. When @takuhon/core bumps
    // SCHEMA_VERSION this fails until the scaffold body is reviewed and the
    // version bumped — the guard the scaffold previously lacked, which let it
    // drift to an older schemaVersion unnoticed.
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
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

  it('pins the scaffolded @takuhon/* dependencies to the published minor', async () => {
    await writeProject({
      targetDir,
      projectName: 'my-profile',
      license: { spdxId: 'CC0-1.0' },
    });

    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    // Under 0.x semver a caret does not span minors, so the scaffold must pin
    // the same minor the CLI itself ships at (all @takuhon/* packages release in
    // lockstep). Deriving the expectation from the CLI's own version turns a
    // missed bump into a CI failure — the enforcement the scaffold previously
    // lacked, which let the range drift behind unnoticed.
    const cli = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
    };
    const [major, minor] = cli.version.split('.');
    const expected = `^${major}.${minor}.0`;

    expect(pkg.dependencies['@takuhon/core']).toBe(expected);
    expect(pkg.dependencies['@takuhon/api']).toBe(expected);
    expect(pkg.dependencies['@takuhon/cloudflare']).toBe(expected);
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
