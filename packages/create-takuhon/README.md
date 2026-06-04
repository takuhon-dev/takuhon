# create-takuhon

The initializer for [Takuhon](https://github.com/takuhon-dev/takuhon). Scaffold a new Takuhon profile deployment with the standard `npm create` / `npx create-*` workflow:

```sh
npm create takuhon@latest my-profile
# or
npx create-takuhon my-profile
# non-interactive license selection:
npx create-takuhon my-profile --license CC-BY-4.0
```

It writes a Cloudflare Worker deployment — a `wrangler.toml`, a starter `takuhon.json`, a `tsconfig.json`, and a Worker entry that composes Takuhon via `@takuhon/cloudflare` — and prompts for a content license. Run `npx create-takuhon --help` for options.

## Why a separate package?

npm resolves `npm create <name>` and `npx create-<name>` to the package named `create-<name>`. This package is a thin shim whose only job is to make `create-takuhon` resolvable; all the scaffolding logic lives in [`@takuhon/cli`](https://www.npmjs.com/package/@takuhon/cli) (its `create-takuhon` entry), which this package re-exports and runs.

## Versioning

This package ships in lockstep with `@takuhon/cli` (and the rest of the `@takuhon/*` family). Its `dependencies` pin `@takuhon/cli` at the same version, so a given `create-takuhon@<v>` always scaffolds with the matching CLI generation.

## License

[Apache-2.0](./LICENSE). See also [NOTICE](./NOTICE).
