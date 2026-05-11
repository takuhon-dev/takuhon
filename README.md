# meport

Open-source portable profile API server with a mobile-first profile page.

> **Status**: Phase 1 (Core MVP) — under active development. APIs and data shapes may change.

## What is meport?

meport lets you own your profile — bio, SNS links, career history, projects, skills — as a portable JSON document, and publish it as a mobile-first profile page plus a public API (including JSON-LD for AI agents and search engines).

The canonical data lives in `meport.json`. Storage backends (Cloudflare KV, static file, etc.) are pluggable via adapters.

## Quick start (Phase 1)

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

This bootstraps the monorepo and runs all checks against the empty package skeletons.

## Packages

| Package        | Purpose                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@meport/core` | JSON Schema (`meport.schema.json`), validation, normalization, locale resolution, JSON-LD generation, storage/asset interfaces, migration registry |
| `@meport/api`  | Hono-based HTTP handlers, RFC 7807 error envelope, response builders                                                                               |
| `@meport/ui`   | React mobile-first profile UI + minimal admin editor                                                                                               |
| `@meport/cli`  | `create-meport` scaffolding + dev/validate/sync/export/migrate/restore commands                                                                    |

Platform adapters (Cloudflare, Vercel, WordPress, Static) live under `adapters/` and are layered on top of these packages.

## License

- Core packages (`@meport/core`, `@meport/api`, `@meport/ui`, `@meport/cli`) and most adapters: **MIT** — see `LICENSE`.
- WordPress adapter (when distributed): **GPL-2.0-or-later** (required by WordPress derivative-work licensing).
- Profile content (`meport.json`) license is chosen by the instance owner at scaffolding time (`meta.contentLicense`, no default).
