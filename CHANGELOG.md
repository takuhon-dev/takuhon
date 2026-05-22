# Changelog

All notable changes to the `@takuhon/*` packages and the bare-name `takuhon` redirect package in this repository are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a monorepo. All four publishable scoped packages and the bare-name `takuhon` redirect are released in lockstep at the same version. Per-package change descriptions live under the version heading below.

## [Unreleased]

### Added

- _(future entries land here under one of the standard Keep-a-Changelog sections — Added / Changed / Deprecated / Removed / Fixed / Security)_

## [0.1.0] - YYYY-MM-DD

First public release on the npm registry.

### Added — `@takuhon/core`

- Canonical `takuhon.schema.json` (draft 2020-12) defining the portable profile contract: `profile`, `links`, `careers`, `projects`, `skills`, `contact`, `settings`, `meta`.
- `validate(data)` — Ajv-backed validator returning a discriminated `Result` with RFC 6901 JSON Pointer error paths.
- `normalize(profile)` — order/stable sort + blank entry trimming.
- `resolveLocale(profile, locale?)` — BCP-47 fallback chain with `resolvedLocale` reporting.
- `generateJsonLd(localized)` / `generateProfilePageJsonLd` / `generatePersonJsonLd` — Schema.org JSON-LD emission.
- `TakuhonStorage` / `TakuhonAssetStorage` interfaces + `StorageError` / `NotFoundError` / `ConflictError` exception family.
- Migration registry scaffolding (`migrate.ts`, `migrations/`).

### Added — `@takuhon/api`

- `createPublicApp({ storage, fallback })` — Hono-based public routes: `/takuhon.json`, `/.well-known/takuhon.json`, `/api/profile`, `/api/schema`, `/api/jsonld`.
- `createAdminApiApp({ storage, getAdminToken, getAdminOrigins, cachePurger, auditLogger })` — admin `PUT`/`DELETE /api/admin/profile` with optimistic locking (`If-Match`) and origin allowlist.
- `createAdminUiApp()` — minimal HTML admin editor (token + JSON textarea + Save/Delete).
- `CachePurger` and `AuditLogger` DI interfaces + `noopCachePurger` / `noopAuditLogger` no-ops.
- `buildProblem` / `problemResponse` helpers and `ProblemDetails` / `ErrorSlug` types for RFC 7807 error envelopes.

### Added — `@takuhon/ui`

- Mobile-first React component library: `TakuhonProfile`, `TakuhonHead`, `ProfileHeader`, `CareerTimeline`, `ProjectsList`, `SkillsList`, `LinksList`, `LocaleSwitcher`, `ContactInfo`, `Footer`.
- Design-token stylesheet (`tokens.css`) with `--takuhon-color-*`, `--takuhon-space-*`, `--takuhon-tap-target` custom properties and `prefers-color-scheme: dark` / `prefers-reduced-motion: reduce` media queries.
- Accessibility tests via axe-core.

### Added — `@takuhon/cli`

- `create-takuhon <target-dir>` — interactive scaffolding (license picker per planning doc) that emits 8 files (`takuhon.json`, `wrangler.toml`, `package.json`, `README.md`, `.gitignore`, `.env.example`, `tsconfig.json`, `src/index.ts`).
- `--license <spdxId>` flag for non-interactive use (CI / automation).
- `takuhon` CLI binary stub (subcommands land in a later release).

### Added — `takuhon` (bare-name redirect, C+ pattern)

- Thin redirect package that runs `@takuhon/cli`. Allows `npm i -g takuhon` and `npx takuhon`.

### Added — `@takuhon/cloudflare` _(workspace-private; not published in this release)_

- Workers KV adapter exposing `createTakuhonWorker({ fallback })` factory.
- Console audit logger and Cloudflare cache purger DI implementations.

### Added — `@takuhon/static` _(workspace-private; not published in this release)_

- Node.js `fs`-backed `TakuhonStorage` implementation.

### Security

- Apache-2.0 LICENSE (verbatim canonical text) and NOTICE files in every published package.
- Pre-publish tarball sanity check in CI: rejects stale brand identifiers (`meport`, `ownport-dev`, `ownport`) and host-machine absolute paths (`/Users/`, non-runner `/home/`) before any package ships.
- Secret + internal-info leak-scan workflow (`security-scan.yml`): gitleaks across full git history + planning-repo path guard + 2-tier host-path guard + caronima-internal terms guard. Runs on every PR, main push, and weekly.

[Unreleased]: https://github.com/takuhon-dev/takuhon/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/takuhon-dev/takuhon/releases/tag/v0.1.0
