/**
 * Generator for the scaffolded project's `package.json`.
 *
 * Pinned dependency versions are caret ranges matched to the current
 * minor of the published `@takuhon/*` packages. Under 0.x semver, a caret
 * does not span minor versions, so the range must move forward with each
 * `@takuhon/core` minor release to keep scaffolded projects on the
 * matching schema generation. `hono` is declared as a direct dependency
 * because the scaffolded `src/index.ts` imports from it; `wrangler` is a
 * devDependency since it's the deploy / dev-server tool.
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
      '@takuhon/api': '^0.2.0',
      '@takuhon/cloudflare': '^0.2.0',
      '@takuhon/core': '^0.2.0',
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
