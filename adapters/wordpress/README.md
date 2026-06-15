# @takuhon/wordpress

WordPress adapter for [takuhon](https://github.com/takuhon-dev/takuhon) — the
third platform adapter, alongside [`@takuhon/cloudflare`](../cloudflare) and
[`@takuhon/vercel`](../vercel).

> **Status: work in progress (Phase 1).** The plugin now has the full
> derive-at-edit-time loop: an admin screen edits/imports the profile, derives
> the public bundle in the browser with `@takuhon/core` / `@takuhon/api`, and
> publishes it; the public read API (profile / JSON-LD / schema / `takuhon.json`
> / `.well-known/takuhon.json`) serves it. The Gutenberg block that renders the
> stored HTML is the remaining Phase 1 piece (see the staged rollout below).

## What this is

A WordPress plugin that lets an existing WordPress site host a takuhon profile.
WordPress is **not** the canonical store — `takuhon.json` stays canonical, and
WordPress is just where the owner edits it and where the public profile is
served (`option` storage + a Gutenberg block + a REST API).

## Why it is not a thin adapter

The Cloudflare and Vercel adapters mount `@takuhon/api`'s `createPublicApp` (a
framework-independent Hono app) directly, because both run JavaScript. WordPress
runs **PHP**, which cannot import that TypeScript app, and typical WordPress
hosts have no Node.js runtime at request time. So this adapter cannot reuse the
"mount the Hono app" pattern.

Instead it follows a **derive-at-edit-time** model, so takuhon's logic is never
reimplemented in PHP:

1. The admin screen runs in the browser (React). It bundles `@takuhon/core`
   (validate / normalize / `applyPublicPrivacyFilter` / JSON-LD) and the
   `@takuhon/api` HTML renderer (`generateSite`) — both depend only on
   `@takuhon/core` and run in a browser bundle.
2. On save, the admin computes the **derived public artifacts** — a
   privacy-filtered public profile JSON, the JSON-LD, and a server-rendered HTML
   page per locale — and persists them through an authenticated REST endpoint.
3. PHP only **stores and serves** those artifacts (and selects a locale per
   request). It holds no validation, privacy, or rendering logic, so the single
   source of truth stays in `@takuhon/core` / `@takuhon/api`.

Because only the already-filtered public artifacts are ever served, the field-
and section-level privacy controls (`meta.privacy`, `settings.publicVisibility`)
are honoured with parity to the other adapters, and the private master profile
never reaches a public endpoint.

## Scope (Phase 1)

- Gutenberg block `takuhon/profile` — serves the stored server-rendered HTML
  (local mode) or renders a remote takuhon API by URL (remote mode).
- A minimal admin screen — import/paste a `takuhon.json`, validate it with
  `@takuhon/core`, and save the master plus derived artifacts.
- Public REST API: `profile`, `jsonld`, `schema`, `takuhon.json`,
  `.well-known/takuhon.json`.

Out of scope (Cloudflare-only or a later phase): image upload / `/assets/*`,
the MCP endpoint, activity badges, and the rich repeater-based form editor
(Phase 2).

## Distribution

This package is **not published to npm** — a WordPress plugin is installed as a
zip, not consumed as a module. The plugin zip is built from the `takuhon/`
directory and attached to GitHub Releases. Submission to the WordPress.org
plugin directory is a later phase.

## Development

The admin React app lives in `src/`; the PHP plugin lives in `takuhon/`. The
takuhon logic comes entirely from `@takuhon/core` / `@takuhon/api`, which have
their own test suites.

- **Build the admin bundle** — Vite bundles `src/admin` into a single
  self-contained `takuhon/build/admin.js` (React, `@takuhon/core`, and the
  `@takuhon/api` HTML renderer are all included; nothing is provided by
  WordPress at runtime). This output ships inside the plugin zip.

  ```sh
  pnpm --filter @takuhon/wordpress build
  ```

- **Derivation logic (vitest)** — `src/admin/derive.ts` is the heart of the
  derive-at-edit-time model and is covered by `pnpm test`.

- **Store / REST logic (PHP)** — a fast standalone harness stubs the handful of
  WordPress functions used and exercises the store, the public read callbacks,
  and the admin publish/read callbacks (including the privacy invariant that the
  private master profile never reaches a public response):

  ```sh
  pnpm --filter @takuhon/wordpress test:php   # or: php tests/run.php
  ```

  This requires a local PHP CLI and is **not** wired into CI; integration
  testing is wp-env based and added in a later phase.

- **WordPress integration smoke (manual, wp-env)** — open the Takuhon admin
  page, paste/import a `takuhon.json`, and publish. Then
  `GET /wp-json/takuhon/v1/{profile,jsonld,schema}` and (with pretty permalinks)
  `GET /takuhon.json` and `GET /.well-known/takuhon.json` return the derived
  public artifacts; the private master is never served.

## License

`GPL-2.0-or-later` (see [LICENSE](./LICENSE)). WordPress plugins are treated as
derivative works of WordPress (GPL-2.0+), so this adapter is GPL on every
distribution channel — unlike the other `@takuhon/*` packages, which are
Apache-2.0. This adapter may still call the Apache-2.0 `@takuhon/core` /
`@takuhon/api`: Apache-2.0 is one-way compatible with GPL-3.0+, and the "or
later" clause lets the combination be treated as GPL-3.0+.
