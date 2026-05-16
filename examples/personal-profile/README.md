# Personal profile example

A reference [`ownport.json`](./ownport.json) that exercises every field of the
[`@ownport/core` schema](../../packages/core/ownport.schema.json). The profile
belongs to a fictional persona, **Pat Rivera**, an open-source maintainer based
in Lisbon. The example covers:

- Multilingual fields (`en` + `ja`) on `profile`, `careers`, `projects`, and `links`
- All link kinds across the `links` array, including a `type: "custom"` entry
  with `iconUrl`
- A current position (`endDate: null`, `isCurrent: true`) plus a past one
- A project tied to a career via `relatedCareerId`
- A `Skill` mix spanning the Spec §6.9 recommended categories (`programming`,
  `design`, `language`)
- All `Settings` flags (`theme`, `showPoweredBy`, `enableJsonLd`, `enableApi`,
  `enableAnalytics`) populated with their expected defaults
- A `meta.generator` plus `meta.contentLicense` set to `CC-BY-4.0` with attribution

It doubles as a test fixture in `packages/core/src/__tests__/example.test.ts`.
Use it as the starting template when scaffolding a real profile, or as a
reference when adding new fields to the schema.
