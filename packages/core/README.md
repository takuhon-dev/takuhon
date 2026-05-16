# @ownport/core

JSON Schema (`ownport.schema.json`), Ajv-backed validation, normalization, locale resolution, JSON-LD generation, storage/asset interfaces, and migration registry for ownport.

## Installation

```sh
pnpm add @ownport/core
# or
npm install @ownport/core
```

`@ownport/core` is an ESM-only package and targets Node.js 22+, modern browsers, and Cloudflare Workers. It has no peer dependencies.

## Usage

### Validate

`validate()` checks an unknown value against the bundled JSON Schema and returns a discriminated result. On success the value is narrowed to `Ownport`; on failure every issue is reported with a JSON Pointer and the failing Ajv keyword.

```ts
import { validate } from '@ownport/core';
import type { Ownport } from '@ownport/core';

const result = validate(rawJson);

if (result.ok) {
  const profile: Ownport = result.data;
  // …
} else {
  for (const issue of result.errors) {
    console.error(`${issue.pointer} (${issue.keyword}): ${issue.message}`);
  }
}
```

The schema itself and the list of accepted `schemaVersion` values are also exported:

```ts
import { schema, SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from '@ownport/core';
```

### Normalize

`normalize()` canonicalizes a validated document: it sorts the `links` / `careers` / `projects` / `skills` arrays by their `order` field (stable) and drops blank entries from every `LocalizedTitle` / `LocalizedBody` map. The input is deep-cloned, never mutated, and the function is idempotent.

```ts
import { normalize } from '@ownport/core';

const canonical = normalize(profile);
```

### Resolve locale

`resolveLocale()` collapses every per-locale map to a single string using a BCP-47 fallback chain: the requested locale, its regional roots (e.g. `pt-BR → pt`), `settings.fallbackLocale`, then `settings.defaultLocale`. The returned document records which tag produced `profile.displayName` in `resolvedLocale`.

```ts
import { normalize, resolveLocale } from '@ownport/core';

const localized = resolveLocale(normalize(profile), 'ja');
console.log(localized.profile.displayName); // single string
console.log(localized.resolvedLocale); //      'ja' (or its fallback)
```

The `locale` argument is optional; when omitted, `settings.defaultLocale` is used.

### JSON-LD (Schema.org)

`generateJsonLd()` returns an array of JSON-LD objects ready to embed in a `<script type="application/ld+json">` tag. The default output is a single `ProfilePage` with the `Person` inlined as its `mainEntity`. `generatePersonJsonLd()` and `generateProfilePageJsonLd()` are exposed for callers that need only one half.

```ts
import { generateJsonLd } from '@ownport/core';

const ld = generateJsonLd(localized);
// e.g. embed in HTML:
//   <script type="application/ld+json">{JSON.stringify(ld)}</script>
```

Optional keys are omitted (not set to `null`) when their source value is absent or empty, and field insertion order is fixed — so `JSON.stringify(generateJsonLd(x))` is deterministic for any given input.

## Storage interface (preview)

`OwnportStorage` and `OwnportAssetStorage` define the persistence contracts that adapters (Cloudflare KV/R2, filesystem, …) implement. `@ownport/core` ships only the types and the `StorageError` / `NotFoundError` / `ConflictError` exception family — there is no built-in adapter yet. Concrete adapters land in Phase 3.

```ts
import { ConflictError } from '@ownport/core';
import type { OwnportStorage } from '@ownport/core';

declare const storage: OwnportStorage;

const { data, version } = await storage.getProfile();
try {
  await storage.saveProfile(updated, version); // optimistic lock via If-Match
} catch (err) {
  if (err instanceof ConflictError) {
    // someone else wrote first; err.currentVersion has the latest token
  }
}
```

## Runtime requirements

`@ownport/core` exports a [`validate()`](./src/validate.ts) function that compiles the bundled JSON Schema with [Ajv 8](https://ajv.js.org/) at module load. Ajv 8 generates its validators with `new Function(...)`, so the host runtime must permit dynamic code evaluation.

- ✅ Cloudflare Workers default runtime, Node.js, modern browsers
- ⚠ Environments that block `new Function` (strict Content Security Policy without `'unsafe-eval'`, some edge runtimes in their strict modes) cannot run the runtime validator as-is. If this becomes a deployment constraint, build a standalone validator with Ajv's [`standaloneCode`](https://ajv.js.org/standalone.html) helper and ship it alongside the schema.

The Phase 1 milestones (validate, normalize, resolve-locale, JSON-LD) target Workers as the primary runtime, so the project ships the runtime-compilation path by default. Pre-compiled output is future work.

## License

[MIT](./LICENSE).
