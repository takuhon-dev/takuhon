/**
 * Generator for the README.md placed in a freshly scaffolded project.
 *
 * Aims to give a first-time user enough to (1) fill in their profile data,
 * (2) provision Cloudflare KV + admin secret, and (3) deploy. The Worker
 * source file (`src/index.ts`) is not yet emitted by `create-takuhon`; that
 * lands in a follow-up phase. The README links the user to the published
 * `@takuhon/cloudflare` adapter README as the next reference point.
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

> **Heads-up — Takuhon is in a pre-publish phase.**
>
> The \`@takuhon/api\`, \`@takuhon/core\`, and \`@takuhon/cloudflare\` packages
> referenced in \`package.json\` are not yet on the npm registry.
> \`pnpm install\` will fail in this directory until they ship. See *Develop*
> below for the workspace-link recipe in the meantime.

## What is Takuhon?

Takuhon (拓本) lets you own your profile as a portable JSON document and publish it as a mobile-first profile page plus a public API (JSON-LD for AI agents and search engines included).

## Setup

1. **Edit your profile.** Open \`takuhon.json\` and replace the sample fields (\`profile.displayName\`, \`links\`, \`careers\`, \`projects\`, \`skills\`) with your own.

2. **Create the Cloudflare KV namespaces** and copy the returned ids into \`wrangler.toml\`:

   \`\`\`sh
   wrangler kv namespace create TAKUHON_KV
   wrangler kv namespace create TAKUHON_KV --preview
   \`\`\`

3. **Provision the admin token** as a Wrangler secret (used by \`/api/admin/*\`):

   \`\`\`sh
   openssl rand -base64 32 | wrangler secret put TAKUHON_ADMIN_TOKEN
   \`\`\`

   Leaving the secret unset disables admin writes entirely (every \`PUT\` / \`DELETE\` returns 401).

## Develop

The Worker entry at \`src/index.ts\` composes the takuhon adapter via
\`createTakuhonWorker\` and serves your \`takuhon.json\` as the fallback when
KV has no stored profile yet. Until the \`@takuhon/*\` packages are on npm,
clone the upstream repo and link them into this directory:

\`\`\`sh
git clone https://github.com/takuhon-dev/takuhon ~/projects/takuhon
( cd ~/projects/takuhon && pnpm install && pnpm build )
pnpm link ~/projects/takuhon/packages/api ~/projects/takuhon/packages/core ~/projects/takuhon/adapters/cloudflare
\`\`\`

Then:

\`\`\`sh
pnpm dev   # runs \`wrangler dev\` locally
\`\`\`

The full route map (public + admin) is documented in the [\`@takuhon/cloudflare\` README](https://github.com/takuhon-dev/takuhon/tree/main/adapters/cloudflare#readme).

## Deploy

\`\`\`sh
pnpm deploy   # runs \`wrangler deploy\`
\`\`\`

## License

Profile content (\`takuhon.json\`) is licensed under ${licenseLine}

The deployment code is your own; pick a license appropriate for it.
`;
}
