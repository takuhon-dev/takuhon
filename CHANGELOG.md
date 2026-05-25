# Changelog

All notable changes to the `@takuhon/*` packages, the bare-name `takuhon` redirect package, and the PyPI `takuhon` placeholder published from this repository are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a monorepo. All five publishable scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`) and the bare-name `takuhon` redirect are released in lockstep at the same version. The PyPI placeholder follows an independent version trail and is documented in its own section below. Per-package change descriptions live under the version heading below.

## [Unreleased]

### Added

- _(future entries land here under one of the standard Keep-a-Changelog sections — Added / Changed / Deprecated / Removed / Fixed / Security)_

## [0.1.1] - 2026-05-25

Patch release. `@takuhon/api` and `@takuhon/cloudflare` ship a correctness fix for HTTP-layer locale resolution; the other four packages bump in lockstep with no functional changes.

### Fixed — `@takuhon/api`

- `/api/profile` and `/api/jsonld` now honor the `takuhon_locale` cookie and the `Accept-Language` header (with q-value ordering) in addition to the existing `?lang=` query — the documented query > cookie > Accept-Language priority chain. Previously only the query parameter was read, so a browser sending `Accept-Language: ja` to a Worker with `defaultLocale: en` still received English content.
- Candidate validation: tags must be syntactically valid BCP-47, are filtered against the document's `availableLocales` (case-insensitive on the full tag or its primary subtag, so `en-US` matches an `en`-only document and `en` matches an `en-US`-only document), and bounded against pathological client input (`Accept-Language` ≤ 2048 bytes / ≤ 16 entries, cookie value ≤ 64 chars). When a candidate matches an available locale only via its primary subtag, the matched available token is substituted before forwarding so primary-subtag matches resolve to the correct stored content.

### Changed — `@takuhon/api`

- `/api/profile` and `/api/jsonld` cache directives change from `Cache-Control: public, max-age=300, s-maxage=300` to `Cache-Control: private, max-age=300`. The endpoints now vary by request locale, and shared caches (including the Cloudflare edge cache) do not key on `Accept-Language` or `Cookie` by default; `private` keeps responses correct per-user while still allowing browser-level caching. Deployments that want shared-cache reuse can opt in by configuring a Cache Key Rule on `Accept-Language` and `takuhon_locale` and switching the directive back to `public` at the platform layer.
- `/api/profile` and `/api/jsonld` now emit `Vary: Accept-Language, Cookie` to keep any HTTP-compliant intermediate cache correct.

### Known limitations

- URL-path-based locale selection (e.g. `/ja/api/profile`) and Accept-Language candidates beyond the top two q-ranked entries are not honored in this release. Both are tracked for a future minor release that revisits routing and the `@takuhon/core` `resolveLocale` signature.

### Lockstep version bump (no functional changes)

- `@takuhon/core`, `@takuhon/ui`, `@takuhon/cli`, and the bare-name `takuhon` redirect are bumped to `0.1.1` to keep the lockstep release policy consistent.

## [0.1.0] - 2026-05-24

First public release on the npm registry. Six packages published on the same day: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, the bare-name `takuhon` redirect, and the Cloudflare Workers adapter `@takuhon/cloudflare`. The Cloudflare adapter was promoted from a workspace-private package to a published one mid-day so that projects scaffolded by `create-takuhon` can resolve all of their declared dependencies from the registry.

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

### Added — `@takuhon/cloudflare`

- Workers KV adapter exposing `createTakuhonWorker({ fallback })` factory.
- Console audit logger and Cloudflare cache purger DI implementations.
- Bundled `personal-profile` fixture inlined into the published artifact so the default export works without the repository's `examples/` directory at install time.
- `dist/index.d.ts` ships with a `/// <reference types="@cloudflare/workers-types" />` directive (via a `tsup.config.ts` `dts.banner`), so TypeScript consumers that import the exported `Env` interface resolve the `KVNamespace` ambient type without extra setup.

### Added — `@takuhon/static` _(workspace-private; not published in this release)_

- Node.js `fs`-backed `TakuhonStorage` implementation.

### Security

- Apache-2.0 LICENSE (verbatim canonical text) and NOTICE files in every published package.
- Pre-publish tarball sanity check in CI: rejects stale brand identifiers (`meport`, `ownport-dev`, `ownport`) and host-machine absolute paths (`/Users/`, non-runner `/home/`) before any package ships.
- Secret + internal-info leak-scan workflow (`security-scan.yml`): gitleaks across full git history + planning-repo path guard + 2-tier host-path guard + caronima-internal terms guard. Runs on every PR, main push, and weekly.
- The gitleaks job invokes the OSS `gitleaks` CLI binary directly (version 8.30.1, pinned with SHA256 verification) instead of the `gitleaks/gitleaks-action` wrapper. The wrapper requires a paid `GITLEAKS_LICENSE` for organization-owned repositories; the CLI is permissively licensed (MIT) and free to use.
- The scaffolded README produced by `create-takuhon` is English-only. Brand etymology (`Takuhon (拓本)`) is intentionally limited to this repository's own README and documentation — downstream user-owned projects receive a fully English README so the tool does not impose Japanese vocabulary on consumers' repositories.

### Known publishing constraints

- Sigstore provenance is **not attested** for the 0.1.0 release. The 0.1.0 release was published manually by the operator (rather than through GitHub Actions) to claim the npm namespace; the `publishConfig.provenance: true` flag was temporarily removed because OIDC tokens cannot be obtained from a local shell. Provenance attestation will be reinstated when the CI-based publishing workflow lands in a later release.

## [Unreleased — PyPI `takuhon` (Python)]

The Python distribution maintains an independent version trail. Future entries land here under standard Keep-a-Changelog sections.

## [0.0.1 — PyPI `takuhon`] - 2026-05-24

Initial publication on the PyPI index. This release reserves the `takuhon` name for a future Python SDK; it ships no functional API.

### Added

- `takuhon` package on PyPI containing a `__version__` constant and a README that points readers at the JavaScript / TypeScript packages on npm.
- `pyproject.toml` with `requires-python = ">=3.9"`, Apache-2.0 license metadata, and project URLs back to `https://takuhon.org`, the GitHub repository, and the issue tracker.
- Package classifiers including `Development Status :: 1 - Planning` so it is clear that this is a namespace reservation and not a usable SDK.

[Unreleased]: https://github.com/takuhon-dev/takuhon/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/takuhon-dev/takuhon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/takuhon-dev/takuhon/releases/tag/v0.1.0
