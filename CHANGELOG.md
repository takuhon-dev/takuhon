# Changelog

All notable changes to the `@takuhon/*` packages, the bare-name `takuhon` redirect package, and the PyPI `takuhon` placeholder published from this repository are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a monorepo. All five publishable scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`) and the bare-name `takuhon` redirect are released in lockstep at the same version. The PyPI placeholder follows an independent version trail and is documented in its own section below. Per-package change descriptions live under the version heading below.

## [Unreleased]

### Added

- _(future entries land here under one of the standard Keep-a-Changelog sections — Added / Changed / Deprecated / Removed / Fixed / Security)_

## [0.3.0] - 2026-05-27

Minor release. `@takuhon/ui` gains five new section components that complete the Tier 2 set deferred at 0.2.0 — `Memberships`, `Volunteering`, `Publications`, `Courses`, and `Patents` — and the canonical `TakuhonProfile` composition grows from 11 to 16 sections to render them. No schema, JSON-LD, or storage behaviour changes; this is a UI-surface release. All 0.2.0 profiles continue to validate against 0.3.0 unchanged.

### Added — `@takuhon/ui`

- Five new mobile-first section components matching the remaining 0.2.0 schema arrays:
  - `Memberships` — timeline layout (`<ol>`) with a "Present" label for ongoing affiliations (`isCurrent === true` or `endDate === null`).
  - `Volunteering` — timeline layout with an inline cause chip when `cause` is set; the chip carries a screen-reader-only `Cause:` prefix so assistive technology announces the relationship.
  - `Publications` — card layout; renders `coAuthors` as a leading `with …` line, `<time dateTime>` for the publication date, and `doi` as an `https://doi.org/<bare>` link. Defensively strips an accidental `https://doi.org/` or `https://dx.doi.org/` prefix so a URL-shaped input never produces a double-prefixed link.
  - `Courses` — card layout; the title becomes a `certificateUrl` link when provided, otherwise plain text. `completionDate` is optional and trails undefined-date entries via empty-string fallback sort.
  - `Patents` — card layout with a status badge (`<span data-status>` with CSS variants for `pending` / `issued` / `expired` / `abandoned`). The badge carries a screen-reader-only `Status:` prefix. Sorts by `grantDate ?? filingDate` DESC so the newest issuance ranks first.
- All five components accept a single `LocalizedXxx[]` prop, return `null` on empty input, and reuse the established `.section` / `.heading` / `.list` / `.item` CSS-module conventions plus tokens from `tokens.css` — no new design tokens were introduced.

### Changed — `@takuhon/ui`

- `TakuhonProfile` now composes 16 sections in semantic-kinship order: ProfileHeader → LinksList → Education → **Courses** → Career → **Memberships** → Certifications → **Patents** → Projects → **Publications** → Honors → **Volunteering** → Skills → Languages → Contact → Footer. Tier 2 sections sit next to their conceptual neighbour (Courses near Education, Memberships near Career, Patents between credentials and creative output, Publications near Projects, Volunteering near Honors).

### Changed — examples

- `examples/personal-profile/takuhon.json` populates the five Tier 2 arrays with persona-consistent fictional entries — one Membership (IAAP Senior Member), one Volunteering role (Code.org volunteer instructor), one Publication (ACM SIGACCESS paper with `doi` and two `coAuthors`), one Course (Coursera with `certificateUrl`), and two Patents (one `issued`, one `pending`) so consumers can see every new component render against the canonical fixture. The same fixture drives the workspace a11y audit; the new sections are now covered automatically.
- Pat Rivera's GitHub link target, IAAP organization URL, Code.org volunteer URL, and the two patent identifiers are normalized to `example.com` / `example.org` / fictional USPTO numbers respectively, so the public example never collides with a real account, real organization URL, or real patent record. The bio displayName, persona description, Mastodon link, and the structured Tier 1 fixture content are unchanged.

### Release engineering

This release migrates the publish pipeline from classic `NPM_TOKEN` authentication to **npm OIDC trusted publishing**, emits **SLSA provenance v1 attestation** for every package, and adds a **GitHub Release auto-create** step with **cosign sign-blob bundles** attached.

- `publishConfig.provenance: true` is now set on all six publishable packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, bare-name `takuhon`).
- `.github/workflows/publish.yml` is rewritten into four jobs:
  - `verify` re-runs the full CI suite (`typecheck` / `lint` / `format:check` / `test` / `build`) on the tagged tree.
  - `publish-scoped` (matrix of the five `@takuhon/*` scoped packages) publishes each via OIDC trusted publishing with provenance attestation. `fail-fast: true` so the workspace dep graph (core ← api ← cloudflare, core ← ui, core ← cli ← bare-name) cannot produce a partial release with dangling cross-package deps.
  - `publish-bare` publishes the bare-name `takuhon` redirect, gated by `needs: publish-scoped` so consumers running `npm i -g takuhon` always find `@takuhon/cli@<same-version>` already on the registry.
  - `github-release` creates the corresponding GitHub Release with six tarballs, six cosign sign-blob bundles (Sigstore keyless via Fulcio + Rekor), and auto-generated release notes.
- Real-publish is double-gated on `event_name == push` AND `inputs.dry_run != 'true'`. `workflow_dispatch` always takes the dry-run path; only an actual `vX.Y.Z` tag push produces a real publish.
- New SHA-pinned third-party actions added in this release: `sigstore/cosign-installer@v3` (`f713795c...`) and `softprops/action-gh-release@v2` (`3bb12739...`).
- `docs/publishing.md` is fully rewritten for the new flow with a self-contained troubleshooting table.
- A small amount of prettier formatting drift that accumulated since 0.2.0 (the 0.2.0 verification sequence omitted `pnpm format:check`) is cleaned up.
- The classic `NPM_TOKEN` GitHub Actions secret is no longer referenced by the workflow and is scheduled for removal once the first end-to-end OIDC publish succeeds.

### Repository / project hardening (Phase E)

The `takuhon-dev/takuhon` repository is made **public** in time for this release (npm provenance attestation requires a public source repository). Additional public-OSS hygiene applied at the same time:

- GitHub **Private Vulnerability Reporting (PVR)** is enabled. `SECURITY.md` already pointed at this channel via `hello@takuhon.org` plus the GitHub Security Advisory URL.
- GitHub **secret scanning**, **secret scanning push protection**, and **Dependabot security updates** are enabled.
- Repository topics are cleaned of the pre-rebrand `ownport` keyword; `takuhon` is added.
- Stale `ownport-dev/ownport`-era Dependabot PRs (#18, #19) are closed so Dependabot can regenerate them with the correct repository context on the next cycle.

### Known limitations carried forward

- Phase 2 i18n is unresolved: `Patents` status labels, the `with` author/inventor prefix in `Publications` and `Patents`, the `Present` ongoing-date label across `Memberships` / `Volunteering` / `Education`, and the `Filed` / `Granted` patent-date labels are hard-coded English (matching the established `PROFICIENCY_LABEL` pattern in `Languages`). When Phase 2 i18n lands these will be extracted in one pass.
- URL-path-based locale selection (e.g. `/ja/api/profile`) remains unimplemented (carried over from 0.1.1 → 0.2.0).
- Schema.org `Patent` type is still pending; `patents[*]` continues to map to `CreativeWork` + `additionalType="https://schema.org/Patent"` (carried over from 0.2.0).
- The `jsonld.test.ts` omission tests in `@takuhon/core` remain fixture-coupled — when the canonical example fixture gains entries in future minor releases, the "no past careers and no projects" assertion list needs the matching array reset. A small dedicated minimal fixture for those tests is a candidate refactor for a later patch.

### Lockstep version bump (no functional changes beyond the above)

- All six publishable artifacts bump from `0.2.0` to `0.3.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. Only `@takuhon/ui` and the bundled example fixture changed functionally; the other five packages bump for lockstep alignment.

## [0.2.0] - 2026-05-26

Minor release. The takuhon schema gains nine LinkedIn-aligned top-level array fields and a privacy-by-default opt-out block. All additions are backward-compatible: an unmodified 0.1.x profile validates against the 0.2.0 schema, and the bundled `v0.1.0-to-v0.2.0` migration leaves every pre-existing field untouched.

### Added — `@takuhon/core`

- Nine new top-level array fields on `Takuhon`: `certifications` / `memberships` / `volunteering` / `honors` / `education` / `publications` / `languages` / `courses` / `patents`. Each is optional in the JSON Schema for back-compat and is initialized to `[]` by `validate()` and by `normalize()` so the TypeScript types can keep them as required without lying about runtime shape.
- New `meta.privacy` opt-out block with `hideCredentialIds` and `hideEducationGrades` boolean flags. Both default to `true` (privacy-by-default); operators must explicitly set them to `false` to expose `certifications[*].credentialId` and `education[*].grade` on public API responses. `patents[*].patentNumber` is treated as a public record (typical patent office publication) and is not gated.
- New TypeScript exports: `Certification` / `Membership` / `Volunteering` / `Honor` / `Education` / `Publication` / `Language` / `LanguageProficiency` / `Course` / `Patent` / `PatentStatus` / `MetaPrivacy` plus matching `Localized*` variants for every entity that has localized fields.
- New migration entry `v0.1.0-to-v0.2.0` in the migrations registry. The migrate function uses conditional spread (`partial.certifications ?? []`) so a pre-existing value at any of the nine new keys passes through losslessly even though the 0.1.x root schema closes additional properties.
- Schema.org JSON-LD output for every new field: `hasCredential` (`EducationalOccupationalCredential`), `memberOf` (Role wrapper around `Organization`), `subjectOf` `Role` for volunteering, `award` string list for honors, `alumniOf` (Role wrapper around `EducationalOrganization`), `subjectOf` `ScholarlyArticle` for publications, `knowsLanguage` BCP-47 string list, `subjectOf` `Course` + `CourseInstance` for courses (Schema.org `Course` has no direct date property), and `subjectOf` `CreativeWork` with `additionalType` pointing at the pending Schema.org `Patent` URL.
- Post-Ajv uniqueness check on `languages[].language` — duplicate BCP-47 tags (case-insensitive) are reported as a `uniqueItems` validation error rather than a runtime warning (Spec §6.16).

### Added — `@takuhon/api`

- New `applyPublicPrivacyFilter` helper in `privacy-filter.ts`. Public read endpoints (`/api/profile`, `/api/jsonld`, `/takuhon.json`) route their responses through the filter; admin endpoints (`/api/admin/*`) bypass it and continue to serve the full document to authenticated callers.

### Added — `@takuhon/ui`

- Four new mobile-first section components: `EducationTimeline`, `Certifications`, `HonorsList`, `Languages`. Each accepts a single locale-resolved array prop and renders nothing when empty so consumers can drop them into a profile layout unconditionally. `TakuhonProfile` composes them into the canonical render order: ProfileHeader → LinksList → Education → Career → Certifications → Projects → Honors → Skills → Languages → Contact → Footer. The remaining five 0.2.0 fields (`memberships` / `volunteering` / `publications` / `courses` / `patents`) ship with schema and JSON-LD support but no default UI in this release — `@takuhon/core`'s `LocalizedTakuhon` exposes them so consumers who need them can render custom sections.

### Fixed — `@takuhon/api`

- Public read endpoints (`/api/profile`, `/api/jsonld`, `/takuhon.json`) now strip `contact.email` from responses unless `contact.showEmail === true`. Spec §6.10 has required this since 0.1.x but the 0.1.x runtime never applied the filter; the 0.2.0 privacy helper closes the drift while adding the new credentialId / grade strip paths.

### Changed — `@takuhon/cli`

- `create-takuhon` scaffolding now emits a 0.2.0-shaped `takuhon.json` with the nine new arrays initialized to `[]`. `meta.privacy` is omitted from the scaffold — default-true semantics apply automatically, and operators who want disclosure add the flag explicitly.

### Migrated

- The three richer bundled fixtures under `examples/` (`personal-profile`, `creator-profile`, `freelancer-profile`) have their `schemaVersion` bumped to `0.2.0` and now declare the nine new arrays as empty literals. `personal-profile` additionally adds `meta.privacy` to demonstrate the new opt-out block.
- `examples/minimal-profile/takuhon.json` has only its `schemaVersion` bumped; it deliberately omits the nine new arrays (and `meta.privacy`) to preserve the fixture's role as the smallest schema-valid 0.2.0 profile. `validate()` and `normalize()` coerce the missing keys to `[]` so this minimal shape works end-to-end on the same code paths as the richer fixtures.

### Lockstep version bump (no functional changes beyond the above)

- All six publishable artifacts bump from `0.1.1` to `0.2.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect.

### Known limitations carried forward

- `@takuhon/ui` Tier 2 components (`memberships`, `volunteering`, `publications`, `courses`, `patents`) are intentionally deferred to a later release.
- Schema.org `Patent` type is still pending in the vocabulary; `patents[*]` ships with a best-effort `CreativeWork` + `additionalType` mapping that will be revisited when Schema.org stabilizes the type.
- URL-path-based locale selection (e.g. `/ja/api/profile`) remains unimplemented (carried over from 0.1.1).

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

[Unreleased]: https://github.com/takuhon-dev/takuhon/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/takuhon-dev/takuhon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/takuhon-dev/takuhon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/takuhon-dev/takuhon/releases/tag/v0.1.0
