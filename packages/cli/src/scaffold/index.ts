/**
 * Top-level scaffolding orchestrator for `create-takuhon`.
 *
 * `writeProject` is the single entry point used by `init.ts`. It creates the
 * target directory (must not already exist), then writes the six files that
 * make up a Phase 3.5 MVP scaffold: `takuhon.json`, `wrangler.toml`,
 * `package.json`, `README.md`, `.gitignore`, `.env.example`.
 *
 * The Worker source file (`src/index.ts`) is *not* emitted by this MVP; it
 * lands in a follow-up phase. The generated README points the user at the
 * `@takuhon/cloudflare` adapter docs in the meantime.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ContentLicenseFragment } from '../licenses.js';

import { renderEnvExample } from './env-example.js';
import { renderGitignore } from './gitignore.js';
import { renderPackageJson } from './package-json.js';
import { renderReadme } from './readme.js';
import { renderTakuhonJson } from './takuhon-json.js';
import { renderWranglerToml } from './wrangler-toml.js';

export interface WriteProjectOptions {
  /** Absolute path of the directory to create. Must not exist. */
  readonly targetDir: string;
  /** Used for the npm `name`, Worker name, and README header. */
  readonly projectName: string;
  /** Chosen content license (already mapped via `buildContentLicense`). */
  readonly license: ContentLicenseFragment;
}

export interface WriteProjectResult {
  /** Relative paths of files that were written (in the order written). */
  readonly files: readonly string[];
}

/**
 * Error thrown when the target directory already exists. The caller can
 * surface a friendly message; the `code` is stable for testing.
 */
export class TargetDirectoryExistsError extends Error {
  override readonly name = 'TargetDirectoryExistsError';
  readonly code = 'TARGET_EXISTS' as const;
  constructor(readonly targetDir: string) {
    super(`Target directory already exists: ${targetDir}`);
  }
}

/**
 * Create the project directory and write the scaffolded files. Order is
 * deterministic so callers (and tests) can rely on it.
 */
export async function writeProject(opts: WriteProjectOptions): Promise<WriteProjectResult> {
  const { targetDir, projectName, license } = opts;

  // mkdir with recursive: false fails if the directory exists; we surface a
  // typed error so the CLI entry can render a friendly message.
  try {
    await mkdir(targetDir, { recursive: false });
  } catch (err) {
    if (isNodeErrnoException(err) && err.code === 'EEXIST') {
      throw new TargetDirectoryExistsError(targetDir);
    }
    throw err;
  }

  const files: { readonly path: string; readonly content: string }[] = [
    { path: 'takuhon.json', content: renderTakuhonJson(license) },
    { path: 'wrangler.toml', content: renderWranglerToml(projectName) },
    { path: 'package.json', content: renderPackageJson({ projectName }) },
    { path: 'README.md', content: renderReadme({ projectName, license }) },
    { path: '.gitignore', content: renderGitignore() },
    { path: '.env.example', content: renderEnvExample() },
  ];

  for (const { path, content } of files) {
    await writeFile(join(targetDir, path), content, 'utf8');
  }

  return { files: files.map((f) => f.path) };
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}
