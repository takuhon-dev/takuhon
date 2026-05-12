# @meport/core

JSON Schema (`meport.schema.json`), Ajv-backed validation, normalization, locale resolution, JSON-LD generation, storage/asset interfaces, and migration registry for meport.

## Runtime requirements

`@meport/core` exports a [`validate()`](./src/validate.ts) function that compiles the bundled JSON Schema with [Ajv 8](https://ajv.js.org/) at module load. Ajv 8 generates its validators with `new Function(...)`, so the host runtime must permit dynamic code evaluation.

- ✅ Cloudflare Workers default runtime, Node.js, modern browsers
- ⚠ Environments that block `new Function` (strict Content Security Policy without `'unsafe-eval'`, some edge runtimes in their strict modes) cannot run the runtime validator as-is. If this becomes a deployment constraint, build a standalone validator with Ajv's [`standaloneCode`](https://ajv.js.org/standalone.html) helper and ship it alongside the schema.

The Phase 1 milestones (validate, normalize, resolve-locale, JSON-LD) target Workers as the primary runtime, so the project ships the runtime-compilation path by default. Pre-compiled output is future work.
