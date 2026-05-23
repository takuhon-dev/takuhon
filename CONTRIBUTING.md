# Contributing to Takuhon

Thanks for your interest in contributing to Takuhon! This document describes the development workflow and expectations.

> **Status**: Takuhon is in early development (Phase 1, pre-v1.0). APIs and data shapes may change. We welcome bug reports, feature discussions, and small focused PRs.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Prerequisites:

- Node.js 22 or later (we test on 22 and 24; see [`.nvmrc`](.nvmrc) for the default)
- pnpm 10.x (see [`package.json`](package.json) `packageManager` field)
- A POSIX-like shell (macOS / Linux / WSL recommended)

Setup:

```bash
git clone https://github.com/takuhon-dev/takuhon.git
cd takuhon
pnpm install
```

Run the full local check pipeline (same as CI):

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Or run them individually as you iterate. `pnpm format` auto-fixes formatting; `pnpm lint:fix` auto-fixes lint issues.

## Repository layout

```text
packages/
  core/      # @takuhon/core — schema, validation, normalization, JSON-LD, storage interface
  api/       # @takuhon/api  — Hono-based HTTP handlers
  ui/        # @takuhon/ui   — React mobile-first profile UI + admin editor
  cli/       # @takuhon/cli  — create-takuhon scaffolding + dev/validate/sync commands

adapters/    # Platform adapters (Phase 3+): cloudflare / vercel / wordpress / static
apps/        # Reference apps: playground / wordpress-plugin
```

## Branching and PRs

- Default branch is `main`. Open PRs against `main`.
- Use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`).
- Keep PRs focused (one topic per PR). Large refactors should be split when possible.
- All CI checks (lint, typecheck, format, test, build, license-check) must pass before merge.

## Testing

We use [Vitest](https://vitest.dev/) for unit tests. Place tests next to the source they cover, under `__tests__/` directories:

```text
packages/core/src/validate.ts
packages/core/src/__tests__/validate.test.ts
```

For test design:

- Use the JSON Schema in `@takuhon/core` as the source of truth for validation tests
- Avoid mocking what you can test against real fixtures (`examples/` profiles)
- For workspace-crossing tests, prefer `@takuhon/core` workspace imports over deep relative paths

## Coding style

Coding conventions are defined in `eslint.config.js`, `.prettierrc`, and `tsconfig.base.json`. Lint, format, and typecheck are enforced in CI. Highlights:

- TypeScript strict mode + `noUncheckedIndexedAccess`
- ESM only (no CommonJS in source)
- Named exports (no `export default` except for framework-required files)
- All comments and JSDoc must be in English
- Avoid hard-coded absolute paths and AI-assistant / internal tool names in committed sources

## Language

All contributions to this repository must be in English. This applies to:

- Source code identifiers, comments, and JSDoc
- Commit messages (subject and body)
- Pull request titles and descriptions
- GitHub Issues, Discussions, and Release notes
- Repository documentation under `docs/` and root markdown files

Intentional exceptions:

- **Brand etymology**: `Takuhon (拓本)` may appear in this repository's own `README.md` and `docs/` as part of the brand narrative.
- **Multilingual test data and examples**: Files under `examples/` and `**/*.test.{ts,tsx}` may contain Japanese (and other non-English) strings to demonstrate Takuhon's multi-locale support. Public examples must always include English values alongside any non-English values.
- **Bot-generated upstream quotes**: Automated PRs (e.g. Dependabot) that quote upstream changelogs may contain non-English text from those upstream sources.

If you have internal notes you'd like to keep in another language, please keep them outside this repository.

## License of contributions

By submitting a contribution, you agree that:

- Your contribution to `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, and most adapters will be licensed under the **Apache License 2.0** (matching the receiving package). By submitting, you agree to Apache 2.0's terms, including the explicit patent grant and the no-retaliation clause for patent litigation.
- Your contribution to the WordPress adapter (when distributed via wp.org or as a derivative) will be licensed under **GPL-2.0-or-later** (required by WordPress derivative-work licensing; combinable with the Apache-2.0 core packages via the `or-later` clause).

If you are unsure which license applies to the file you are modifying, check the `license` field in the nearest `package.json`.

## Reporting issues

- **Bugs**: use the bug report template at https://github.com/takuhon-dev/takuhon/issues/new
- **Features / discussions**: open an issue or start a GitHub Discussion
- **Security vulnerabilities**: report via GitHub Private Vulnerability Reporting at https://github.com/takuhon-dev/takuhon/security/advisories/new, or email **hello@takuhon.org** if PVR is unavailable to you. See [SECURITY.md](SECURITY.md) for the full policy. Please do not open public issues for security reports.

## Release process

Releases are not yet automated. Once the public release process is established, it will be documented here.

---

Thanks again for contributing. If anything in this document is unclear, please open an issue and we'll improve it.
