/**
 * Top-level scaffolding orchestrator for `create-takuhon`.
 *
 * `writeProject` creates the target directory (must not already exist), then
 * writes the eight files that make up the scaffold: `takuhon.json`,
 * `wrangler.toml`, `package.json`, `README.md`, `.gitignore`, `.env.example`,
 * `tsconfig.json`, and `src/index.ts` (the Cloudflare Worker entry composed via
 * `createTakuhonWorker` from `@takuhon/cloudflare`).
 *
 * `copyAdminBundle` then copies the bundled admin SPA into the project's
 * `admin-dist/` so the Worker can serve the form UI at `/admin`. `init.ts`
 * calls both in sequence.
 */

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ContentLicenseFragment } from '../licenses.js';

import { renderEnvExample } from './env-example.js';
import { renderGitignore } from './gitignore.js';
import { renderPackageJson } from './package-json.js';
import { renderReadme } from './readme.js';
import { renderTakuhonJson } from './takuhon-json.js';
import { renderTsconfigJson } from './tsconfig-json.js';
import {
  renderNextConfig,
  renderVercelEnvExample,
  renderVercelGitignore,
  renderVercelPackageJson,
  renderVercelReadme,
  renderVercelRouteTs,
  renderVercelTsconfigJson,
} from './vercel.js';
import { renderWorkerIndexTs } from './worker-index-ts.js';
import { ADMIN_DIST_DIRNAME, renderWranglerToml } from './wrangler-toml.js';

/** Target platform for a scaffolded project. */
export type ScaffoldPlatform = 'cloudflare' | 'vercel';

export interface WriteProjectOptions {
  /** Absolute path of the directory to create. Must not exist. */
  readonly targetDir: string;
  /** Used for the npm `name`, Worker name, and README header. */
  readonly projectName: string;
  /** Chosen content license (already mapped via `buildContentLicense`). */
  readonly license: ContentLicenseFragment;
  /** Target platform. Defaults to `'cloudflare'` (backwards-compatible). */
  readonly platform?: ScaffoldPlatform;
}

export interface WriteProjectResult {
  /** Relative paths of files that were written (in the order written). */
  readonly files: readonly string[];
}

/**
 * Error thrown when the target directory already exists. The caller is
 * expected to render a friendly message that references the user-supplied
 * path; the `code` is stable for tests. The absolute `targetDir` is exposed
 * as a field rather than embedded in the message so that bubbling the error
 * up through generic logging does not leak filesystem layout.
 */
export class TargetDirectoryExistsError extends Error {
  override readonly name = 'TargetDirectoryExistsError';
  readonly code = 'TARGET_EXISTS' as const;
  constructor(readonly targetDir: string) {
    super('Target directory already exists.');
  }
}

/**
 * Create the project directory and write the scaffolded files. Order is
 * deterministic so callers (and tests) can rely on it.
 */
export async function writeProject(opts: WriteProjectOptions): Promise<WriteProjectResult> {
  const { targetDir, projectName, license, platform = 'cloudflare' } = opts;

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

  const files: { readonly path: string; readonly content: string }[] =
    platform === 'vercel'
      ? [
          { path: 'takuhon.json', content: renderTakuhonJson(license) },
          { path: 'package.json', content: renderVercelPackageJson({ projectName }) },
          { path: 'README.md', content: renderVercelReadme({ projectName, license }) },
          { path: '.gitignore', content: renderVercelGitignore() },
          { path: '.env.example', content: renderVercelEnvExample() },
          { path: 'tsconfig.json', content: renderVercelTsconfigJson() },
          { path: 'next.config.mjs', content: renderNextConfig() },
          { path: 'app/[[...route]]/route.ts', content: renderVercelRouteTs() },
        ]
      : [
          { path: 'takuhon.json', content: renderTakuhonJson(license) },
          { path: 'wrangler.toml', content: renderWranglerToml(projectName) },
          { path: 'package.json', content: renderPackageJson({ projectName }) },
          { path: 'README.md', content: renderReadme({ projectName, license }) },
          { path: '.gitignore', content: renderGitignore() },
          { path: '.env.example', content: renderEnvExample() },
          { path: 'tsconfig.json', content: renderTsconfigJson() },
          { path: 'src/index.ts', content: renderWorkerIndexTs() },
        ];

  for (const { path, content } of files) {
    const fullPath = join(targetDir, path);
    const parent = dirname(fullPath);
    if (parent !== targetDir) {
      await mkdir(parent, { recursive: true });
    }
    await writeFile(fullPath, content, 'utf8');
  }

  return { files: files.map((f) => f.path) };
}

function isNodeErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}

/**
 * Resolve the admin SPA bundle that ships inside this package. The bundle is
 * copied here from `apps/admin/dist` at build time (see
 * `scripts/copy-admin-bundle.mjs`) and listed in the package's `files`, so it
 * is present in the published `@takuhon/cli` tarball. Resolved relative to the
 * compiled module (`dist/init.js` or `dist/index.js`), whose sibling is
 * `admin-bundle/`.
 */
export function resolveAdminBundleDir(): string {
  return fileURLToPath(new URL('../admin-bundle', import.meta.url));
}

export interface CopyAdminBundleOptions {
  /** Project directory previously created by {@link writeProject}. */
  readonly targetDir: string;
  /**
   * Source bundle directory. Defaults to the bundle shipped in this package
   * ({@link resolveAdminBundleDir}); overridable for tests.
   */
  readonly bundleDir?: string;
}

export interface CopyAdminBundleResult {
  /** Absolute path of the directory the bundle was copied into. */
  readonly dest: string;
}

/**
 * Copy the admin SPA bundle into the scaffolded project's
 * `{@link ADMIN_DIST_DIRNAME}` directory. The generated `wrangler.toml` binds
 * this directory as `ASSETS`, and the Cloudflare Worker serves it at `/admin`
 * under a strict CSP (falling back to an inline editor when the binding is
 * absent). Kept separate from {@link writeProject} so the static-asset copy and
 * the generated-file rendering are independently testable.
 */
export async function copyAdminBundle(
  opts: CopyAdminBundleOptions,
): Promise<CopyAdminBundleResult> {
  const bundleDir = opts.bundleDir ?? resolveAdminBundleDir();
  const dest = join(opts.targetDir, ADMIN_DIST_DIRNAME);
  try {
    await cp(bundleDir, dest, { recursive: true });
  } catch (err) {
    // The bundle ships inside @takuhon/cli, so a failure here means a broken
    // or incomplete install. Surface a sanitized message — the raw error would
    // embed the absolute node_modules path of this package.
    const code = isNodeErrnoException(err) ? ` (${err.code})` : '';
    throw new Error(
      `Failed to copy the admin UI bundle from @takuhon/cli${code}. ` +
        `Reinstall or upgrade @takuhon/cli and try again.`,
      { cause: err },
    );
  }
  return { dest };
}
