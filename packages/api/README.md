# @takuhon/api

Hono-based HTTP route handlers, RFC 7807 Problem Details error envelope, and response builders for Takuhon.

Ships:

- `createPublicApp({ storage })` — the server-rendered profile page at `GET /` (and `/<locale>/`) with Schema.org JSON-LD embedded in the HTML, plus the public read endpoints (`/api/profile`, `/api/jsonld`, `/api/schema`, `/takuhon.json`) and `/.well-known/takuhon.json`
- `renderProfileHtml` / `generateSite` / `renderCvHtml` — pure, `@takuhon/core`-only static HTML rendering (no DOM, no bundler) shared by the `GET /` route and `@takuhon/cli`'s `build` / `dev`
- `createAdminApiApp({ storage, bearerToken, originAllowlist, cachePurger, auditLogger })` — `PUT`/`DELETE /api/admin/profile` with optimistic locking (`If-Match`), audit logging, and edge-cache purging
- `createAdminUiApp()` — minimal HTML admin editor (token + JSON textarea + Save/Delete)
- `CachePurger` and `AuditLogger` dependency-injection interfaces (with `noopCachePurger` / `noopAuditLogger` no-op implementations)
- `buildProblem` / `problemResponse` helpers and the `ProblemDetails` / `ErrorSlug` types for RFC 7807 error envelopes

The package is framework-agnostic Hono — adapters (`@takuhon/cloudflare`, `@takuhon/static`, …) compose these factories with a storage backend and a runtime.
