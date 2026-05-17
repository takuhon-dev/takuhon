# Freelancer profile example

Diego Hernández is a fictional independent backend and devops consultant based in Mexico City. This example shows how to represent someone running several engagements in parallel rather than holding a single full-time role.

This example highlights:

- Three concurrent `careers` entries with `isCurrent: true` (Harborline, AltaVista, Mercurial), each carrying its own `url` and scoped `description`
- A past employment chain (`rivermouth-migration`, `northport-staff`) preserved as bounded engagements
- Every `project` linked back to a specific career via `relatedCareerId`, demonstrating how portfolio work attaches to client work
- `skills.category` split between `programming` and `business` (contract scoping, incident response)
- A multilingual profile in `en` + `es` instead of the more common `en` + `ja`
- `contact.showEmail: true` paired with both `email` and `formUrl` — appropriate when the contact channel is a working asset
- `meta.contentLicense.spdxId` set to `CC-BY-4.0` so the case studies can be cited freely with attribution

It doubles as a test fixture in `packages/core/src/__tests__/examples-fixtures.test.ts`.

Copy this template when your work pattern is contract-based with multiple clients running in parallel and you want past engagements to read as a portfolio rather than a single resume timeline.
