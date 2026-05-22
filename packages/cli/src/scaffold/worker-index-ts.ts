/**
 * Generator for `src/index.ts` — the Cloudflare Worker entry file written
 * into a freshly scaffolded project.
 *
 * The generated file uses `createTakuhonWorker()` from `@takuhon/cloudflare`
 * so the scaffolded project does not need to know the internal wiring
 * (Hono router, KV-backed storage, edge cache purger, console audit logger).
 * The user's own `takuhon.json` is loaded via an ES module JSON import,
 * validated once at module load, and the resulting `Takuhon` value is
 * served as the fallback when KV has no stored profile yet.
 *
 * `wrangler.toml`'s `main` field already points at `src/index.ts`, and
 * `nodejs_compat` is enabled, so the file works under `wrangler dev` /
 * `wrangler deploy` without further configuration.
 */

export function renderWorkerIndexTs(): string {
  return `import { createTakuhonWorker } from '@takuhon/cloudflare';
import { validate } from '@takuhon/core';

// Use the project's own takuhon.json as the fallback served when KV has no
// stored profile yet. Validated once at module load so a malformed profile
// fails fast rather than at first request.
import takuhonJson from '../takuhon.json' with { type: 'json' };

const fallback = validate(takuhonJson);
if (!fallback.ok) {
  throw new Error(
    'Project takuhon.json failed validation: ' +
      fallback.errors.map((e) => \`\${e.pointer}: \${e.message}\`).join('; '),
  );
}

const fallbackTakuhon = fallback.data;

export default createTakuhonWorker({
  fallback: () => fallbackTakuhon,
});
`;
}
