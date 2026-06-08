import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // The precompiled standalone validator pulls in ajv-formats' format
  // functions and a couple of ajv runtime helpers via require(). Bundle them
  // so the ESM output carries no runtime require()/eval — keeping `validate()`
  // usable under a strict CSP and on the Workers runtime.
  noExternal: [/^ajv/],
});
