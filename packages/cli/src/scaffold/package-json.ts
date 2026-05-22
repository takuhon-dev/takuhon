/**
 * Generator for the scaffolded project's `package.json`.
 *
 * Pinned dependency versions are caret ranges matched to the `0.1.x` line of
 * the published `@takuhon/*` packages (this is a Phase 3.5 MVP — once those
 * are on the registry, the user can run `pnpm install` and get a working
 * Cloudflare worker setup). `hono` is declared as a direct dependency because
 * the future scaffolded `src/index.ts` (added in a follow-up phase) imports
 * from it directly; `wrangler` is a devDependency since it's the deploy /
 * dev-server tool.
 */

export interface PackageJsonOptions {
  /** Used for the npm `name` field. */
  readonly projectName: string;
}

export function buildPackageJson(opts: PackageJsonOptions): Record<string, unknown> {
  return {
    name: opts.projectName,
    version: '0.0.0',
    private: true,
    type: 'module',
    description: 'Takuhon profile deployment.',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
    },
    dependencies: {
      '@takuhon/api': '^0.1.0',
      '@takuhon/cloudflare': '^0.1.0',
      '@takuhon/core': '^0.1.0',
      hono: '^4.0.0',
    },
    devDependencies: {
      wrangler: '^4.0.0',
    },
    engines: {
      node: '>=22.0.0',
    },
  };
}

export function renderPackageJson(opts: PackageJsonOptions): string {
  return `${JSON.stringify(buildPackageJson(opts), null, 2)}\n`;
}
