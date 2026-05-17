# Creator profile example

Maya Okuda is a fictional illustrator and zine maker based in Kyoto, Japan. This example shows how to represent a creative practitioner whose work centers on projects (zines, murals, exhibitions, animation direction) rather than a long employment chain.

This example highlights:

- `projects` as the central narrative (6 entries, with `highlighted: true` on two of them)
- `tags` used to group work across years (illustration, zine, mural, animation, etc.)
- A `type: "custom"` link with the required `iconUrl` (online shop)
- `skills.category` populated with `art`, `design`, and `language`
- A multilingual profile (`en` + `ja`) including a localized `profile.location.display`
- `contact.showEmail: false` paired with `formUrl` as the contact channel
- `meta.contentLicense.spdxId` set to `CC-BY-NC-4.0` so non-commercial reuse with attribution is explicitly allowed while commercial reuse requires direct contact

It doubles as a test fixture in `packages/core/src/__tests__/examples-fixtures.test.ts`.

Copy this template when your profile is portfolio-driven and you want non-commercial reuse to be unambiguous.
