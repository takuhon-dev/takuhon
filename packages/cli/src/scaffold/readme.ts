/**
 * Generator for the README.md placed in a freshly scaffolded project.
 *
 * Aims to give a first-time user enough to (1) install dependencies,
 * (2) fill in their profile data, (3) provision Cloudflare KV + admin
 * secret, and (4) `pnpm dev` / `pnpm deploy`. Cross-references the published
 * `@takuhon/cloudflare` adapter README as the next-step reference for the
 * route map.
 */

import type { ContentLicenseFragment } from '../licenses.js';

export interface ReadmeOptions {
  readonly projectName: string;
  readonly license: ContentLicenseFragment;
}

/**
 * Human-readable license attribution line for the README footer. Uses the
 * canonical URL when available; falls back to plain SPDX (or
 * "All rights reserved" for Proprietary).
 */
function formatLicenseLine(license: ContentLicenseFragment): string {
  if (license.spdxId === 'Proprietary') {
    return '**Proprietary** — all rights reserved.';
  }
  if (license.url !== undefined) {
    return `[\`${license.spdxId}\`](${license.url})`;
  }
  return `\`${license.spdxId}\``;
}

export function renderReadme(opts: ReadmeOptions): string {
  const { projectName, license } = opts;
  const licenseLine = formatLicenseLine(license);
  return `# ${projectName}

A [Takuhon](https://github.com/takuhon-dev/takuhon) profile deployment, running on Cloudflare Workers.

> **Status**: pre-deploy. Edit \`takuhon.json\`, provision Cloudflare KV, then \`pnpm deploy\`.

## What is Takuhon?

Takuhon lets you own your profile as a portable JSON document and publish it as a mobile-first profile page plus a public API (JSON-LD for AI agents and search engines included).

## Setup

1. **Install dependencies.**

   \`\`\`sh
   pnpm install
   \`\`\`

2. **Edit your profile.** Open \`takuhon.json\` and replace the sample fields (\`profile.displayName\`, \`links\`, \`careers\`, \`projects\`, \`skills\`) with your own.

3. **Create the Cloudflare KV namespaces** and copy the returned ids into \`wrangler.toml\`:

   \`\`\`sh
   npx wrangler kv namespace create TAKUHON_KV
   npx wrangler kv namespace create TAKUHON_KV --preview
   \`\`\`

4. **Provision the admin token** as a Wrangler secret (used by \`/api/admin/*\`):

   \`\`\`sh
   openssl rand -base64 32 | npx wrangler secret put TAKUHON_ADMIN_TOKEN
   \`\`\`

   Leaving the secret unset disables admin writes entirely (every \`PUT\` / \`DELETE\` returns 401).

## Develop

The Worker entry at \`src/index.ts\` composes the takuhon adapter via
\`createTakuhonWorker\` and serves your \`takuhon.json\` as the fallback when
KV has no stored profile yet.

\`\`\`sh
pnpm dev   # runs \`wrangler dev\` locally
\`\`\`

The full route map (public + admin) is documented in the [\`@takuhon/cloudflare\` README](https://github.com/takuhon-dev/takuhon/tree/main/adapters/cloudflare#readme).

## Admin

The admin form UI is served at \`/admin\` under a strict Content-Security-Policy. Its compiled bundle is committed in \`admin-dist/\` and bound as Workers Assets in \`wrangler.toml\`. Sign in with the admin token you set as the \`TAKUHON_ADMIN_TOKEN\` Wrangler secret.

The bundle is a snapshot taken when this project was created. To pick up a newer admin UI, upgrade your \`takuhon\` CLI and run \`takuhon admin update\` in this project — it replaces \`admin-dist/\` with the bundle shipped in your installed \`@takuhon/cli\` (keep your \`@takuhon/*\` dependencies on a matching version). To deploy without the form UI, remove the \`[assets]\` block from \`wrangler.toml\`; the Worker then falls back to a minimal inline editor.

### Image uploads (optional)

Image uploads are off until you bind an R2 bucket. Create one and uncomment the \`[[r2_buckets]]\` block in \`wrangler.toml\`:

\`\`\`sh
npx wrangler r2 bucket create ${projectName}-assets
\`\`\`

The Worker then accepts uploads at \`POST /api/admin/assets\` (magic-byte check, 5 MB / 4096px limits, EXIF/metadata stripping) and serves them at \`GET /assets/*\` with \`X-Content-Type-Options: nosniff\`. Without the binding, avatars stay URL-only.

## Deploy

\`\`\`sh
pnpm deploy   # runs \`wrangler deploy\`
\`\`\`

## License

Profile content (\`takuhon.json\`) is licensed under ${licenseLine}

The deployment code is your own; pick a license appropriate for it.
`;
}
