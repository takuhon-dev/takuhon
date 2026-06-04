# Takuhon

**Takuhon: your identity, made portable.**

[![npm: takuhon](https://img.shields.io/npm/v/takuhon.svg?label=npm%3A%20takuhon&color=cb3837)](https://www.npmjs.com/package/takuhon)
[![npm: @takuhon/core](https://img.shields.io/npm/v/@takuhon/core.svg?label=npm%3A%20%40takuhon%2Fcore&color=cb3837)](https://www.npmjs.com/package/@takuhon/core)
[![npm: @takuhon/cli](https://img.shields.io/npm/v/@takuhon/cli.svg?label=npm%3A%20%40takuhon%2Fcli&color=cb3837)](https://www.npmjs.com/package/@takuhon/cli)
[![PyPI: takuhon](https://img.shields.io/pypi/v/takuhon.svg?label=pypi%3A%20takuhon&color=3776ab)](https://pypi.org/project/takuhon/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Open-source portable profile API server with a mobile-first profile page.

> **Status**: Phase 3 complete. The MVP surface — `@takuhon/core`, the Hono API, the Cloudflare edition with a minimal token-authenticated admin, and the `create-takuhon` initializer — is implemented and published on npm. Still `0.x`: the schema and APIs may change between minor versions.

## What is Takuhon?

Takuhon lets you own your profile — bio, SNS links, career history, projects, skills — as a portable JSON document, and publish it as a mobile-first profile page plus a public API (including JSON-LD for AI agents and search engines).

The canonical data lives in `takuhon.json`. Storage backends (Cloudflare KV, static file, etc.) are pluggable via adapters.

## Why "Takuhon"? (拓本)

The name **Takuhon** comes from 拓本 — a 2000-year-old craft of pressing paper against a stone inscription to lift a portable rubbing of the original. The stone stays put; the paper carries its imprint anywhere.

Takuhon applies the same idea to identity:

- **The original is immutable.** Your career, skills, and story at a given moment are like a stone inscription — a snapshot of who you are.
- **The reproduction is portable.** `takuhon.json` is the paper rubbing — the canonical you, copied into a form you can carry into REST APIs, JSON-LD, mobile profile pages, and AI agents.
- **The reproduction flows freely.** Paper rubbings travel and get read in many places; a JSON-LD–aware profile does the same — readable by humans, AI, and search engines alike.
- **The reproduction outlasts the platform.** When stone monuments crumble, the paper rubbing endures. When a platform shuts down, your `takuhon.json` survives.

Takuhon is a portable rubbing of who you are — drawn from your canonical profile, for people and AI.

## Quick start

Scaffold a deployable Cloudflare project and publish it:

```sh
# 1. Scaffold (prompts for a content license; or pass --license <SPDX-id>)
npx create-takuhon my-profile
cd my-profile
pnpm install   # installs wrangler and the @takuhon/* deps

# 2. Edit takuhon.json with your own profile data

# 3. Provision a Cloudflare KV namespace and paste the returned ids into wrangler.toml
npx wrangler kv namespace create TAKUHON_KV
npx wrangler kv namespace create TAKUHON_KV --preview

# 4. Set the admin token as a Wrangler secret
openssl rand -base64 32 | npx wrangler secret put TAKUHON_ADMIN_TOKEN

# 5. Preview locally, then deploy
pnpm dev      # wrangler dev
pnpm deploy   # wrangler deploy
```

`create-takuhon` requires the content license to be chosen up front (`meta.contentLicense` has no default). The interactive picker offers CC BY 4.0, CC BY-NC 4.0, CC0, Proprietary, or a custom SPDX identifier; `--license <SPDX-id>` skips the prompt.

## Edit your profile

`takuhon.json` is the canonical source. Two ways to work with it:

**Locally, with the CLI** (`@takuhon/cli` installs the `takuhon` binary):

```sh
takuhon validate            # validate ./takuhon.json against the schema
takuhon dev                 # serve a local static preview (loopback, port 4321)
takuhon build               # render a static site (one HTML page per locale)
```

**Live, with the minimal admin** (Cloudflare edition): visit `/admin` for a token-authenticated editor. Paste JSON, and it is validated against `takuhon.schema.json` (errors are reported by JSON Pointer), written to KV with optimistic locking, edge-cache-purged, and audit-logged.

## Deploy

- **Cloudflare (primary).** Scaffold with `create-takuhon`, then `pnpm deploy` (`wrangler deploy`). The Worker serves the public API, the JSON-LD endpoint, and the `/admin` editor, backed by KV.
- **Static hosting.** `takuhon build` renders a self-contained static site (per-locale HTML with build-time Schema.org JSON-LD) deployable to Cloudflare Pages, Netlify, GitHub Pages, or any static host.

## API endpoints

The Cloudflare edition serves the public surface below. Locale is resolved from `?lang=`, a `/{locale}` path prefix, or a cookie.

| Method | Path                        | Returns                                                                    |
| ------ | --------------------------- | -------------------------------------------------------------------------- |
| `GET`  | `/api/profile`              | Localized profile (`?lang=` selects the locale), with `meta` and an `ETag` |
| `GET`  | `/api/jsonld`               | Schema.org JSON-LD (`application/ld+json`)                                 |
| `GET`  | `/api/schema`               | The `takuhon.schema.json` contract                                         |
| `GET`  | `/takuhon.json`             | The raw public profile document                                            |
| `GET`  | `/.well-known/takuhon.json` | Discovery document linking the endpoints above                             |
| `GET`  | `/health`                   | Liveness probe                                                             |

The admin write/export API requires a bearer token (`TAKUHON_ADMIN_TOKEN`; leave it unset to disable writes entirely); an optional `Origin` allowlist (`TAKUHON_ADMIN_ORIGIN`) can additionally restrict browser-originating requests. The `/admin` page itself is static HTML whose editor calls these token-protected endpoints.

| Method   | Path                 | Behavior                                                                   |
| -------- | -------------------- | -------------------------------------------------------------------------- |
| `GET`    | `/admin`             | HTML editor UI                                                             |
| `PUT`    | `/api/admin/profile` | Validate + save to KV (`If-Match` optimistic lock), purge cache, audit-log |
| `DELETE` | `/api/admin/profile` | Delete the stored profile, purge cache, audit-log                          |
| `GET`    | `/api/admin/export`  | Export the stored profile verbatim (round-trips with `takuhon import`)     |

Errors use the [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) Problem Details envelope (`application/problem+json`).

## JSON Schema

`takuhon.schema.json` — shipped inside `@takuhon/core` and served at `GET /api/schema` — is the canonical public contract for a profile document. Validate any `takuhon.json` against it with `takuhon validate`.

## CLI

`@takuhon/cli` provides the `takuhon` binary. Implemented commands:

| Command                           | Purpose                                                           |
| --------------------------------- | ----------------------------------------------------------------- |
| `takuhon validate [path]`         | Validate a `takuhon.json` against the schema                      |
| `takuhon dev [path]`              | Serve a local static preview (re-rendered on each request)        |
| `takuhon build [path]`            | Render a static site (per-locale HTML + JSON-LD)                  |
| `takuhon migrate [path]`          | Forward-migrate a profile to a newer schema version (with backup) |
| `takuhon restore --from <backup>` | Restore a profile from a backup                                   |
| `takuhon export [path]`           | Serialize a profile to its transport form                         |
| `takuhon import <file> [path]`    | Import a previously exported profile, migrating if needed         |

`create-takuhon` (its own package, also a `bin` in `@takuhon/cli`) scaffolds a new project. `takuhon sync` (local `takuhon.json` → Cloudflare KV mirror) is planned.

## Packages

All seven artifacts are published to npm in lockstep at the same version.

| Package               | Purpose                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@takuhon/core`       | JSON Schema (`takuhon.schema.json`), validation, normalization, locale resolution, JSON-LD generation, privacy filter, storage/asset interfaces, migration registry |
| `@takuhon/api`        | Hono-based HTTP handlers (public + admin), RFC 7807 error envelope, response builders                                                                               |
| `@takuhon/ui`         | React mobile-first profile UI                                                                                                                                       |
| `@takuhon/cli`        | The `takuhon` CLI (`validate` / `dev` / `build` / `migrate` / `restore` / `export` / `import`) and the `create-takuhon` scaffolder                                  |
| `@takuhon/cloudflare` | Cloudflare adapter: KV-backed Worker wiring the public API + `/admin`                                                                                               |
| `takuhon`             | Bare-name redirect that runs the `@takuhon/cli` entry point                                                                                                         |
| `create-takuhon`      | Initializer for `npm create takuhon` / `npx create-takuhon <dir>`                                                                                                   |

## Adapters

Platform adapters live under `adapters/` and layer on top of the packages above.

- `adapters/cloudflare` — Cloudflare Workers + KV; published as `@takuhon/cloudflare` (Apache-2.0).
- `adapters/static` — filesystem storage backend and path helpers (Apache-2.0). Static-site _output_ is produced by `takuhon build`.
- Vercel and WordPress adapters are **planned** (the WordPress adapter will be `GPL-2.0-or-later`).

## Roadmap

- **Phase 1–3 — done.** Core + CI, static UI, and the Cloudflare edition with a minimal admin and `create-takuhon` (the MVP surface).
- **Phase 4 — in progress.** Distribution: richer templates, examples, the docs site, and npm publish automation.
- **Phase 5.** Admin UI form mode, local admin, Vercel/WordPress adapters.
- **Phase 6.** Advanced features (PDF/CV export, themes, MCP support) and project governance.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md), and [`SECURITY.md`](SECURITY.md).

This is a pnpm workspace. To build and check it locally:

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Publishing

See [docs/publishing.md](docs/publishing.md) for the npm release workflow, including one-time setup, per-release steps, and the migration path to npm Trusted Publishing.

## License

- Core packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`) and most adapters: **Apache-2.0** — see `LICENSE` and `NOTICE`.
- WordPress adapter (when distributed): **GPL-2.0-or-later** (required by WordPress derivative-work licensing; combinable with Apache-2.0 core via the `or-later` clause).
- Profile content (`takuhon.json`) license is chosen by the instance owner at scaffolding time (`meta.contentLicense`, no default).
