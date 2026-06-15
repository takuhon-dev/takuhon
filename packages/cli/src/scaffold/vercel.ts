/**
 * Generators for the `--platform vercel` scaffold.
 *
 * The Vercel scaffold is a minimal Next.js App Router project whose single
 * catch-all Route Handler mounts `@takuhon/vercel`'s `createTakuhonVercelApp`
 * via `hono/vercel`'s `handle`. It is read-only — no database, admin UI, or
 * auth, unlike the Cloudflare scaffold: the profile is the bundled
 * `takuhon.json`, edited in Git and redeployed. The Cloudflare-only files
 * (`wrangler.toml`, the Worker entry, the admin bundle) are intentionally
 * absent.
 */

import type { ContentLicenseFragment } from '../licenses.js';

import { TAKUHON_DEP_RANGE } from './deps.js';

/**
 * Validate a Vercel project name (also used as the npm `name`).
 *
 * Vercel project names are lowercase, up to 100 chars, and may contain letters,
 * digits, `.`, `_`, and `-`; they must start and end with an alphanumeric. This
 * is deliberately looser than the Cloudflare Worker-name rule (which maps to a
 * `workers.dev` DNS label) but still a safe npm `name`.
 */
export function isValidVercelProjectName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/.test(name);
}

export interface VercelPackageJsonOptions {
  /** Used for the npm `name` field. */
  readonly projectName: string;
}

export function buildVercelPackageJson(opts: VercelPackageJsonOptions): Record<string, unknown> {
  return {
    name: opts.projectName,
    version: '0.0.0',
    private: true,
    description: 'Takuhon profile deployment (Vercel).',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
    dependencies: {
      '@takuhon/vercel': TAKUHON_DEP_RANGE,
      hono: '^4.0.0',
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      typescript: '^5.7.0',
    },
    engines: {
      node: '>=22.0.0',
    },
  };
}

export function renderVercelPackageJson(opts: VercelPackageJsonOptions): string {
  return `${JSON.stringify(buildVercelPackageJson(opts), null, 2)}\n`;
}

/**
 * The catch-all Route Handler at `app/[[...route]]/route.ts`. The optional
 * catch-all matches `/` and every sub-path, so a single file serves the whole
 * public surface from `@takuhon/vercel`. `BundledTakuhonStorage` validates the
 * profile once at module load, so an invalid `takuhon.json` fails the build.
 */
export function renderVercelRouteTs(): string {
  return `import { BundledTakuhonStorage, createTakuhonVercelApp } from '@takuhon/vercel';
import { handle } from 'hono/vercel';

// The project's own profile, bundled into the deployment. Edit takuhon.json and
// redeploy (push to your Vercel-connected Git repo, or run \`vercel\`) to publish
// changes — this adapter is read-only at runtime.
import takuhonJson from '../../takuhon.json';

const app = createTakuhonVercelApp({
  storage: new BundledTakuhonStorage(takuhonJson),
});

export const GET = handle(app);
`;
}

/** Minimal `next.config.mjs`. */
export function renderNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;
}

/** `tsconfig.json` for the Next.js project (standard App Router settings). */
export function renderVercelTsconfigJson(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** `.gitignore` for a Next.js / Vercel project. */
export function renderVercelGitignore(): string {
  return `# Dependencies
node_modules/

# Next.js build output
.next/
next-env.d.ts

# Vercel
.vercel/

# Environment variables (commit \`.env.example\` instead)
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# macOS
.DS_Store
`;
}

/** `.env.example` — only the optional remote-profile URL applies to Vercel. */
export function renderVercelEnvExample(): string {
  return `# ----------------------------------------------------------------
# Local development variables for this Takuhon deployment (Vercel).
#
# This adapter is read-only: the profile is the bundled takuhon.json, edited in
# Git. There are no admin tokens or KV/R2 bindings.
# ----------------------------------------------------------------

# Optional: fetch the profile from a URL at cold start instead of bundling it.
# Leave unset to use the committed takuhon.json (the default). When set, switch
# the route to UrlTakuhonStorage (see app/[[...route]]/route.ts).
# TAKUHON_DATA_URL=https://example.com/takuhon.json
`;
}

export interface VercelReadmeOptions {
  readonly projectName: string;
  readonly license: ContentLicenseFragment;
}

function formatLicenseLine(license: ContentLicenseFragment): string {
  if (license.spdxId === 'Proprietary') {
    return '**Proprietary** — all rights reserved.';
  }
  if (license.url !== undefined) {
    return `[\`${license.spdxId}\`](${license.url})`;
  }
  return `\`${license.spdxId}\``;
}

export function renderVercelReadme(opts: VercelReadmeOptions): string {
  const { projectName, license } = opts;
  const licenseLine = formatLicenseLine(license);
  return `# ${projectName}

A [Takuhon](https://github.com/takuhon-dev/takuhon) profile deployment, running on [Vercel](https://vercel.com) via the read-only \`@takuhon/vercel\` adapter.

> **Status**: pre-deploy. Edit \`takuhon.json\`, then deploy to Vercel.

## What is Takuhon?

Takuhon lets you own your profile as a portable JSON document and publish it as a mobile-first profile page plus a public API (JSON-LD for AI agents and search engines included).

## How it works

This project is a minimal Next.js App Router app. The catch-all route at
\`app/[[...route]]/route.ts\` mounts \`@takuhon/vercel\`, which serves:

- \`/\` and \`/<locale>/\` — the server-rendered profile page with embedded Schema.org JSON-LD
- \`/api/profile\`, \`/api/jsonld\`, \`/api/schema\`
- \`/takuhon.json\`, \`/.well-known/takuhon.json\`

It is **read-only**: there is no admin UI, auth, or database. Your profile is the
committed \`takuhon.json\` — edit it and redeploy to publish changes. (Image
uploads, the MCP endpoint, and the activity badge are Cloudflare-adapter
features; use \`@takuhon/cloudflare\` if you need them.)

## Setup

1. **Install dependencies.**

   \`\`\`sh
   pnpm install
   \`\`\`

2. **Edit your profile.** Open \`takuhon.json\` and replace the sample fields (\`profile.displayName\`, \`links\`, \`careers\`, \`projects\`, \`skills\`) with your own.

3. **Run it locally.**

   \`\`\`sh
   pnpm dev
   \`\`\`

   Open the printed URL: \`/\` serves your profile page and \`/api/*\` serves the JSON API.

## Deploy

Push this project to a Git repository connected to Vercel, or deploy from the CLI:

\`\`\`sh
npx vercel
\`\`\`

To publish changes later, edit \`takuhon.json\`, commit, and push — Vercel redeploys automatically.

## License

Profile content (\`takuhon.json\`) is licensed under ${licenseLine}

The deployment code is your own; pick a license appropriate for it.
`;
}
