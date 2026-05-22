# Takuhon

**Takuhon: your identity, made portable.**

Open-source portable profile API server with a mobile-first profile page.

> **Status**: Phase 1 (Core MVP) — under active development. APIs and data shapes may change.

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

| Package         | Purpose                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@takuhon/core` | JSON Schema (`takuhon.schema.json`), validation, normalization, locale resolution, JSON-LD generation, storage/asset interfaces, migration registry |
| `@takuhon/api`  | Hono-based HTTP handlers, RFC 7807 error envelope, response builders                                                                                |
| `@takuhon/ui`   | React mobile-first profile UI + minimal admin editor                                                                                                |
| `@takuhon/cli`  | `create-takuhon` scaffolding + dev/validate/sync/export/migrate/restore commands                                                                    |

Platform adapters (Cloudflare, Vercel, WordPress, Static) live under `adapters/` and are layered on top of these packages.

## Publishing

See [docs/publishing.md](docs/publishing.md) for the npm release workflow, including one-time setup, per-release steps, and the migration path to npm Trusted Publishing.

## License

- Core packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`) and most adapters: **Apache-2.0** — see `LICENSE` and `NOTICE`.
- WordPress adapter (when distributed): **GPL-2.0-or-later** (required by WordPress derivative-work licensing; combinable with Apache-2.0 core via the `or-later` clause).
- Profile content (`takuhon.json`) license is chosen by the instance owner at scaffolding time (`meta.contentLicense`, no default).
