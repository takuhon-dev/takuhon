import { defineConfig } from 'tsup';

/**
 * Build configuration for `@takuhon/cloudflare`.
 *
 * The CLI-style `tsup` invocation used by the other publishable packages
 * (`@takuhon/{core,api,ui,cli}`) is not sufficient here because we need a
 * banner on the generated `dist/index.d.ts` that points at
 * `@cloudflare/workers-types`. Without that directive, TypeScript consumers
 * that import the exported `Env` interface (which references the
 * `KVNamespace` ambient global) fail to resolve the type unless they also
 * install and configure `@cloudflare/workers-types` themselves.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    banner: '/// <reference types="@cloudflare/workers-types" />',
  },
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
