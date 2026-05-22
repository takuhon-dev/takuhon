# Minimal profile example

Sam Lee is a fictional new graduate who wants to publish _something_ immediately and grow the profile over time. This example is the deliberate counterpoint to `personal-profile/` — it includes only the schema-required fields, with every optional value omitted.

This example highlights:

- `profile` reduced to a single `displayName.en` (no tagline, no bio, no avatar, no location)
- Exactly one entry in each of `links`, `careers`, `projects`, and three minimal `skills` (id + label only, no `category`)
- `contact` as an empty object — schema-valid, no public contact channel
- `settings` with only `defaultLocale` + `availableLocales`; other flags fall back to their schema defaults
- `meta.contentLicense.spdxId` set to `CC0-1.0` (public domain) — the only required `meta` field; `createdAt`, `updatedAt`, `generator`, `attribution`, and `url` are all omitted
- A single-locale profile (`en` only), showing what `availableLocales: ["en"]` looks like in practice

It doubles as a test fixture in `packages/core/src/__tests__/examples-fixtures.test.ts` and is a useful sanity check that the schema's required surface really is small enough to start from.

Copy this template when you want to publish the smallest valid Takuhon profile and grow it gradually.
