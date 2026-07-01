# Changelog

All notable changes to the `@takuhon/*` packages, the bare-name `takuhon` redirect package, the `create-takuhon` initializer, and the PyPI `takuhon` placeholder published from this repository are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a monorepo. Eleven publishable artifacts release in lockstep at the same version: the nine scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/contact`, `@takuhon/cloudflare`, `@takuhon/vercel`), the bare-name `takuhon` redirect, and the `create-takuhon` initializer. The PyPI placeholder follows an independent version trail and is documented in its own section below. Per-package change descriptions live under the version heading below.

## [Unreleased]

Design-token re-skin seam, **a refreshed default look with built-in dark mode**, **brand-logo links with a featured/other split**, **richer section layouts (an experience timeline and project cards)**, and **skill-category grouping** for the standard renderer — the first upstream steps of the "bio design generalization" track (bring the bio prototype's design into the standard product so bio can shed its bespoke renderer and ride the turnkey path). Non-breaking: a valid 1.1.0 document is a valid 1.3.0 document unchanged.

### Added — `@takuhon/core` (schema 1.1.0 → 1.3.0, non-breaking)

- **`settings.appearance` (opt-in design tokens).** New optional block that lets an owner re-skin the server-rendered profile by overriding the standard renderer's built-in color and font defaults. It is a **declarative token map, never arbitrary CSS**: `fontFamily`, a `colors` map (`bg`, `surface`, `text`, `textMuted`, `border`, `accent`, `primary`, `primaryContrast`), and a `colorsDark` map of the same keys for `prefers-color-scheme: dark`. Every value is length- and pattern-constrained (`CssColor` / a font-family pattern) so it cannot break out of the inline `<style>`. Overriding tokens re-skins the page but cannot re-layout it — spacing, radius, and the type scale are intentionally not exposed. Adding an optional field is a minor bump: a valid 1.1.0 document is a valid 1.2.0 document unchanged, and a `v1.1.0-to-v1.2.0` migration (a pure version stamp) is added. `SCHEMA_VERSION` becomes `1.2.0`, `$id` advances to `/schemas/1.2.0/`, and the validator is regenerated.

- **`settings.skillCategories` (opt-in skill-category grouping).** New optional array that maps a `Skill.category` value to an ordered, **localized** display heading (`{ id, label }`, where `label` is a BCP-47 → string map). When present, the rendered profile groups skills by their `category` under these headings in array order; absent = the flat skill list is unchanged. A skill whose `category` is unlisted (or absent) is never dropped — it renders in a trailing group. Adding an optional field is a minor bump: a valid 1.2.0 document is a valid 1.3.0 document unchanged, and a `v1.2.0-to-v1.3.0` migration (a pure version stamp) is added. `SCHEMA_VERSION` becomes `1.3.0`, `$id` advances to `/schemas/1.3.0/`, and the validator is regenerated. This is the first locale-resolved settings field: `resolveLocale` collapses each `label` to the resolved locale's string (`LocalizedTakuhon.settings` is now a `LocalizedSettings`).

### Added — `@takuhon/api`

- **The standard renderer honors `settings.appearance`.** `renderProfileHtml` now emits a `:root` block of named `--takuhon-*` design tokens (colors + font family) and merges any `settings.appearance` overrides over the built-in defaults, plus the `prefers-color-scheme: dark` block. The static stylesheet was refactored to reference these tokens instead of hard-coded colors, so a single override propagates everywhere. As defense in depth beyond the schema pattern, every color value is re-sanitized at render time against the same allowlist (hex / keyword / known color function); `url()`, `image-set()`, `var()`, and anything carrying a CSS-structural character are dropped in favor of the default, so a value can neither escape the inline `<style>` nor trigger an external request.

### Changed — `@takuhon/api` (design foundation, no schema change)

- **Refreshed default look + built-in dark mode.** The standard renderer's built-in token values now carry a considered light palette and type/spacing scale (the design foundation of the bio-generalization track) and — new — a default `prefers-color-scheme: dark` palette, so every adapter that uses `renderProfileHtml` (Cloudflare, Vercel, static export, WordPress) gains dark mode out of the box. Owner `settings.appearance.colors` / `colorsDark` overrides merge over these light / dark defaults respectively. Internal design-scale tokens (spacing, radius, type scale) are emitted in `:root` for the renderer's own use but are intentionally **not** part of the overridable `settings.appearance` contract. **Markup is unchanged** — this is a CSS/token-value refresh only; richer per-section layouts and brand-icon links follow in later changes. A stylesheet snapshot test guards the shared renderer against unintended visual drift.

- **Links: brand-logo glyphs + featured/other split.** The rendered profile's links are now two ordered pill groups — a prominent **Featured** grid followed by the rest — each carrying an inline brand-logo glyph for recognized link types (`github`, `gitlab`, `linkedin`, `x`, `mastodon`, `bluesky`, `instagram`, `youtube`, `threads`, `facebook`, `rss`, and `blog` via the RSS mark). The split and ordering use only existing schema fields (`Link.featured`, `Link.order`); `website` / `email` / `custom` render without a glyph rather than inventing one, while `blog` reuses the RSS glyph (the conventional feed/blog mark). Glyphs are inlined monochrome SVG drawn with `fill="currentColor"` — never an `<img>` — so the page needs no `img-src` beyond `'self'`, and links gain `rel="me noopener"`. Icon paths are bundled from Simple Icons (CC0) and, for LinkedIn, Bootstrap Icons (MIT); see the `@takuhon/api` NOTICE. (schema unchanged.)

- **Richer section layouts: an experience timeline + project cards.** The standard renderer now lays the **Experience** section out as a dotted left-border timeline (ongoing roles marked with an accent dot, dates hoisted above the role) and the **Projects** section as bordered surface cards (owner-highlighted projects gain an accent border); every other section keeps the flat list. It is implemented as CSS layout _variants_ selected by a class on the entry `<ul>` (`entries--timeline` / `entries--cards`) over the **same shared entry markup** — the date-first timeline ordering is pure CSS, so there is a single escaping path. Both markers derive from existing schema booleans (`Career.isCurrent`, `Project.highlighted`), so there is **no schema change**. Every adapter that uses `renderProfileHtml` (Cloudflare, Vercel, static export, WordPress) gains the richer layouts, and the stylesheet snapshot guards against unintended drift. (schema unchanged.)

- **Skill-category grouping honors `settings.skillCategories`.** When the profile configures skill categories, `renderProfileHtml` groups the Skills section by each skill's `category` under the configured localized headings, in declared order (falling back to the raw category key for a category present on a skill but not configured, and a trailing heading-less group for uncategorized skills — so nothing is dropped). With no categories configured it stays the flat chip list, so existing deployments are byte-for-byte unchanged. (schema change lives in `@takuhon/core` above.)

## [1.1.0] - 2026-07-01

Minor release. Ships the **turnkey contact form**: the `@takuhon/contact` widget is now a configuration-only feature on the standard Cloudflare deployment — enable `settings.contact` (with a public Turnstile site key), wire the `send_email` binding and the Turnstile secret, and the server-rendered profile page embeds the widget while the Worker serves its assets and the `POST /api/contact` endpoint. Non-breaking: a valid 1.0.0 document is a valid 1.1.0 document unchanged.

### Added — `@takuhon/core` (schema 1.0.0 → 1.1.0, non-breaking)

- **`settings.contact` (opt-in contact form).** New optional block that turns the published `@takuhon/contact` widget into a config-only feature instead of a custom-Worker integration. Adding an optional field is a minor bump: a valid 1.0.0 document is a valid 1.1.0 document unchanged, and a `v1.0.0-to-v1.1.0` migration (a pure version stamp) is added. Only public values live in the document — `enabled`, the public `turnstileSiteKey`, an optional `endpoint`, and `subjectPrefix`; the Turnstile secret, recipient, and From label stay as environment configuration. `SCHEMA_VERSION` becomes `1.1.0`, `$id` advances to `/schemas/1.1.0/`, and the validator is regenerated. The schema-driven admin form (`@takuhon/ui`) surfaces it as a "Contact form" group. (First step of the contact turnkey track; the renderer, adapter, and scaffold wiring follow in subsequent changes.)

### Added — `@takuhon/api` & `@takuhon/contact`

- **Server-rendered contact-widget embedding.** When a profile sets `settings.contact.enabled` with a public `turnstileSiteKey`, the SSR profile page (`renderProfileHtml`, served at `GET /`) now embeds the `@takuhon/contact` widget: a `<link>` to `/contact-widget.css` in `<head>` and a deferred `<script src="/contact-widget.js" data-site-key="…">` before `</body>`. The widget's config travels entirely as `data-*` attributes — never an inline bootstrap script — so the page Content-Security-Policy needs no `'unsafe-inline'`. The CSP relaxation that Cloudflare Turnstile requires (its api.js on `script-src`, its challenge iframe on `frame-src`, and its verification XHR on `connect-src`, all `challenges.cloudflare.com`) is scoped to the contact-bearing HTML page only; every other route keeps the strict `'self'`-only policy. Both `enabled` and a present site key are required to mount, and the relaxation follows the same gate.
- **`@takuhon/contact` reads config from its own `<script>` tag.** The widget's auto-mount now resolves its options from `data-*` attributes on the loading script (`data-site-key`, `data-endpoint`, `data-locale`, `data-lang`, `data-page-url`) as a CSP-safe alternative to the `window.TAKUHON_CONTACT` global, which still works for pages that prefer it. (Serving the widget assets and mounting the `POST /api/contact` endpoint follow in a subsequent change.)

### Added — `@takuhon/cloudflare` & `@takuhon/contact`

- **Turnkey contact form on the Cloudflare adapter.** `createTakuhonWorker` now serves the bundled widget assets at `/contact-widget.{js,css}` (inlined into the Worker, no asset binding required — parity with `/mcp` and `/activity.svg`) and mounts `POST /api/contact` when a `send_email` binding is bound **and** `settings.contact.enabled` is true. The handler wires the existing Cloudflare Turnstile + `send_email` seams to four new optional `Env` fields — `TAKUHON_CONTACT_EMAIL` (the `[[send_email]]` binding), `TAKUHON_CONTACT_TO`, `TAKUHON_CONTACT_FROM`, and `TAKUHON_TURNSTILE_SECRET` — and reads the subject prefix from `settings.contact.subjectPrefix`. It stays stateless and never throws: a missing secret degrades to a `422`, a missing recipient/From to a `502`, and submissions are same-origin only. With this, enabling the contact form is configuration (a profile flag + a public site key + the binding/secrets) rather than a custom Worker. (Vercel / WordPress turnkey support follows when needed; the scaffold and docs follow in subsequent changes.)
- **`@takuhon/contact` exposes its built assets as strings (`@takuhon/contact/assets`).** A new export subpath surfaces the built widget JS/CSS as inlined string constants (`contactWidgetJs`, `contactWidgetCss`) so host adapters with no asset-hosting layer can bundle and serve them from a route. Generated at build time from `dist/contact-widget.{js,css}`.

### Added — `@takuhon/cli` & `create-takuhon`

- **Scaffold documents the turnkey contact form.** A freshly scaffolded Cloudflare project now ships the contact wiring as opt-in, commented-out config (mirroring the R2 / activity blocks): `wrangler.toml` gains a commented `[[send_email]]` binding named `TAKUHON_CONTACT_EMAIL` plus recipient/From `[vars]` guidance and the `wrangler secret put TAKUHON_TURNSTILE_SECRET` step; `.env.example` lists `TAKUHON_CONTACT_TO` / `TAKUHON_CONTACT_FROM` / `TAKUHON_TURNSTILE_SECRET`; and the README's new "Contact form (optional)" section gives the `settings.contact` snippet and the four enable steps. A default `wrangler deploy` still works untouched (everything ships commented), and the documented names/conditions/degrade codes match the `@takuhon/cloudflare` adapter exactly. (Scaffolded `takuhon.json` stays the minimal profile; contact is documented, not baked in.)

### Lockstep version bump

- All eleven publishable artifacts bump from `1.0.0` to `1.1.0` — the nine scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/contact`, `@takuhon/cloudflare`, `@takuhon/vercel`), the bare-name `takuhon` redirect, and the `create-takuhon` initializer. The scaffold's pinned `@takuhon/*` caret range (`TAKUHON_DEP_RANGE`) advances to `^1.1.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [1.0.0] - 2026-06-30

First **major** release — the profile schema is frozen as a stable contract.

### Changed — `@takuhon/core` (schema 0.7.0 → 1.0.0, **breaking**)

Freeze the profile schema at **1.0.0** — a stable-contract commitment. From here, any field removal, type change, required promotion, or acceptance-set narrowing is a major bump. Applies the operator-approved v1.0.0 schema-freeze audit. `$id` advances to `/schemas/1.0.0/`, `SCHEMA_VERSION` becomes `1.0.0`, and a `v0.7.0-to-v1.0.0` migration (a pure version stamp) is added. A conforming, closed-safe 0.7.0 document is a valid 1.0.0 document unchanged.

- **`additionalProperties` closed reversal (breaking).** Every content entity (`Profile`, `Career`, `Project`, `Skill`, `Education`, `Certification`, `Membership`, `Volunteering`, `Honor`, `Publication`, `Language`, `Course`, `Patent`, `TestScore`, `Recommendation`, `RecommendationAuthor`, `Avatar`, `Address`, `Contact`) plus `Settings`, `Meta`, and `MetaPrivacy` flips from open (`additionalProperties: true`) to closed (`false`). The pre-1.0 hybrid open-substrate strategy is reversed to a precise contract: an undeclared or misspelled key (`tittle`) is now a validation error instead of silently dropped data, so the JSON-LD and MCP surfaces are fully schema-defined. The locale-keyed maps `LocalizedTitle` / `LocalizedBody` stay open by construction (arbitrary BCP-47 keys via `propertyNames`). Extension space can be re-opened non-breakingly in a future minor via `patternProperties: { "^x-": {} }`.
- **Localized non-whitespace (breaking).** `LocalizedTitle` / `LocalizedBody` values now require at least one non-whitespace character (`\S` pattern), closing the gap where a whitespace-only string passed validation and resolved to an empty string.
- **Per-array `id` uniqueness (breaking).** "`id` is unique within its array" is now a contract invariant, enforced by a post-Ajv walk in `validate()` (the reference fields `relatedCareerId` / `relatedEducationId` assume it). A duplicate id is rejected with a `uniqueItems` error.
- **Top-level `required` narrowed (non-breaking, loosening).** Required is now just the structural essentials (`schemaVersion`, `profile`, `contact`, `settings`, `meta`); every content array — including `links` / `careers` / `projects` / `skills` — is optional (absent = empty, coerced in `validate()` and `normalize()`). A profile with no links or an artist with no formal careers no longer has to carry empty arrays.
- **`order` sort semantics documented.** The canonical ordering ("ascending `order`; missing or equal sorts stable by array position") was already implemented in `normalize`; it is now part of the frozen 1.0.0 contract.

### Lockstep version bump

- All eleven publishable artifacts bump from `0.25.0` to `1.0.0` — the first **major** release: the nine scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/contact`, `@takuhon/cloudflare`, `@takuhon/vercel`), the bare-name `takuhon` redirect, and the `create-takuhon` initializer. The breaking change lives in `@takuhon/core` (schema freeze); the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range (`TAKUHON_DEP_RANGE`) advances to `^1.0.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.25.0] - 2026-06-24

Minor release. Completes the **Phase 5 admin form**: every one of the 19 top-level profile sections is now editable as a form. This closes the gap where only six sections (`profile`, `links`, `careers`, `projects`, `skills`, `settings`) had bespoke forms and the other thirteen (`education`, `certifications`, `publications`, `honors`, `volunteering`, `memberships`, `languages`, `courses`, `patents`, `testScores`, `recommendations`, `contact`, `meta`) could only be edited as raw JSON. Rather than hand-write thirteen more forms, the admin now derives every field straight from the canonical JSON Schema through a schema-driven form engine, so future schema growth stays in step automatically and the coverage gap cannot recur. No `@takuhon/core` schema change (`schemaVersion` stays `0.7.0`); only `@takuhon/ui` changes functionally, and the rest bump for lockstep alignment.

### Added — `@takuhon/ui`

- **Schema-driven admin form engine (`SchemaForm`).** A section's editable form is derived from its schema-classified shape: array sections render as repeaters, object sections as labelled fieldsets, and scalars via the matching primitive (text / URL / email / month / select / checkbox / localized tabs). The RFC 6901 error pointer and the registry path are derived as the engine walks, so client (`validate`) and server (RFC 7807) validation errors map to the right field with no hand-wired plumbing.
- **All 19 sections are forms.** The thirteen sections that were previously raw-JSON-only are now first-class forms in `/admin` and the local `takuhon admin` editor; raw JSON remains as the `advanced` escape hatch.
- **Cross-section reference selectors.** Fields that reference another section (`projects.relatedCareerId`, and `courses` / `testScores` / `recommendations` `*.relatedEducationId` / `relatedCareerId`) render as dropdowns of the target section's entries, labelled by caption and id; a dangling reference (no matching entry) is preserved as its own option rather than silently dropped.
- **Field-spec registry (UI-hint layer).** Presentation the data schema deliberately omits — labels, help text, hidden auto-managed fields, and the bespoke widgets a generic control cannot capture (avatar, comma-separated lists, the public-visibility matrix) — lives in a registry inside `@takuhon/ui`, keyed by schema path, so `takuhon.json` and its schema stay UI-free and `schemaVersion` is unchanged.

### Changed — `@takuhon/ui`

- **The six bespoke section forms were migrated onto the engine and deleted**, so all 19 sections share one paradigm; render-parity tests guard their special widgets, ordering, and field sets.
- **Label, hint, and accessibility polish.** Default field labels keep known acronyms uppercased (`URL` / `Credential ID` / `DOI`); year-month fields show the `YYYY-MM` format hint by default; and a save that fails validation moves focus to the error summary (the GOV.UK error-summary pattern) so keyboard and screen-reader users land on the list of problems.

### Lockstep version bump

- All eleven publishable artifacts bump from `0.24.0` to `0.25.0`: the nine scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/contact`, `@takuhon/cloudflare`, `@takuhon/vercel`), the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/ui` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range (`TAKUHON_DEP_RANGE`) advances to `^0.25.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.24.0] - 2026-06-22

Minor release. Debuts a new publishable package, **`@takuhon/contact`** — a portable, framework-agnostic contact-form core — and ships its Cloudflare implementation inside `@takuhon/cloudflare`. A site embeds a self-contained, CSP-friendly chat-style widget and mounts one stateless `POST` handler; a submission is validated, challenge-verified, and delivered as a single email, with no database, queue, or stored history. No `@takuhon/core` schema change (`schemaVersion` stays `0.7.0`). With contact's debut the lockstep family grows to **eleven** publishable artifacts, all releasing at 0.24.0.

### Added — `@takuhon/contact` (new package)

- **Portable contact-form core.** Framework-agnostic `handleContact(request, deps)` runs the full pipeline — method / content-type / `Origin` guard, size-capped JSON parse, validation, challenge verification, then transport send — behind two injected seams, `ChallengeVerifier` and `EmailTransport`, so the core carries no host, framework, or vendor coupling. A tripped honeypot returns a forged `200` so a bot cannot distinguish rejection from a real send.
- **Hardened validation (`validateSubmission`).** Pure validation rejects a reply-to address that contains a CR/LF or more than a single address (the email-header-injection vector), enforces body / email / message length caps (`DEFAULT_MAX_*`), drops honeypot hits, and normalizes the locale. The challenge verifier is invoked only after validation passes.
- **Self-contained chat-style widget.** A separate Vite library build emits a single browser asset, `dist/contact-widget.js` (plus `contact-widget.css`), with no inline script or `eval` (CSP-friendly), DOM rendered via `textContent` (never `innerHTML`), `ja` / `en` i18n, and dialog accessibility. The package is dependency-free and Apache-2.0.

### Added — `@takuhon/cloudflare`

- **Cloudflare implementation of the two contact seams**, re-exported for host wiring: `createTurnstileVerifier` (server-side Turnstile `siteverify`), `createSendEmailTransport` (the `send_email` binding — `From` a no-reply label, `Reply-To` the visitor, `To` a verified recipient), and `buildInquiryEmail` (text + HTML, every field HTML-escaped, the subject CRLF-stripped). The adapter provides the building blocks only; mounting a `/api/contact` route stays a per-site concern.

### Lockstep version bump

- All eleven publishable artifacts bump from `0.23.0` to `0.24.0`: the nine scoped npm packages (`@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/contact`, `@takuhon/cloudflare`, `@takuhon/vercel`), the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/contact` (new) and `@takuhon/cloudflare` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range (`TAKUHON_DEP_RANGE`) advances to `^0.24.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.23.0] - 2026-06-21

Minor release. Localizes **human-facing dates**. The dates in the server-rendered profile page (`GET /`), the static build, and the derived CV now render in the resolved locale — `Nov 2024` / `2024年11月` for a month and `Dec 22, 2025` / `2025年12月22日` for a full date — instead of raw ISO with a hard-coded English `Present`. Every machine-readable surface (JSON-LD, `/api/profile`, `takuhon.json`, the MCP endpoint) keeps emitting raw ISO, and each visible date stays wrapped in a `<time datetime>` element carrying the verbatim ISO value, so machines read the canonical value while humans read their locale. No `@takuhon/core` schema change (`schemaVersion` stays `0.7.0`). Per the lockstep release policy all ten publishable artifacts release at 0.23.0.

### Added — `@takuhon/core`

- **`formatDate(value, locale)`.** A pure, fail-safe transform that formats a `YYYY-MM` or `YYYY-MM-DD` ISO date as locale-aware human text via `Intl.DateTimeFormat` (month precision → `Nov 2024` / `2024年11月`; full date → `Dec 22, 2025` / `2025年12月22日`). It pins the formatter to UTC and builds the date with `setUTCFullYear` — not `Date.UTC`, which coerces years 0-99 into 1900-1999 — so a month-precision value keeps its century and never slips to the previous month west of UTC. Every failure path is fail-safe and never throws: a value that is not a well-formed in-range date (wrong shape, out-of-range month/day, or a calendar-impossible date such as `2024-02-30`) is returned unchanged, and an empty or structurally invalid locale falls back to English. Keeping `Intl` here holds date formatting inside `@takuhon/core`, out of the renderers.
- **`getPresentLabel(locale)`.** The single source for the ongoing-role timeline marker (en `Present`, ja `現在`), promoted here from `@takuhon/ui` so the React UI and the static HTML / CV renderers resolve it from one dictionary with no drift. It resolves the exact tag, then the base language subtag (so a resolved `ja-JP` still finds `ja`), then English.

### Changed — `@takuhon/api`

- **The static HTML and CV renderers localize every date.** The shared `dateRange` chokepoint in `html/html-helpers.ts` is now `dateRange(start, { end, isCurrent, locale })` — an options object with a **required** `locale`, so a call that forgets the locale is a compile error rather than a silently mis-formatted output. New `timeTag`/`presentLabel` helpers wrap each bound in `<time datetime="<ISO>">` with the locale-formatted text as the visible content. The server-rendered page (`GET /`), the static build, and the derived CV all funnel their date rendering through this one helper, so the three human-facing surfaces stay in step automatically. The helpers own the HTML-escape contract, so the prior double-escaping at the call sites (`escapeHtml(entry.dates)`) is removed.

### Changed — `@takuhon/ui`

- `getUILabel('timeline.present')` now derives from `@takuhon/core`'s `getPresentLabel` instead of its own `Present`/`現在` dictionary, so the React and HTML surfaces share one source and can never drift.

### Fixed — `@takuhon/core`

- `formatDate` rejects calendar-impossible full dates (`2024-02-30`, `2024-04-31`, non-leap `2023-02-29`) with a round-trip check and returns them raw, rather than letting `Date` silently overflow into the next month. Month-precision values always round-trip and are unaffected.

### Tests

- New machine-readable parity tests (`packages/{core,api}/src/__tests__/machine-readable-iso.test.ts`) assert, in both `en` and `ja`, that JSON-LD (including the free-text `award` interpolation, the most likely leak point), `/api/profile`, `takuhon.json`, and the MCP endpoint keep emitting raw ISO dates, and that `formatDate`/`getPresentLabel` appear only in `@takuhon/core` and the `@takuhon/api` HTML helpers — never on a machine-readable code path.

### Lockstep version bump

- All ten publishable artifacts bump from `0.22.0` to `0.23.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, `@takuhon/vercel`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/core`, `@takuhon/api`, and `@takuhon/ui` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range (`TAKUHON_DEP_RANGE`) advances to `^0.23.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.22.0] - 2026-06-20

Minor release. Adds **per-item visibility** — an owner can hide a single content item (a link, project, career, …) from every public surface, the item-level analogue of the section-level `settings.publicVisibility` shipped in 0.18.0. This bumps the `@takuhon/core` schema **0.6.0 → 0.7.0** (additive, backwards-compatible). Per the lockstep release policy all ten publishable artifacts release at 0.22.0.

### Added — `@takuhon/core`

- **Per-item `visibility` (`'public' | 'private'`).** Every content item now accepts an optional `visibility` field. Marking an item `'private'` removes that single item from every public surface (`GET /`, `/api/profile`, `/api/jsonld`, `/takuhon.json`, the MCP endpoint, the derived CV); an absent value or `'public'` keeps it public, so the default is all-visible and older documents are unaffected. A private item is removed entirely — its existence and the section's count are not leaked.
- Implemented as a third **item layer** in the single chokepoint `applyPublicPrivacyFilter`, composing with the section and field layers as a logical AND (section → item → field). Because every public surface funnels through that one filter, parity is automatic. The authenticated admin export (`GET /api/admin/export`) deliberately bypasses the filter, so the owner still sees and edits private items.
- Applies uniformly to items in all 15 array sections (`links`, `careers`, `projects`, `skills`, `certifications`, `memberships`, `volunteering`, `honors`, `education`, `publications`, `languages`, `courses`, `patents`, `testScores`, `recommendations`).

### Changed — schema 0.6.0 → 0.7.0

- New `Visibility` definition and an optional `visibility` property on each of the 15 item definitions; the bundled validator is regenerated. `Link` is `additionalProperties: false`, so the property is declared there for acceptance, and the enum rejects out-of-range values (e.g. `"draft"` → validation error).
- Migration `v0.6.0-to-v0.7.0` (additive version stamp) is registered; older documents migrate forward with no data change. The bundled examples and the `create-takuhon` scaffold now declare `schemaVersion` `0.7.0`.

### Lockstep version bump

- All ten publishable artifacts bump from `0.21.0` to `0.22.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, `@takuhon/vercel`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/core` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range advances to `^0.22.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.21.0] - 2026-06-20

Minor release. Hardens and corrects the public read API and the `/admin` editor: the public surface now permits cross-origin reads (CORS), `500` responses no longer leak internal exception text, the admin editor edits the full stored document (not the privacy-filtered public mirror) behind a token, and optimistic-locking saves work behind a compressing CDN. All changes are in `@takuhon/api`. No `@takuhon/core` schema change (`schemaVersion` stays `0.6.0`). Per the lockstep release policy all ten publishable artifacts release at 0.21.0.

### Added — `@takuhon/api`

- **CORS on the public read API.** Every `createPublicApp` response carries `Access-Control-Allow-Origin: *` and `Access-Control-Expose-Headers: ETag`, and the `OPTIONS *` preflight returns `204` with `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`, an echoed `Access-Control-Allow-Headers` (falling back to `*`), and `Access-Control-Max-Age: 86400`. The public data is unauthenticated, read-only, and privacy-filtered with no credentials, so `*` is safe and lets browser JS and AI tools read the profile, JSON-LD, and discovery document cross-origin. The admin app is a separate Hono app and is unchanged (no CORS). All adapters that mount `createPublicApp` (cloudflare / vercel / static) inherit it.

### Changed — `@takuhon/api`

- **The `/admin` editor edits the full document via the authenticated export.** It now loads from `GET /api/admin/export` — the full, unfiltered document plus its version as an `ETag` — instead of the public, privacy-filtered `/takuhon.json`, so the owner edits the true source of truth and fields the public profile omits are no longer dropped on Save. Loading is token-first: nothing about the profile is fetched until the admin token is entered and **Load** is pressed, and the editor stays empty until then. A `404` (no profile stored yet) starts an empty editor so the first Save creates the document.

### Fixed — `@takuhon/api`

- **Admin `If-Match` now accepts weak ETags.** Compressing CDNs (e.g. Cloudflare serving gzip/br) downgrade the strong ETag to a weak validator (`W/"<version>"`), and browsers echo it back as `If-Match`; the comparison stripped only the quotes, so the `W/` prefix survived and the stored opaque version never matched — every optimistic-locking save behind such a CDN failed with `409 Conflict`. The header is now normalized by stripping the `W/` prefix before comparison.
- **Public `500` responses no longer leak internal exception text.** The public app's error handler returned the raw exception message in the problem-details `detail`; it now logs the error server-side and returns a generic message.

### Lockstep version bump

- All ten publishable artifacts bump from `0.20.0` to `0.21.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, `@takuhon/vercel`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/api` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range advances to `^0.21.0`. (`apps/admin`, `apps/playground`, `adapters/static`, and `adapters/wordpress` are private and not published.)

## [0.20.0] - 2026-06-15

Minor release. Adds `create-takuhon --platform vercel`, so a profile can be scaffolded for Vercel with one command — the same onboarding Cloudflare already had — built on the `@takuhon/vercel` adapter shipped in 0.19.0. No `@takuhon/core` schema change (`schemaVersion` stays `0.6.0`). Per the lockstep release policy all ten publishable artifacts release at 0.20.0.

### Added — `create-takuhon` / `@takuhon/cli`

- **`--platform <cloudflare|vercel>`** flag (default `cloudflare`, so existing behavior is byte-identical). `--platform vercel` scaffolds a minimal Next.js App Router project whose catch-all Route Handler (`app/[[...route]]/route.ts`) mounts `@takuhon/vercel` via `hono/vercel`, serving the read-only public surface (profile page, `/api/*`, JSON-LD, `takuhon.json`). It emits no `wrangler.toml`, Worker entry, admin bundle, or KV/token setup, and prints a Vercel-specific next-steps outro. Project-name validation is platform-aware (Cloudflare Worker name vs Vercel project name).

### Changed — `@takuhon/cli` (internal)

- The scaffold's `@takuhon/*` caret range now lives in a single `scaffold/deps.ts` constant (`TAKUHON_DEP_RANGE`) shared by both platform scaffolds, so a minor release advances it in one place; the pin-guard test checks both scaffolds.

### Lockstep version bump

- All ten publishable artifacts bump from `0.19.0` to `0.20.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, `@takuhon/vercel`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/cli` (the scaffolder) changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret range advances to `^0.20.0`. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.19.0] - 2026-06-15

Minor release. Adds a second platform adapter, **`@takuhon/vercel`**, so a profile can be published on Vercel as well as Cloudflare — a step toward takuhon's "host anywhere, no lock-in" goal. The adapter is read-only and reuses the framework-agnostic public app from `@takuhon/api`, so there is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.6.0`. This adds a tenth publishable artifact; per the lockstep release policy all ten release at 0.19.0.

### Added — `@takuhon/vercel` (new package)

- A read-only Vercel adapter. `createTakuhonVercelApp({ storage, fallback? })` mounts `@takuhon/api`'s `createPublicApp` on the Vercel runtime under a top-level router that sets `localePrefixGetPath`, so the server-rendered profile page (`GET /` and `GET /<locale>/`, with embedded JSON-LD), the public read API (`/api/profile`, `/api/jsonld`, `/api/schema`), and `GET /takuhon.json` / `/.well-known/takuhon.json` are served with full privacy-filter parity. Mount it with `hono/vercel`'s `handle` in an App Router catch-all route.
- Read-only storage with no database: `BundledTakuhonStorage(profile)` serves a bundled `takuhon.json` (validated at construction — fail fast), and `UrlTakuhonStorage(url)` fetches once from `TAKUHON_DATA_URL` and caches per instance. Writes reject; editing is via Git (edit, push, redeploy).
- Cloudflare-only surfaces are intentionally absent: image uploads (`/assets/*`), the MCP endpoint (`/mcp`), and the activity badge / sync (`/activity.svg`, cron). `GET /api/activity` answers 404 and the discovery document omits `mcp`. There is no schema or `@takuhon/core` / `@takuhon/api` behavior change — the adapter is pure wiring.

### Lockstep version bump

- All ten publishable artifacts bump from `0.18.0` to `0.19.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the new `@takuhon/vercel`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/vercel` is new; the rest bump for lockstep alignment with no functional change. The scaffold's pinned `@takuhon/*` caret ranges advance to `^0.19.0`. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.18.0] - 2026-06-15

Minor release. Adds **section-level public/private visibility**: `settings.publicVisibility` lets a profile owner hide whole content sections from every public surface. This is the first `@takuhon/core` schema change since 0.5.0, so the bundled `schemaVersion` advances to **`0.6.0`** (additive and fully backwards-compatible — an absent `publicVisibility` keeps the prior all-public behavior). Per the lockstep release policy all nine publishable artifacts release at 0.18.0.

### Added — `@takuhon/core`

- **`settings.publicVisibility`** (schema 0.6.0): an optional boolean map over the 16 content sections (`links`, `careers`, `projects`, `skills`, `certifications`, `memberships`, `volunteering`, `honors`, `education`, `publications`, `languages`, `courses`, `patents`, `testScores`, `recommendations`, `contact`). Setting a section to `false` hides it from public output; an absent key — or an absent block — means the section is public (default `true`). The `profile` identity is always public and is intentionally not a key. New `PublicVisibility` type and a `0.5.0 → 0.6.0` registry migration (a version stamp — the all-visible default needs no defaulting).
- `applyPublicPrivacyFilter` now applies section visibility in addition to the existing field-level controls. Visibility is the AND of three layers — surface feature toggles (`enable*`), this section flag, and the field flags (`contact.showEmail`, `meta.privacy.*`) — with existing semantics unchanged: hiding a section short-circuits its field checks, and a visible section still honors its field flags. Because every public surface (`GET /`, `/api/profile`, `/api/jsonld`, `/takuhon.json`, MCP, and the derived CV) runs the same filter, they all project identically. Hidden array sections become `[]` and a hidden `contact` becomes `{}`; the identity-return contract is preserved when nothing needs stripping.

### Added — `@takuhon/ui`

- The admin `SettingsForm` gains a **"Public sections"** group: one toggle per content section, defaulting to visible. Hidden sections are stored sparsely (only `false` entries are kept) and the `publicVisibility` block is dropped entirely once every section is visible again, so the default stays absent from the document.

### Lockstep version bump

- All nine publishable artifacts bump from `0.17.0` to `0.18.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/core` and `@takuhon/ui` changed functionally; `@takuhon/api`, `@takuhon/cloudflare`, `@takuhon/cli`, and MCP carry the new filter behavior through unchanged code. The scaffold's pinned `@takuhon/*` caret ranges advance to `^0.18.0`. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.17.0] - 2026-06-14

Minor release. The deployed profile is now **served as a page from the root**: `GET /` (and `GET /<locale>/`) returns the mobile-first profile HTML with Schema.org JSON-LD embedded in the page, instead of a plain-text hint. This makes the flagship Cloudflare Worker deployment serve what a visitor and a search-engine / AI crawler each need — a human-facing page and machine-readable structured data — from the root, matching what `takuhon dev` and `takuhon build` already render. No `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`. Per the lockstep release policy all nine publishable artifacts release at 0.17.0.

### Changed — `@takuhon/api`

- `createPublicApp`'s `GET /` (and the locale-prefixed `GET /<locale>/`) now returns the server-rendered profile page — a complete mobile-first HTML document with Schema.org JSON-LD embedded as `<script type="application/ld+json">`, plus `<link rel="canonical">` and `hreflang` alternates derived from the request's own origin — in place of the previous plain-text landing string. It runs the same `normalize → resolveLocale → applyPublicPrivacyFilter` pipeline as `GET /api/profile`, so the page honors `meta.privacy` exactly like the API. The JSON endpoints (`/api/profile`, `/api/jsonld`, `/api/schema`, `/takuhon.json`), the RFC 7807 error envelope, and `schemaVersion` are unchanged. The public-page CSP `img-src` now allows `https:` so remote avatar images load.
- The pure static-HTML renderer (`renderProfileHtml`, `generateSite`, `renderCvHtml`, and the shared HTML helpers) moved here from `@takuhon/cli`. It is `@takuhon/core`-only (no DOM/bundler dependency) and is now shared by both the `GET /` route and `@takuhon/cli`'s `build` / `dev`, so a deployed profile and a local preview render identical markup. The renderer is re-exported from `@takuhon/api`.

### Changed — `@takuhon/cloudflare`

- The Worker root now serves the server-rendered profile page (via `@takuhon/api`'s `createPublicApp`), with canonical / `hreflang` derived from the request origin and `Cache-Control: public, max-age=300`; the existing admin cache purger already invalidates `/`, so an admin edit refreshes the page immediately. No adapter code change was required — the behavior flows through from `@takuhon/api`.

### Changed — `@takuhon/cli`

- `build` and `dev` import the static-HTML renderer from `@takuhon/api` (its new home) instead of a local module. Generated output is byte-for-byte unchanged.

### Lockstep version bump

- All nine publishable artifacts bump from `0.16.0` to `0.17.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/api`, `@takuhon/cloudflare`, and `@takuhon/cli` changed functionally; the rest bump for lockstep alignment. The scaffold's pinned `@takuhon/*` caret ranges advance to `^0.17.0`. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.16.0] - 2026-06-14

Minor release. Ships a **Gravatar avatar helper**: an owner who is not on GitHub (or who simply prefers it) can set an avatar from just an email address — no upload required — alongside the existing "paste a URL" and "upload an image" paths. `@takuhon/core` gains a pure `gravatarUrl(email, options?)` that hashes the email with a bundled synchronous SHA-256 and builds the Gravatar image URL; the admin profile form gains a "Use Gravatar" mode that calls it in the browser. The email is never stored — only the resulting URL is saved into `profile.avatar.url`. There is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`. Per the lockstep release policy all nine publishable artifacts release at 0.16.0.

### Added — `@takuhon/core`

- `gravatarUrl(email, options?)` builds the Gravatar avatar URL for an email address: it trims and lower-cases the email, hashes it with SHA-256, and assembles `https://gravatar.com/avatar/{hash}` with optional `?s=` (size) and `?d=` (default image) query parameters from `GravatarOptions`. It is a pure, deterministic transform — the email is never stored; only the returned URL is meant to be saved into `profile.avatar.url`. The SHA-256 is a small, dependency-free, synchronous implementation, so the helper runs identically on Node, Cloudflare Workers, and in the browser with no async Web Crypto call and no `eval` (safe under the strict admin CSP).

### Added — `@takuhon/ui`

- The admin profile form offers a third way to set an avatar, next to pasting a URL and uploading an image: a `GravatarField` with an email input and a "Use Gravatar" button that turns the email into a Gravatar URL via core's `gravatarUrl`, applied on click or Enter. The email is local-only — it is never written to the document or sent anywhere, and the input clears once applied; only the generated URL is stored. Because the hash is computed synchronously in the browser, there is no API/transport change and nothing runs `eval`, so it works under the strict admin CSP. `GravatarField` is exported from `@takuhon/ui/admin`.

### Lockstep version bump

- All nine publishable artifacts bump from `0.15.1` to `0.16.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/core` and `@takuhon/ui` changed functionally; the rest bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.15.1] - 2026-06-13

Patch release. Fixes a `@takuhon/activity` bug that broke the developer-activity sync on Cloudflare Workers — the daily cron never populated the snapshot, so `GET /activity.svg` stayed 404 and the in-page activity section never appeared. No `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`. Per the lockstep release policy all nine publishable artifacts release at 0.15.1.

### Fixed — `@takuhon/activity`

- The scheduled and CLI activity sync no longer fail on Cloudflare Workers with `Illegal invocation: function called with incorrect this reference`. `fetchActivitySnapshot` and the `GitHubClient` / `WakaTimeClient` constructors defaulted their `fetch` to the bare runtime global, which `workerd` rejects when it is subsequently invoked as an instance field (`this.fetchImpl(url)`) because its `this` is then the client instance rather than the global scope. They now default to a small wrapper that calls the global `fetch` as a free function, keeping its `this` bound to the global scope on every runtime. Node tolerated the detached call, so the bug only ever surfaced on Workers (the scheduled sync behind `GET /activity.svg` and the activity section). No API or behavioural change otherwise.

### Lockstep version bump

- All nine publishable artifacts bump from `0.15.0` to `0.15.1`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/activity` changed functionally; the rest bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.15.0] - 2026-06-12

Minor release. Ships **activity badge export**: the developer-activity card can be embedded as a standalone image — e.g. a badge in a GitHub profile README, served through GitHub's Camo image proxy. `@takuhon/core`'s `renderActivitySvg` now paints an opaque, palette-driven background so the card stays legible as an image on any theme; the Cloudflare adapter serves it dynamically at `GET /activity.svg` (with a `?theme=light|dark` toggle); and `takuhon build` writes it statically as `activity.svg` / `activity-dark.svg`. Both reuse the same renderer as the in-page dashboard, so the badge never drifts. There is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`. Per the lockstep release policy all nine publishable artifacts release at 0.15.0.

### Changed — `@takuhon/core`

- `renderActivitySvg(snapshot, options?)` now paints an opaque background rectangle and draws every colour from a `Palette`, so the activity card stays legible when embedded as a standalone image (e.g. a GitHub README badge through the Camo proxy), where a transparent card would vanish on a dark theme. It defaults to the new `LIGHT_PALETTE` — the previous colours on an opaque white card — so existing HTML/React embeddings are unchanged apart from the now-opaque background; pass `DARK_PALETTE` for a dark variant. Palettes are plain data, so the render stays deterministic and self-contained (no external references; the `img-src 'self'` CSP is unchanged). Exports `Palette`, `RenderActivitySvgOptions`, `LIGHT_PALETTE`, `DARK_PALETTE`.

### Added — `@takuhon/cloudflare`

- A read-only activity-badge endpoint at `GET`/`HEAD /activity.svg`, rendering the synced snapshot as a self-contained SVG image. `?theme=dark` selects the dark palette (anything else renders light). It is stateless and unauthenticated at parity with `GET /api/activity`: it reads the same KV (bundled fallback before the first write) and re-checks the owner's `settings.activity.enabled` opt-in on every request, so disabling the feature 404s the badge immediately even with a stale snapshot still stored. A missing, disabled, or metric-less snapshot all answer 404. The response is `image/svg+xml` with `X-Content-Type-Options: nosniff` and `Cache-Control: public, max-age=14400`. The route is locale-agnostic (literal `/activity.svg`, like `/mcp` and `/assets/*`); no new binding or `wrangler.toml` change.

### Added — `@takuhon/cli`

- `takuhon build` writes the activity card as standalone `activity.svg` (light) and `activity-dark.svg` (dark) beside the generated pages when `settings.activity.enabled` is true and an `activity.json` sits beside the profile — the static counterpart of the Cloudflare adapter's `GET /activity.svg`. Two files (rather than one query-aware route) let a `<picture>` + `prefers-color-scheme` snippet work on a static host. A metric-less snapshot writes nothing. The build summary now reports the extra assets (`built N pages and M assets …`). The scaffolded project README gains a **GitHub profile badge** section documenting the `<img>` and `<picture>` embeds and the Camo cache caveat.

### Lockstep version bump

- All nine publishable artifacts bump from `0.14.0` to `0.15.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/core`, `@takuhon/cloudflare`, and `@takuhon/cli` changed functionally; the rest bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.14.0] - 2026-06-12

Minor release. Ships **MCP (Model Context Protocol) support**: the public profile becomes readable by AI agents over MCP, read-only, exposing exactly what the public HTTP API already does (with the privacy filter applied) — no write access. `@takuhon/core` gains a pure tool/resource catalog and projection (the same kind of pure transform as `generateJsonLd`); a new `@takuhon/mcp` package wires that catalog to the official `@modelcontextprotocol/sdk` as a transport-agnostic server; `takuhon mcp` serves it locally over stdio (e.g. for Claude Desktop); and the Cloudflare adapter serves it remotely at a stateless `POST /mcp` (no Durable Object, no new binding) advertised in `/.well-known/takuhon.json`. `@takuhon/mcp` joins the lockstep set as the **ninth publishable artifact**, first published at this version. There is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`. Per the lockstep release policy all nine publishable artifacts release at 0.14.0.

### Added — `@takuhon/core`

- A read-only Model Context Protocol projection of a profile: the `MCP_TOOLS` / `MCP_RESOURCES` catalog (plain data with no SDK dependency) and the pure, deterministic executors `executeMcpTool(name, args, profile)` and `readMcpResource(uri, profile)`. The tools are `get_profile`, `get_section`, `get_jsonld`, and `list_locales`; the resources are `takuhon://profile` and `takuhon://schema`. Locale-aware tools run the same `normalize` → `resolveLocale` → `applyPublicPrivacyFilter` pipeline as `GET /api/profile`, so an MCP client sees exactly what the public API exposes and no admin surface. Invalid input throws a typed `McpRequestError`. Exports `MCP_PROFILE_SECTIONS`, `McpProfileSection`, `McpToolDefinition`, `McpResourceDefinition`, `McpToolResult`, `McpResourceResult`, `McpInputSchema`.

### Added — `@takuhon/mcp` (new)

- `createTakuhonMcpServer({ loadProfile, name?, version? })` builds a transport-agnostic MCP server on the official `@modelcontextprotocol/sdk`, registering the `@takuhon/core` catalog and wiring every handler to a caller-supplied profile loader. It attaches no transport — the caller connects stdio (the CLI) or stateless HTTP (the Cloudflare adapter) — so the SDK dependency is contained to this package while core's catalog stays SDK-free. Bad arguments and profile-load failures surface as `isError` tool results.

### Added — `@takuhon/cli`

- `takuhon mcp [path]` serves a local `takuhon.json` over MCP on stdio (read-only), so an MCP client such as Claude Desktop can read the profile. It re-reads and re-validates the file on every request so edits are reflected without a restart, and fails fast (exit 2) if the file is missing / unreadable / invalid. stdin/stdout carry the protocol stream, so the command writes nothing to stdout — diagnostics go to stderr.

### Added — `@takuhon/cloudflare`

- A read-only MCP endpoint at `POST /mcp`, the remote counterpart of `takuhon mcp`. It reuses `@takuhon/mcp`'s server over the SDK's Web Standard Streamable HTTP transport and is **stateless** — no Durable Object, no session, no new binding: each request builds a fresh server + transport, reads the profile from the existing KV (bundled fallback before the first write), and returns a single JSON response. It is unauthenticated public read at parity with `GET /api/profile`, with `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, and is advertised as `mcp` in `/.well-known/takuhon.json` (a new optional `PublicAppDeps.mcpPath` on `@takuhon/api`, so adapters that don't serve MCP omit it).

### Lockstep version bump

- All nine publishable artifacts bump from `0.13.0` to `0.14.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/mcp`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/core`, `@takuhon/mcp` (new), `@takuhon/cli`, and `@takuhon/cloudflare` (plus the `mcpPath` addition in `@takuhon/api`) changed functionally; the rest bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.13.0] - 2026-06-12

Minor release. Ships **résumé / CV export**: a print-ready CV is generated from the same `takuhon.json`, with no re-entry. `@takuhon/core` gains a pure `deriveCv` projection (a header plus the CV-relevant sections in a fixed résumé order, web-page-only sections excluded); `takuhon build --cv` writes a self-contained, A4-sized `cv.html` per locale that the browser's "Save as PDF" turns into a résumé PDF (no headless browser or extra dependency — the page is plain HTML + a print stylesheet); and `@takuhon/ui` adds a matching `CvView` React component. There is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.5.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all eight publishable artifacts release at 0.13.0.

### Added — `@takuhon/core`

- `deriveCv(localized)` projects a locale-resolved profile into a `CvDocument` (a `CvHeader` plus an ordered list of `CvSection`, discriminated by `kind`, reusing the existing `Localized*` entry types). Sections appear in a fixed résumé order — experience, education, skills, certifications, publications, honors, courses, patents, languages, volunteering, memberships — with empty ones dropped and the web-page-only sections (links, recommendations, the activity dashboard, test scores) excluded. Entry order within a section is preserved (the owner's `order` controls it; `deriveCv` never re-sorts). It is pure and deterministic, so the static export and the React view render identical output, and it projects only what it is given — the caller privacy-filters upstream, exactly like the public render path. Exports `CvDocument`, `CvHeader`, `CvSection`, `CvSectionKind`.

### Added — `@takuhon/ui`

- `CvView` renders a `CvDocument` as an A4 single-column résumé — the React counterpart of the CLI's `renderCvHtml`, generated from the same `deriveCv` output so the two surfaces cannot drift. Its CSS module carries an `@media print` block and an `@page { size: A4 }` rule, so on screen it is a centered "sheet" and the browser's "Save as PDF" yields a clean résumé. Section headings reuse the existing localized `section.*` labels, dates go through `formatYearMonth`, and ongoing roles show the localized "Present" marker. It is presentational (privacy filtering is the host's job) and renders nothing for an empty CV.

### Added — `@takuhon/cli`

- `takuhon build --cv` also emits a print-ready CV page per locale (`<dir>/cv.html` and `<dir>/<locale>/cv.html`) alongside the profile pages; a plain `takuhon build` is unchanged. `takuhon dev` always serves the CV at `/cv` for previewing. The page is a self-contained, A4-sized HTML résumé with a print stylesheet — `renderCvHtml(cv)` from the core `deriveCv` output — referencing no external resources, so it works under a strict `img-src 'self'` policy; every CV-derived string is escaped and URLs are scheme-checked. The scaffolded project README documents the workflow.

### Changed — `@takuhon/cli` / `@takuhon/cloudflare`

- `hono` updated from 4.12.19 to 4.12.21.

### Lockstep version bump

- All eight publishable artifacts bump from `0.12.0` to `0.13.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/core`, `@takuhon/ui`, and `@takuhon/cli` changed functionally (plus the `hono` bump in `@takuhon/cli` and `@takuhon/cloudflare`); the rest bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.12.0] - 2026-06-11

Minor release with two feature tracks. **Image uploads land end-to-end**: the core byte-level helpers and the `POST /api/admin/assets` endpoint added below are now wired to real storage (Cloudflare R2 and the local filesystem) and to an avatar upload control in the admin form UI, so a profile owner can upload an avatar from `/admin` on either a deployed Worker or `takuhon admin`. **The developer-activity dashboard ships**: an opt-in `settings.activity` (GitHub language mix / contribution calendar, WakaTime coding time, and a derived rank) is synced ahead of time into a sibling snapshot document — by the new `takuhon activity sync` command locally or a Worker cron on Cloudflare — and rendered as a self-owned inline SVG on both the static export and the React profile, plus served at a public `GET /api/activity`; rendering never calls GitHub or WakaTime and the API keys never leave the sync step. The bundled schema moves from `0.4.0` to `0.5.0` (one additive, optional field — `settings.activity`; the migration stamps the version only). `@takuhon/activity` joins the lockstep set as the **eighth publishable artifact**, first published at this version. Per the lockstep release policy all eight publishable artifacts release at 0.12.0.

### Added — `@takuhon/core`

- Image-asset helpers for the upcoming upload feature: `detectImageMime` (magic-byte type detection, independent of the declared `Content-Type`), `readImageInfo` (header-only width / height / animation-frame reading, no pixel decode), and `stripImageMetadata` (removes EXIF / IPTC / XMP / embedded color profile / comments by editing the container structure only), plus the `ACCEPTED_IMAGE_MIME_TYPES`, `MAX_IMAGE_BYTES`, `MAX_IMAGE_DIMENSION`, `MAX_IMAGE_FRAMES`, and `IMAGE_EXTENSIONS` constants and the `AcceptedImageMime` / `ImageInfo` types. The helpers cover JPEG, PNG, WebP, and GIF (AVIF is not handled yet); they decode no pixel data, so they are dependency-free and run identically on Workers, Node, and the browser.
- Developer-activity foundation: the `ActivitySnapshot` shape (`LanguageBreakdown`, `ContributionCalendar`, `CodingTime`, `RankTier`), the `isActivitySnapshot` runtime guard, and the deterministic transforms `computeLanguagePercentages` (byte counts → sorted percentages), `formatCodingTime` (seconds → h/m/s), and `deriveRankTier` (a generic linear-saturation scheme: 2,000 contributions / 2,000 coding hours each saturate a 0–100 sub-score, tiers at S ≥ 80 / A ≥ 60 / B ≥ 40 / C ≥ 20). A new `ActivityStorage` contract stores the snapshot as a sibling document — deliberately outside the canonical `takuhon.json`, so externally-sourced volatile metrics never enter the owner-curated source of truth — with `getActivitySnapshot()` resolving to `null` (not throwing) when nothing is synced yet.
- `renderActivitySvg(snapshot)`: a deterministic pure-string renderer producing one self-contained SVG card — language bar with legend (top six plus an aggregated "Other"), contribution heatmap (capped at the most recent 371 days), coding time, rank badge, and a `Last synced` footer. No clock, no randomness, no locale-dependent formatting, and no external badge image, so embedding pages keep a strict `img-src 'self'` Content-Security-Policy; every snapshot-derived string is XML-escaped (language names are external API data). An empty snapshot renders to `''` so callers omit the section.
- Schema `0.5.0`: one additive, optional `settings.activity` object (GitHub / WakaTime usernames, per-signal show flags, `showRank`, `refreshHintHours` — never secrets). `SCHEMA_VERSION` / `SUPPORTED_SCHEMA_VERSIONS` advance, migration `v0.4.0-to-v0.5.0` stamps the version only (no data change), the precompiled validator is regenerated, and the bundled examples move to `0.5.0`.

### Added — `@takuhon/api`

- `POST /api/admin/assets` accepts a multipart image upload (`file` field) for the profile owner and returns the stored asset's `AssetRecord` (201). It authenticates the type from the bytes (not the declared `Content-Type`), enforces the size (5 MB), dimension (4096 × 4096 px), and animation-frame (100) limits, strips metadata (EXIF / IPTC / XMP / color profile) via the `@takuhon/core` helpers, then persists the validated, stripped bytes through a new optional `assetStorage` dependency (`TakuhonAssetStorage`). It emits an `admin.asset.upload` audit event and maps failures to RFC 7807 (`413` too large, `415` unsupported type, `422` unparsable / over the dimension or frame limit). The route is registered only when an `assetStorage` is configured; without one it resolves to `404`, so deployments that don't host uploaded media (e.g. static export) are unaffected.
- `GET /api/activity`: public read of the synced developer-activity snapshot, served from a new optional `activityStorage` dependency on `createPublicApp`. The owner's opt-in is re-checked on every read, so setting `settings.activity.enabled` to `false` stops serving a previously synced snapshot immediately; "no storage", "not enabled", and "no snapshot" all answer the same RFC 7807 404. Cached `public, max-age=300` like the other public reads.

### Added — `@takuhon/ui`

- Avatar uploads in the admin form: a new `ImageField` primitive in `@takuhon/ui/admin` renders the avatar URL input plus a file picker when the host supplies an `uploadAsset` callback; a successful upload writes the returned relative `/assets/...` URL back into the field. The admin SPA wires the callback to `POST /api/admin/assets` with the bearer token and maps failures to readable messages. Without the callback (or without an asset storage on the server) the field stays URL-only, exactly as before.
- `ActivitySection`: the developer-activity card for the React profile, generated by `@takuhon/core`'s `renderActivitySvg` so the React and static surfaces cannot drift; a labelled region with a localized heading (`Activity` / `アクティビティ`) that renders nothing without a snapshot. `TakuhonProfile` accepts an optional `activitySnapshot` and renders it only while `settings.activity.enabled` is true — the same opt-in gate the API applies.

### Added — `@takuhon/cli`

- `takuhon admin update [path]` refreshes a scaffolded project's `admin-dist/` with the admin form-UI bundle shipped in the installed `@takuhon/cli`, so upgrading the CLI can update the form UI without re-scaffolding (which would clobber the rest of the project). It replaces the bundle atomically — staged in a temporary directory, then swapped in with a rename, which also drops any stale files the previous bundle had — and refuses to run outside a takuhon project or where there is no `admin-dist/` to refresh (creating one remains `create-takuhon`'s job). Exit codes: `0` refreshed, `2` bad arguments / not a takuhon project / no `admin-dist/` / copy failure.
- Local image uploads in `takuhon admin`: a `FileTakuhonAssetStorage` stores validated, metadata-stripped uploads in an `assets/` directory beside `takuhon.json` (object keys identical to the R2 adapter's, so a locally-edited profile keeps working relative `/assets/...` URLs after deploy) and the local admin server delivers them at `GET /assets/*` with `X-Content-Type-Options: nosniff` and an immutable cache policy. `POST /api/admin/assets` is enabled on the loopback admin out of the box.
- `takuhon activity sync [path]`: fetches the GitHub / WakaTime activity configured under `settings.activity` and stores the snapshot as an `activity.json` beside the profile (a new file-backed `ActivityStorage`, atomic writes, forgiving reads). Secrets come from the environment only — `TAKUHON_GITHUB_TOKEN` optional (languages need no token; the contribution calendar does), `TAKUHON_WAKATIME_KEY` required for WakaTime — and per-source failures or skipped sources are reported on stderr with secret values redacted. A sync that gathers nothing never overwrites a good snapshot: the last-known `activity.json` is kept and the command exits `1` so a scheduled run surfaces the failure. `takuhon activity show [path]` prints the stored snapshot.
- `takuhon build` and `takuhon dev` render the synced snapshot as an "Activity" section (the `@takuhon/core` inline-SVG card, after Skills) while `settings.activity.enabled` is true; `dev` re-reads `activity.json` on every load, so a fresh sync shows up on the next request. Without a snapshot — or with the feature disabled, even if a stale snapshot remains on disk — the section is omitted.
- The scaffolded project documents the activity feature: `.env.example` lists `TAKUHON_GITHUB_TOKEN` / `TAKUHON_WAKATIME_KEY` with their `wrangler secret put` provisioning path, `wrangler.toml` ships a commented `[triggers]` cron block, and the README gains a "Developer-activity dashboard (optional)" section covering opt-in, secrets, the cron, and the local sync path.

### Changed — `@takuhon/cli`

- `takuhon admin` now signs the local form UI in automatically: the loopback server injects the per-run token into the served `/admin` document as a `<meta name="takuhon-local-token">` tag and the SPA reads it on load, so the operator no longer pastes the token into a sign-in form. The token is still minted per run and bound to `127.0.0.1`. The injection happens only in the local server's response — the bundle files shipped in `@takuhon/cli` (which the Cloudflare adapter serves verbatim) never carry the tag, so the public `/admin` sign-in gate is unchanged. The tag is a `<meta>`, not an inline script, so it is served under the same strict `script-src 'self'` CSP. If the injected token is somehow rejected, the SPA falls back to the manual sign-in form.

### Added — `@takuhon/cloudflare`

- R2-backed image assets: `R2TakuhonAssetStorage` persists admin uploads in an optional `TAKUHON_R2` bucket binding, and the Worker serves them through a public `GET /assets/*` delivery proxy — the bucket stays private and every read carries `X-Content-Type-Options: nosniff` plus an immutable cache policy. Without the binding, the upload endpoint stays unregistered and avatars remain URL-only; the adapter and scaffold ship the `[[r2_buckets]]` block commented out so a fresh deploy never breaks on a missing bucket.
- Scheduled developer-activity sync: `createTakuhonWorker` gains a `scheduled` handler (enable with a `[triggers] crons` entry; daily recommended) that reads `settings.activity` from the stored profile, fetches via `@takuhon/activity` using the new `TAKUHON_GITHUB_TOKEN` / `TAKUHON_WAKATIME_KEY` Wrangler secrets, and stores the snapshot in a new `KvActivityStorage` (a second key, `TAKUHON_ACTIVITY`, in the existing KV namespace). The handler never throws and never overwrites a good snapshot with an empty one — a failing run keeps the last-known snapshot and emits a structured `activity.sync.success|failure|skipped` log line (secrets redacted) for Workers Tail / Logpush. The public app serves `GET /api/activity` from the same storage.

### Added — `@takuhon/activity`

- First release of the developer-activity fetch package, the eighth publishable artifact. `GitHubClient` reads language bytes over REST (aggregated across owned, non-fork repositories; unauthenticated works at a low rate limit) and the contribution calendar over GraphQL (token required); `WakaTimeClient` reads coding seconds (API key required, HTTP Basic). `fetchActivitySnapshot(config, secrets, deps)` assembles the snapshot with per-source graceful degradation — a disabled, unconfigured, secret-less, or failing source is omitted and reported via `onError`; the call itself never rejects — and `isEmptySnapshot` lets callers avoid overwriting good data with an empty result. The `fetch` implementation is injectable for tests. Network I/O lives in this package so `@takuhon/core` stays platform-independent.

### Lockstep version bump

- All eight publishable artifacts release at `0.12.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/activity` (first publish), `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. All six scoped packages changed functionally; the bare-name `takuhon` and `create-takuhon` bump for lockstep alignment. (`apps/admin`, `apps/playground`, and `adapters/static` are private and not published.)

## [0.11.0] - 2026-06-09

Minor release. Ships `takuhon admin`, a local admin **form** server that brings the Cloudflare admin form UI (added in 0.10.0) to the local lifecycle: `takuhon admin` serves the React admin form at `/admin`, the canonical admin API at `/api/admin/*` backed by the project's `takuhon.json`, and the static HTML preview at `/`, all bound to a loopback port — so editing in the form writes `takuhon.json` and reloading the preview shows the change, with no deployed instance required. It reuses `@takuhon/api`'s admin app and the admin bundle already shipped in `@takuhon/cli`. There is no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all seven publishable artifacts bump to 0.11.0.

### Added — `@takuhon/cli`

- `takuhon admin [path] [--port <n>] [--base-url <url>]` runs a local admin server (Spec §14.1 Phase 5 "local Admin"): the React admin **form** UI at `/admin`, the canonical admin API at `/api/admin/*` backed by the project's `takuhon.json`, and the static HTML preview at `/`, all on a loopback port (default 4322). It reuses `@takuhon/api`'s admin app (schema validation, `If-Match` optimistic locking, RFC 7807 errors) over a new filesystem storage, and serves the same admin bundle shipped in this package — so editing in the form writes `takuhon.json` (atomically, after a `.takuhon-backups/pre-admin-*.json` backup) and reloading `/` shows the change. The server binds `127.0.0.1` only and mints a fresh admin token each run, printed for the operator to paste into the sign-in form; the document version is the file's content hash, so an external edit between load and save surfaces as a 409 conflict. `takuhon dev` is unchanged.

### Lockstep version bump

- All seven publishable artifacts bump from `0.10.0` to `0.11.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. Only `@takuhon/cli` changed functionally (the new `takuhon admin` command); the other six bump for lockstep alignment. (`apps/admin`, the SPA bundle source, is private and not published.)

## [0.10.0] - 2026-06-08

Minor release. Ships the Cloudflare admin **form** UI end-to-end. A React single-page app (built from the new `apps/admin`) replaces the minimal JSON-textarea admin editor: `@takuhon/ui` gains an `@takuhon/ui/admin` component set, the Cloudflare adapter serves the bundle from Workers Assets at `/admin` under a strict Content-Security-Policy (falling back to the inline editor when no bundle is bound), and `create-takuhon` now scaffolds the bundle into new projects so downstream users get the form UI by default. Supporting changes: an `ETag` on the admin export endpoint for optimistic locking, and a precompiled, eval-free `@takuhon/core` validator so the SPA runs under the strict admin CSP. There is no `@takuhon/core` schema change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all seven publishable artifacts bump to 0.10.0.

### Added — `@takuhon/ui`

- New `@takuhon/ui/admin` subpath export with the admin form building blocks: field primitives (`Field`/`Text`/`TextArea`/`Select`/`Checkbox`), a multi-locale `LocaleTabs`, a `Repeater` for list-valued sections, section forms covering the editable subset (profile, links, careers, projects, skills, settings), an `AdminEditor` orchestrator (form ⇄ raw-JSON toggle, client-side validation, client/server error mapping with an error summary, and a save-race guard), and a `RawJsonEditor` that commits only schema-valid drafts. Error normalization maps both core `ValidationError` and RFC 7807 problem bodies to canonical JSON Pointer paths.

### Added — `@takuhon/api`

- `GET /api/admin/export` now returns the stored document's version as an `ETag`, enabling `If-Match` optimistic locking on subsequent admin writes.

### Added — `@takuhon/cloudflare`

- The Worker serves the bundled admin SPA from a Workers Assets binding (`Env.ASSETS`, optional) at `/admin` under a strict, no-nonce CSP (`script-src 'self'`, `require-trusted-types-for 'script'`) plus HSTS and `no-store`, with `run_worker_first` so the Worker — not the asset server — attaches the policy. When the binding is absent the Worker falls back to the inline `createAdminUiApp` editor, so deployments without Workers Assets configured are unaffected.

### Added — `@takuhon/cli`

- `create-takuhon` now scaffolds the React admin form UI. The compiled admin SPA ships inside the `@takuhon/cli` package (built from `apps/admin` and copied into the package at build time) and is copied into each new project's `admin-dist/` directory at scaffold time; the generated `wrangler.toml` binds it as Workers Assets with `run_worker_first = true`, so the Cloudflare Worker serves it at `/admin` under a strict Content-Security-Policy. Removing the `[assets]` block (or deploying an adapter without the binding) falls back to the minimal inline editor. The bundle is a snapshot taken at scaffold time — re-run `create-takuhon` to refresh it.
- The scaffolded `@takuhon/*` caret pins advance from `^0.9.0` to `^0.10.0` to track this minor (a caret does not span minors under 0.x), so a scaffolded project resolves the `@takuhon/cloudflare` version that serves the admin SPA from Workers Assets; a guard test enforces the bump.

### Changed — `@takuhon/core`

- The schema validator is precompiled to a standalone, eval-free module so it runs under a strict CSP (`script-src 'self'` without `unsafe-eval`) in the browser admin UI, where Ajv's runtime `new Function` would otherwise be blocked. Behavior is unchanged — `validate()` accepts and rejects exactly as before — and the schema and `schemaVersion` (`0.4.0`) are unchanged. A CI guard fails if the generated validator drifts from the schema.

### Lockstep version bump

- All seven publishable artifacts bump from `0.9.0` to `0.10.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/ui`, `@takuhon/api`, `@takuhon/cloudflare`, `@takuhon/cli`, and `@takuhon/core` changed functionally; the bare-name `takuhon` and `create-takuhon` redirects bump for lockstep alignment. (`apps/admin`, the SPA bundle source, is private and not published.)

## [0.9.0] - 2026-06-05

Minor release. Adds `takuhon sync`, the last planned CLI command (Spec §5.7) and the secondary update path from the Cloudflare update workflow (§9.6): it pushes a local `takuhon.json` to a deployed instance by calling the admin write endpoint. It also refreshes the project that `create-takuhon` scaffolds — the generated README and the post-scaffold steps assumed the `@takuhon/*` packages were not yet published, which is no longer true. There is no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all seven publishable artifacts bump to 0.9.0.

### Added — `@takuhon/cli`

- `takuhon sync [path] --url <base-url> [--if-match <etag>] [--dry-run]` pushes a local `takuhon.json` to a deployed instance by calling its admin write endpoint (`PUT <base-url>/api/admin/profile`), reusing the server's schema validation, optimistic locking, audit logging, and edge-cache purge — so it needs no `wrangler`/Cloudflare SDK and no new dependency. The local file is the source of truth: the push is an unconditional mirror by default, and `--if-match <etag>` opts into optimistic locking (the server returns 409 on a stale version). The admin bearer token is read from the `TAKUHON_ADMIN_TOKEN` environment variable (never a flag, so it cannot leak into shell history); `--url` must be a bare http(s) origin; the document is validated locally and sent as-is (run `takuhon migrate` first for an older schema version); and `--dry-run` validates and reports the payload without contacting the network. Exit codes: `0` synced, `1` the local file is invalid or the remote refused the write (422 validation / 409 conflict), `2` operational failure (bad arguments, missing file, unset token, 401/403, network error, or any other non-success response).

### Fixed — `@takuhon/cli`

- The project scaffolded by `create-takuhon` no longer tells users that the `@takuhon/*` packages are "not yet on the npm registry" with a clone-and-link workaround — they are published, and the scaffolded `package.json` pins resolve. The generated README's Setup now installs dependencies first and the Develop section is just `pnpm dev`; the provisioning commands use `npx wrangler …` (wrangler is a project devDependency); and the `create-takuhon` post-scaffold steps are reordered to match. Scaffold-output text only; no command behavior changes.
- The scaffolded `package.json` `@takuhon/*` caret pins advance from `^0.8.0` to `^0.9.0` to track this minor (a caret does not span minors under 0.x); a guard test enforces this.

### Lockstep version bump

- All seven publishable artifacts bump from `0.8.2` to `0.9.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the `create-takuhon` initializer. `@takuhon/cli` changed functionally (the `sync` command and the scaffold refresh); the other six bump for lockstep alignment.

## [0.8.2] - 2026-06-04

Patch release. Ships the new `create-takuhon` initializer package — the first published version of a seventh artifact — so the advertised `npm create takuhon` / `npx create-takuhon <dir>` onboarding resolves on npm (previously `create-takuhon` was only a `bin` inside `@takuhon/cli`, with no package of that name, so the command 404'd). There is no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy the existing six publishable artifacts bump to 0.8.2 alongside the new package.

### Added — `create-takuhon`

- New `create-takuhon` initializer package, so `npm create takuhon` / `npx create-takuhon <dir>` resolve on npm. It is a thin redirect (the same pattern as the bare-name `takuhon` package): its `bin` runs `@takuhon/cli`'s scaffolder via a new `@takuhon/cli/init` export. `@takuhon/cli`'s `create-takuhon` entry (`init.ts`) was made import-safe — `process.exit` and the scaffolder are confined to an exported `run()` behind an entry-point guard, mirroring the `takuhon` entry — and `@takuhon/cli` now exposes an `./init` subpath export. The release pipeline publishes it after the scoped packages (an isolated `publish-create-takuhon` job) and includes it in the GitHub Release (seven tarballs + cosign bundles).

### Lockstep version bump

- All seven publishable artifacts bump from `0.8.1` to `0.8.2`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, the bare-name `takuhon` redirect, and the new `create-takuhon` initializer (its first published version). Only the new package and the release pipeline changed; the other six bump for lockstep alignment.

## [0.8.1] - 2026-06-04

Patch release. Corrects the `create-takuhon` scaffold's stale `@takuhon/*` dependency pins (a drift fix shipped one release late) and brings the `@takuhon/cli` package README current. Both are `@takuhon/cli`-only and affect what is published, not runtime behavior of any command. There is no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all six publishable artifacts bump to 0.8.1.

### Fixed — `@takuhon/cli`

- `create-takuhon` scaffolded a `package.json` pinning `@takuhon/api` / `@takuhon/cloudflare` / `@takuhon/core` at `^0.6.0`, two minors behind the published `0.8.0` generation (a `^0.6.0` caret does not even resolve `0.8.x` under 0.x semver). The pins now track the current published minor (`^0.8.0`), and a new guard test derives the expected range from the CLI's own version so a missed bump fails CI instead of silently shipping a stale range. The per-release checklist in `docs/publishing.md` now calls out advancing the scaffold pins on a minor bump.

### Changed — `@takuhon/cli`

- The package `README.md` is brought current: it dropped the stale "Phase 1 skeleton" placeholder and now documents the implemented commands (`validate`, `migrate`, `restore`, `export`, `import`, `build`, `dev`) and `create-takuhon` scaffolding, with installation and usage. The README ships in the npm tarball, so this corrects the package's npm landing page.

### Lockstep version bump

- All six publishable artifacts bump from `0.8.0` to `0.8.1`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. Only `@takuhon/cli` changed (the scaffold pins and README); the other five bump for lockstep alignment.

## [0.8.0] - 2026-06-04

Minor release. Completes the Phase 1 local-profile lifecycle in `@takuhon/cli`: the data-management commands `migrate` / `restore` and `export` / `import`, the `build` static-site generator, and the `dev` local preview server — the "edit → validate → migrate → build → preview" loop the Phase 1 spec (§5.7, §13, §14.1) promises. This bundles four CLI feature PRs landed since 0.7.0 (which shipped `validate`). The only cross-package change is the relocation of `applyPublicPrivacyFilter` from `@takuhon/api` into `@takuhon/core` (re-exported from `@takuhon/api` for back-compat), so the CLI applies the same privacy projection as the live API without depending on `hono`. There is no schema change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all six publishable artifacts bump to 0.8.0.

### Added — `@takuhon/cli`

- `takuhon migrate [path] [--to <v>]` forward-migrates a `takuhon.json` to a newer schema version (default target: the latest `SCHEMA_VERSION`), reading the source version from the file's own `schemaVersion`. It writes a timestamped pre-migration backup to a `.takuhon-backups/` directory co-located with the file before writing, supports `--out <file>` to write elsewhere and `--dry-run` to preview without writing, and writes atomically (write-temp-then-rename). Exit codes: `0` migrated (or already current), `1` source is not a valid profile, `2` operational error.
- `takuhon restore --from <backup>` restores a profile from a backup file, taking a `pre-restore-<timestamp>.json` backup of the current file first. It prompts before overwriting on a TTY (`--yes` skips the prompt; non-TTY pipelines refuse to overwrite without `--yes`, the safe default). Exit codes mirror the other commands.
- `takuhon export [path] [--output <file>]` serialises a `takuhon.json` to stdout (or to `--output`), faithfully (no coercion beyond refreshing `meta.updatedAt`). Refuses `--output` equal to the source. `takuhon import <file> [path]` imports an exported profile into a `takuhon.json`, migrating it to the current schema version, validating, taking a `pre-import-<timestamp>.json` backup, then writing — backup-first rather than prompting.
- `takuhon build [path] [--output <dir>] [--base-url <url>]` renders a `takuhon.json` into a deployable static site (Spec §13 Static Edition): one self-contained HTML page per locale with build-time Schema.org JSON-LD, reusing `@takuhon/core` only (no bundler). The default locale is written to `<dir>/index.html` and each other locale to `<dir>/<locale>/index.html`. The public privacy filter is applied; all profile-derived text is HTML-escaped, the JSON-LD payload is unicode-escaped, and `href`/`src` values are scheme-checked (http/https/mailto/relative only). Canonical and `hreflang` links are emitted only with `--base-url` (validated http(s)); the locale switcher uses relative links. Asset URLs are referenced as-is, not copied.
- `takuhon dev [path] [--port <n>] [--base-url <url>]` serves a `takuhon.json` as a local static preview — the same per-locale surface `build` produces, served over `node:http` (no bundler, no remote/secret coupling) and re-rendered on every request so edits show on reload. Default port `4321`. It binds to loopback (`127.0.0.1`) only so a preview never exposes draft content to the network; a currently-invalid file is served as a live error page with JSON-Pointer details rather than crashing the server; and it shuts down gracefully on `SIGINT`/`SIGTERM`. The server's request handling is factored into pure, unit-testable functions (site generation, route resolution, request handling) split from the thin `node:http` wrapper. Exit codes: `0` served then stopped, `2` bad arguments / missing file / port in use.

### Changed — `@takuhon/core`, `@takuhon/api`

- `applyPublicPrivacyFilter` (the projection that applies `meta.privacy` to produce the public view) moved from `@takuhon/api` into `@takuhon/core` and is now exported from `@takuhon/core`. It is a pure transform over core types, so it belongs in core; `@takuhon/api` re-exports it for backward compatibility, so existing imports of `applyPublicPrivacyFilter` from `@takuhon/api` keep working with no behavior change. This lets `@takuhon/cli` (`build` / `dev`) apply the same privacy projection as the live API without taking a dependency on `hono`. No schema change; `schemaVersion` stays `0.4.0`.

### Changed — bare-name `takuhon`

- The bare-name redirect's `bin.mjs` now imports and calls the `@takuhon/cli` entry's exported `run()` rather than re-implementing dispatch. Confining `process.exit` to that single boundary keeps the CLI entry import-safe (tests and the bare-name shim can import it without terminating the process).

### Lockstep version bump

- All six publishable artifacts bump from `0.7.0` to `0.8.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. `@takuhon/cli` and `@takuhon/core` changed functionally (and `@takuhon/api` gained a re-export); `@takuhon/ui` and `@takuhon/cloudflare` bump for lockstep alignment.

## [0.7.0] - 2026-06-02

Minor release. Lands the `takuhon validate` command in `@takuhon/cli` — the first runtime CLI subcommand the docs and the Phase 1 spec promise beyond scaffolding. This is a CLI-only feature with no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all six publishable artifacts bump to 0.7.0.

### Added — `@takuhon/cli`

- `takuhon validate [path]` validates a `takuhon.json` (default `./takuhon.json`) against `@takuhon/core`'s `validate`, reporting each failure as a JSON-pointer plus message. Exit codes: `0` valid, `1` invalid (parsed but failed schema validation), `2` operational error (bad arguments, a missing or unreadable file, or invalid JSON). `validate --help` prints usage and extra path arguments are rejected. The argument handling and validation live in a pure, unit-testable `runValidate(args)` module returning `{ code, stdout, stderr }`, covered by ten tests.

### Lockstep version bump

- All six publishable artifacts bump from `0.6.1` to `0.7.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. Only `@takuhon/cli` changed functionally; the other five bump for lockstep alignment.

## [0.6.1] - 2026-06-01

Patch release. Corrects version drift in `@takuhon/cli`: the `create-takuhon` scaffolder emitted a stale `schemaVersion` and pinned stale `@takuhon/*` dependency ranges, and `takuhon --version` reported a stale hardcoded value. There is no `@takuhon/core` change — the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. Per the lockstep release policy all six publishable artifacts bump to 0.6.1.

### Fixed — `@takuhon/cli`

- `create-takuhon` scaffolded a `takuhon.json` stamped with `schemaVersion` `0.2.0` and a `package.json` pinning `@takuhon/api` / `@takuhon/cloudflare` / `@takuhon/core` at `^0.2.0` — both stale against the current generation. The generated `takuhon.json` now stamps `schemaVersion` `0.4.0` (the canonical `SCHEMA_VERSION`) and its body is again an exact copy of `examples/minimal-profile/takuhon.json`: the nine always-empty optional arrays are dropped, and since core coerces a missing optional array to `[]` on validate/normalize the parsed output is unchanged. The scaffolded dependencies now pin `^0.6.0`. A new test asserts the scaffolded `schemaVersion` equals `@takuhon/core`'s `SCHEMA_VERSION` — the drift guard the scaffold previously lacked. (The stale `0.2.0` still validated because it sits inside `SUPPORTED_SCHEMA_VERSIONS`, which is why the drift went unnoticed.)
- `takuhon --version` reported a hardcoded `0.2.0` while the package was `0.6.0`. It is now derived from `package.json` at runtime, so it tracks the published release and cannot drift again. The generator docstring that incorrectly claimed the scaffolded Worker imports `hono` directly was corrected at the same time.

### Lockstep version bump

- All six publishable artifacts bump from `0.6.0` to `0.6.1`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. Only `@takuhon/cli` changed functionally; the other five bump for lockstep alignment.

## [0.6.0] - 2026-06-01

Minor release. This release lands the Phase 2 UI fixed-text internationalization for `@takuhon/ui` (the spec §8.5 i18n pass), clearing the i18n backlog carried forward since 0.3.0. The UI-generated fixed labels — the ongoing-period marker (`Present`), certification `No expiration`, patent `Filed` / `Granted`, the `with` co-author / co-inventor prefix, and the language-proficiency and patent-status enums — now resolve through a new `getUILabel(key, locale)` dictionary; the `YearMonth` values shown across the dated sections render in the resolved locale via a new `formatYearMonth(value, locale)` helper (`Intl.DateTimeFormat`); and the section `<h2>` headings, the screen-reader / `aria-label` chrome, and the contact-form label are localized too. English (the fallback) and Japanese ship. The localized section components gain an optional `locale?: LocaleTag` prop (default `'en'`, non-breaking), wired from `TakuhonProfile`'s `resolvedLocale`. This is a UI-only release with no `@takuhon/core` change: the bundled `schemaVersion` stays `0.4.0`, `SUPPORTED_SCHEMA_VERSIONS` is unchanged, and no migration is required. One visible behavior change beyond i18n itself: the English default date format moves from `2024-05` to `May 2024` — the intended locale-aware rendering, not a regression — while the `<time dateTime>` machine-readable value is unchanged. Per the lockstep release policy all six publishable artifacts bump to 0.6.0.

### Added — `@takuhon/ui`

- UI fixed-label internationalization (the spec §8.5 Phase 2+ i18n pass for fixed labels). A new `getUILabel(key, locale)` helper (`packages/ui/src/lib/ui-labels.ts`) resolves the UI-generated fixed labels — the ongoing-period marker (`Present`), certification `No expiration`, patent `Filed` / `Granted`, the co-inventor / co-author prefixes (`with`), and the language-proficiency and patent-status enums — from a shipped dictionary keyed by `LocalizedTakuhon.resolvedLocale`. English (the fallback) and Japanese ship today; the dictionary is `Record<LocaleTag, …>` so further locales drop in without a code change, and a regional tag (e.g. `ja-JP`) resolves through its base language (`ja`), mirroring core's `resolveLocale`. This clears every `TODO(i18n-phase-2)` marker in the section components and generalizes the former per-component `PROFICIENCY_LABEL` / `STATUS_LABEL` English-only maps.
- Locale-aware date formatting (the spec §8.5 Phase 2+ date-locale item). A new `formatYearMonth(value, locale)` helper (`packages/ui/src/lib/date-formatter.ts`) renders the `YearMonth` (`YYYY-MM`) values shown across the dated sections in the resolved locale — e.g. `2024-05` renders as `May 2024` in English, and as the locale-appropriate form in Japanese — via `Intl.DateTimeFormat` (`year: 'numeric', month: 'short'`). It constructs and formats the date entirely in UTC to avoid the `new Date('YYYY-MM')` timezone shift (which would render the previous month west of UTC), and returns a value that is not a well-formed `YearMonth` unchanged. The enclosing `<time dateTime>` keeps the raw ISO string, so the machine-readable value is unchanged.
- Localized UI chrome text — section headings, accessibility affixes, and the contact-form label (the spec §8.5 Phase 2+ item, now broadened to all UI chrome). The `getUILabel` dictionary gains `section.*` (the 15 `<h2>` section headings), `a11y.*` (the `Status:` / `Cause:` screen-reader prefixes, the `Tags` / `Profile links` `aria-label`s, the skills-list `aria-label` suffix, and the language-switcher `aria-label`), and `contact.formLink`. English and Japanese ship. The `aria-labelledby` ids are independent of the heading text, so the section/region wiring is unaffected. The `Footer` `Powered by` attribution stays English (brand chrome).

### Changed — `@takuhon/ui`

- The localized section components (`CareerTimeline`, `EducationTimeline`, `Memberships`, `ProjectsList`, `Volunteering`, `Certifications`, `Patents`, `Publications`, `Languages`) now accept an optional `locale?: LocaleTag` prop (default `'en'`), and `TakuhonProfile` forwards `data.resolvedLocale` to each. The prop is optional and English-defaulted, so existing consumers of an individual section component are unaffected. No schema change: this is a UI-only change with no `@takuhon/core` involvement; the bundled `schemaVersion` stays `0.4.0` and no migration is required.
- All 12 dated section components now render their dates through `formatYearMonth`, so the visible date text follows the resolved locale while the `<time dateTime>` attribute keeps the raw ISO `YearMonth`. The English default path changes too — dates render as `May 2024` rather than `2024-05` — which is the intended locale-aware behavior, not a regression. Four components that previously carried no localized text — `HonorsList`, `Courses`, `TestScores`, `Recommendations` — gain the same optional `locale?: LocaleTag` prop (default `'en'`) and are now wired through `TakuhonProfile`. Still no schema change; `schemaVersion` stays `0.4.0`.
- `SkillsList`, `ContactInfo`, and `LinksList` gain the optional `locale?: LocaleTag` prop (default `'en'`), wired through `TakuhonProfile`; `LocaleSwitcher` derives its default `aria-label` from its existing `currentLocale`. With this the section `<h2>` headings and the screen-reader / `aria-label` chrome are localized, completing the UI fixed-text i18n. Still no schema change; `schemaVersion` stays `0.4.0`.

### Lockstep version bump

- All six publishable artifacts bump from `0.5.0` to `0.6.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. Only `@takuhon/ui` changed functionally; the other five packages bump for lockstep alignment.

## [0.5.0] - 2026-05-31

Minor release. This is the first release to ship the `testScores` (the LinkedIn `Test_Scores.csv` equivalent) and `recommendations` (the LinkedIn `Recommendations_Received.csv` equivalent) top-level arrays — both added to `@takuhon/core` since v0.4.0 — together with the `@takuhon/ui` `TestScores` and `Recommendations` section components that render them. The bundled `schemaVersion` advances from `0.2.0` (shipped in v0.4.0) to `0.4.0`, and `SUPPORTED_SCHEMA_VERSIONS` now spans `0.1.0` through `0.4.0`; the forward migrations `v0.2.0-to-v0.3.0` and `v0.3.0-to-v0.4.0` chain so every existing profile still validates and migrates forward unchanged. Also ships the admin full-document export endpoint (`GET /api/admin/export`). Per the lockstep release policy all six publishable artifacts bump to 0.5.0.

### Added — `@takuhon/core`

- `testScores` top-level array — standardized test / exam scores (the LinkedIn `Test_Scores.csv` equivalent). Each entry carries `id`, a localized `title`, a free-form `score` string (e.g. `"112 / 120"`, `"330"`, `"N1 Pass"`, or a percentile — stored verbatim; the validator does not interpret it), a `date` (year-month), and optional `relatedEducationId` (a reference to an `education[].id`, the same idiom as `courses[].relatedEducationId`), localized `description`, `url`, and `order`. The array is optional and a missing value coerces to `[]`, mirroring the nine arrays added in 0.2.0. Scores are always public (no `meta.privacy` flag, like `honors` / `courses`) and are intentionally **not** emitted in JSON-LD: Schema.org has no established test-score type, so structured output stays a known gap until a suitable vocabulary stabilizes. Size limits: `testScores[]` ≤ 30 entries, `score` ≤ 50 chars, `title` ≤ 200 chars, `description` ≤ 5000 chars.
- Forward migration `v0.2.0-to-v0.3.0`. The bundled `schemaVersion` advances **0.2.0 → 0.3.0** (a backward-compatible MINOR schema addition; the schema `$id` follows) and the migration initialises a missing `testScores` to `[]` — additive, conditional-spread, existing fields untouched. `SUPPORTED_SCHEMA_VERSIONS` now accepts `0.1.0` / `0.2.0` / `0.3.0`, so every existing document still validates unchanged, and the registry chains `0.1.0 → 0.3.0` automatically. The `@takuhon/ui` renderer displays test scores as of this release (see the `@takuhon/ui` section below).
- `recommendations` top-level array — owner-curated testimonials (the LinkedIn `Recommendations_Received.csv` equivalent). Each entry carries `id`, a localized `body` (the testimonial text), and an `author` object (`name` required, plus optional localized `headline` and a `url` for external verification), with optional localized `relationship`, `date` (year-month), `relatedCareerId` / `relatedEducationId` (references to `careers[].id` / `education[].id`), and `order`. The array is optional and a missing value coerces to `[]`. The model is deliberately **owner-curated**: the profile owner self-enters recommendations they received (porting their LinkedIn export), and there is no server-side submission, moderation, or verification — trust is owner-assertion plus the optional `author.url`, keeping takuhon aligned with its self-owned, platform-independent, no-database principles. Recommendations are always public (no `meta.privacy` flag); obtaining consent to display a recommender's name is the owner's responsibility. They are intentionally **not** emitted in JSON-LD: Schema.org `Review` is technically possible but self-published reviews are an SEO/trust grey zone, so structured output stays a known gap to revisit. Size limits: `recommendations[]` ≤ 50 entries, `author.name` ≤ 100 chars, `body` ≤ 5000 chars, `headline` / `relationship` ≤ 200 chars.
- Forward migration `v0.3.0-to-v0.4.0`. The bundled `schemaVersion` advances **0.3.0 → 0.4.0** (a backward-compatible MINOR schema addition; the schema `$id` follows) and the migration initialises a missing `recommendations` to `[]` — additive, conditional-spread, existing fields untouched. `SUPPORTED_SCHEMA_VERSIONS` now also accepts `0.4.0`, so every existing document still validates unchanged, and the registry chains `0.1.0 → 0.4.0` automatically. The `@takuhon/ui` renderer displays recommendations as of this release (see the `@takuhon/ui` section below).

### Added — `@takuhon/ui`

- Two new mobile-first section components that render the `testScores` (0.3.0) and `recommendations` (0.4.0) arrays:
  - `TestScores` — sits in the spec §8.2 **Capabilities** group, immediately after `Languages`. Each entry shows the localized `title` (a `url` link when present), the free-form `score` (emphasized) with the `date` (`<time dateTime>`), and the optional localized `description`. Sorted by `order` ascending then `date` descending.
  - `Recommendations` — sits in the spec §8.2 **Recognition & service** group, between `HonorsList` and `Volunteering`, keeping received recognition (`honors` + `recommendations`) adjacent. The testimonial `body` uses `<blockquote>` semantics with the author attribution — name (a `url` link when present), optional `headline`, `relationship`, and `date` — placed outside the quote per the HTML spec. Sorted by `order` ascending then `date` descending, with undated entries last.
- Both accept a single locale-resolved prop (`LocalizedTestScore[]` / `LocalizedRecommendation[]`), return `null` on empty input, and reuse the established `.section` / `.heading` / `.list` / `.item` CSS-module conventions plus `tokens.css` — no new design tokens. The section headings (`Test Scores`, `Recommendations`) are hard-coded English pending the Phase 2 i18n pass.

### Changed — `@takuhon/ui`

- `TakuhonProfile` now composes 18 sections (was 16): `Recommendations` slots in after `HonorsList` and `TestScores` after `Languages`, per the spec §8.2 semantic-kinship grouping.

### Added — `@takuhon/api`

- `GET /api/admin/export` — full-document export for the profile owner. Returns the complete stored document (the raw `exportTakuhon()` transport form, no `{ data, meta }` envelope) with the public privacy filter **bypassed**, so a token holder retrieves `credentialId` / `grade` / `email` and every other field for backup or portability. Requires the admin Bearer token (it is mounted under the admin app at `/api/admin`), returns `404` when no profile is stored, carries `Cache-Control: private, no-store`, preserves the stored `meta.updatedAt` (no export-time restamp), and emits an `admin.profile.export` audit event. This resolves a prior contradiction: `/api/export` was advertised in `.well-known/takuhon.json` but unimplemented (404), and the spec disagreed with itself on its auth (none vs token). It is now admin/full and relocated to `/api/admin/export`.

### Changed — `@takuhon/api`

- The `.well-known/takuhon.json` `export` field now points to `/api/admin/export` (was `/api/export`, which never resolved).

### Release engineering

- `release.yml` bumps `softprops/action-gh-release` from v2.6.2 (Node 20) to v3.0.0 (Node 24). The action's `v2` line never moved off the Node 20 runtime, and per GitHub's Node 20 deprecation notice the runners begin defaulting to Node 24 on 2026-06-16, with Node 20 removed later in fall 2026. v3.0.0 is a runtime-only major — no input or behavior change — so the `github-release` job's `tag_name` / `name` / `generate_release_notes` / `fail_on_unmatched_files` / `files` inputs are unchanged. `sigstore/cosign-installer@v3` is a composite action and is unaffected by the Node 20 deprecation. CI tooling only; no published package contents change.

### Internal

- Added the missing `TODO(i18n-phase-2)` marker to the `with` co-author prefix in `Publications`. The 0.4.0 i18n-marker pass flagged the analogous `with` prefix in `Patents` but skipped this one; both hard-coded `with` strings are now marked consistently for the Phase 2 i18n extraction. No render change.

### Lockstep version bump

- All six publishable artifacts bump from `0.4.0` to `0.5.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect.

## [0.4.0] - 2026-05-29

Minor release. The headline is **URL path locale resolution**: a leading `/{locale}` path segment (e.g. `/ja/api/profile`, `/ja/`) now resolves the locale server-side at priority #2 (between the `?lang=` query and the `takuhon_locale` cookie), and `@takuhon/ui` advertises that path form as the canonical locale URL in `hreflang` / `canonical` / `og:url`. This release also adds the `GET /health` liveness endpoint, a privacy-filter fixture-leak regression test, and clears the 0.3.0 deferred-findings backlog (i18n markers, test-readability refactors, Tier 1 example fixtures). No schema, JSON-LD, or storage change — `schemaVersion` stays `0.2.0` and every 0.3.0 profile validates against 0.4.0 unchanged. Per the lockstep release policy all six publishable artifacts bump to 0.4.0.

### Added — `@takuhon/api`

- URL path locale prefix resolution. A leading `/{locale}` segment — e.g. `GET /ja/api/profile`, `/ja/api/jsonld`, `/ja/` — now resolves the locale at priority #2, between the `?lang=` query (#1) and the `takuhon_locale` cookie (#3). Implemented via a shared Hono `getPath` (`localePrefixGetPath`) that strips the prefix before route matching, plus a remainder allowlist (`LOCALE_AWARE_REMAINDERS`) that keeps locale-agnostic paths (`/health`, `/api/schema`, `/.well-known/takuhon.json`, `/takuhon.json`) and admin paths (`/api/admin/*`, `/admin/*`) from being misread as a locale. A BCP-47-shaped but unavailable prefix (e.g. `/fr/` on an en/ja document) falls through to the next tier and serves the default locale with a 200, mirroring `?lang=` semantics. New exports: `stripLocalePrefix`, `localePrefixGetPath`, `pathLocaleFromUrl`, `LOCALE_AWARE_REMAINDERS`.
- `GET /health` liveness endpoint. Returns `200 { status: 'ok', schemaVersion }` with `Cache-Control: no-store`. It is a storage-independent _liveness_ probe — it returns 200 even when the profile store is unreachable, so uptime monitors can confirm both that the worker is serving and which schema version is deployed without touching storage. The endpoint was listed in the spec endpoint table (Spec §7.1 / api.md §1) but previously unimplemented, so a bare `GET /health` 404'd on every deployment; this establishes its payload contract. `HEAD /health` is auto-mapped through the GET handler by Hono; other methods fall through to the existing 405 catch-all.
- `applyPublicPrivacyFilter` is now a public export. The helper has existed internally since 0.2.0 (it powers the public read endpoints); exporting it lets a consumer rendering profile data outside the built-in app apply the same `hideCredentialIds` / `hideEducationGrades` / `showEmail` stripping the server does.

### Changed — `@takuhon/cloudflare`

- The worker's top-level router now applies `localePrefixGetPath`. This is the production-critical placement: Hono's `route()` flattens each mounted sub-app's routes into the top-level router and dispatches with that router's `getPath` only, so the prefix is stripped consistently for both the public app and direct requests. Admin mounts remain locale-agnostic via the remainder allowlist.

### Changed — `@takuhon/ui`

- `TakuhonHead` now advertises the **path form** (`/ja/...`) as the canonical locale URL. `<link rel="canonical">`, `og:url`, and the `hreflang` alternates (including `x-default`) emit `/{locale}/path` instead of `?lang={locale}`, consolidating SEO signals on one URL per locale and avoiding duplicate content. The builder is locale-neutral-aware: when the current page is already locale-prefixed it **replaces** the segment rather than stacking (`/ja/profile` + `en` → `/en/profile`, never `/en/ja/profile`), and it drops any legacy `?lang=` query. `?lang=` remains a valid resolution input on the server but is no longer advertised.

Scope note: `TakuhonHead` is deployment-agnostic — it inserts a locale segment into whatever page URL it is given. The built-in `@takuhon/api` public app honors path prefixes for its own surfaces (`/` landing, `/api/profile`, `/api/jsonld`) per the `LOCALE_AWARE_REMAINDERS` allowlist; the canonical deployment serves the rendered HTML profile at the site root, so its advertised `/ja/` form is resolved out of the box. A deployment that serves the HTML profile at a non-root path owns routing those locale-prefixed page paths itself (the public app serves JSON, not the rendered profile). No schema, storage, or migration change — `schemaVersion` stays `0.2.0` and all 0.3.0 profiles validate unchanged. Per the lockstep release policy this ships as part of the 0.4.0 minor across all packages.

### Changed — `@takuhon/playground`

- The demo now syncs locale changes to the path form (`/ja/`) via `history.replaceState` and reads a leading `/{locale}` segment as an initial-locale candidate (priority #2, after `?lang=`), mirroring the server resolution order. Relies on the Vite dev server's SPA fallback to serve `/ja/` from `index.html` on reload.
- The demo now runs profile data through `applyPublicPrivacyFilter` before rendering, so its JSON-LD and DOM match the public surface (previously it rendered the unfiltered document, exposing the `credentialId` / `grade` / `email` that the real public endpoints strip).

### Changed — examples

- `examples/personal-profile/takuhon.json` gains Tier 1 fixture entries so every populated 0.2.0 schema array renders against the canonical fixture (which also drives the workspace a11y audit): two `certifications` (IAAP CPACC with no expiration, IAAP WAS expiring 2026-03), one `honors` entry (W3C WAI Recognized Contributor), one `education` entry (BSc Cognitive Science, including a `grade` that demonstrates the `hideEducationGrades` privacy default), and two `languages` (English native, Portuguese intermediate, the latter matching the existing Portuguese skill). Certification URLs are generic (`/cpacc`, `/was`) rather than embedding the `credentialId` in the path, so the privacy demo is not undermined.

### Internal

- i18n TODO markers added to nine hard-coded English UI strings across seven components — `Present` (`CareerTimeline` / `EducationTimeline` / `Memberships` / `ProjectsList` / `Volunteering`), `No expiration` (`Certifications`), and `Filed` / `Granted` / `with` (`Patents`) — matching the existing `STATUS_LABEL` pattern so the Phase 2 i18n pass can extract them in one sweep. Accompanied by test-readability refactors: named constants for `array[index]!` access and extracted `prepareWith` / `createMinimalFixture` helpers in the core `jsonld` omission tests.
- Privacy-filter fixture-leak regression test. The existing privacy tests assert field-level stripping; this guards a separate leak class where a stripped value (a `credentialId`, `grade`, or `email`) re-appears embedded in a sibling field the filter does not touch — most obviously a `credentialId` inside `certifications[*].url`. For each public endpoint (`/api/profile`, `/api/jsonld`, `/takuhon.json`) the serialized response body is asserted to contain none of the current fixture's sensitive substrings. The substring list is intentionally coupled to the current fixture values and must be updated on a fixture refresh (documented inline).

### Known limitations carried forward

- Phase 2 i18n is still unresolved. The hard-coded English UI strings now carry `TODO(i18n-phase-2)` markers (see Internal above) but are not yet extracted; the `Patents` status labels, the `with` author/inventor prefix, the `Present` ongoing-date label, and the `Filed` / `Granted` patent-date labels remain English until the Phase 2 i18n pass lands.
- Schema.org `Patent` type is still pending in the vocabulary; `patents[*]` continues to map to `CreativeWork` + `additionalType` pointing at the pending `https://schema.org/Patent` URL (carried over from 0.2.0).
- The `jsonld.test.ts` `subjectOf` omission test still seeds from the canonical example fixture and manually empties each `subjectOf`-contributing array, so a future fixture that gains such an array needs a matching reset line. The `createMinimalFixture()` helper added this release covers the separate empty-document omission test; a fully fixture-independent rewrite of the `subjectOf` test remains a candidate refactor.

### Lockstep version bump (no functional changes beyond the above)

- All six publishable artifacts bump from `0.3.0` to `0.4.0`: `@takuhon/core`, `@takuhon/api`, `@takuhon/ui`, `@takuhon/cli`, `@takuhon/cloudflare`, and the bare-name `takuhon` redirect. The functional changes in this release land in `@takuhon/api` (URL path locale resolution, `GET /health`), `@takuhon/cloudflare` (top-level `getPath` placement), and `@takuhon/ui` (path-form SEO); `@takuhon/core` and `@takuhon/cli` bump for lockstep alignment only.

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
- `.github/workflows/release.yml` (renamed from `publish.yml` to match the conventional `release.yml` name shared across the project family) is rewritten into four jobs:
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

[Unreleased]: https://github.com/takuhon-dev/takuhon/compare/v0.25.0...HEAD
[0.25.0]: https://github.com/takuhon-dev/takuhon/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/takuhon-dev/takuhon/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/takuhon-dev/takuhon/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/takuhon-dev/takuhon/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/takuhon-dev/takuhon/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/takuhon-dev/takuhon/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/takuhon-dev/takuhon/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/takuhon-dev/takuhon/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/takuhon-dev/takuhon/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/takuhon-dev/takuhon/compare/v0.15.1...v0.16.0
[0.15.1]: https://github.com/takuhon-dev/takuhon/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/takuhon-dev/takuhon/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/takuhon-dev/takuhon/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/takuhon-dev/takuhon/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/takuhon-dev/takuhon/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/takuhon-dev/takuhon/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/takuhon-dev/takuhon/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/takuhon-dev/takuhon/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/takuhon-dev/takuhon/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/takuhon-dev/takuhon/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/takuhon-dev/takuhon/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/takuhon-dev/takuhon/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/takuhon-dev/takuhon/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/takuhon-dev/takuhon/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/takuhon-dev/takuhon/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/takuhon-dev/takuhon/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/takuhon-dev/takuhon/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/takuhon-dev/takuhon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/takuhon-dev/takuhon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/takuhon-dev/takuhon/releases/tag/v0.1.0
