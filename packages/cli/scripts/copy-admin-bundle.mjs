// Copy the built admin SPA bundle (apps/admin/dist) into this package so it
// ships inside the published @takuhon/cli tarball. `create-takuhon` then copies
// it from here into each scaffolded project's admin-dist/ at init time, where
// the generated wrangler.toml serves it via the ASSETS binding under a strict
// CSP.
//
// This runs as the tail of `pnpm --filter @takuhon/cli build`, after apps/admin
// has been built. The @takuhon/admin devDependency on @takuhon/cli forces that
// order under `pnpm -r run build` (admin builds before cli), so the source
// dist/ is present and there is exactly one apps/admin build per run.

import { access, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceDir = fileURLToPath(new URL('../../../apps/admin/dist', import.meta.url));
const targetDir = fileURLToPath(new URL('../admin-bundle', import.meta.url));

try {
  await access(sourceDir);
} catch {
  // Keep the message free of host-absolute paths: only describe the fix.
  console.error(
    'Admin bundle source not found. Build apps/admin first ' +
      '(`pnpm --filter @takuhon/admin build`) before building @takuhon/cli.',
  );
  process.exit(1);
}

// Replace any stale copy so a removed/renamed asset never lingers in the tarball.
await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log('Copied admin bundle into packages/cli/admin-bundle/.');
