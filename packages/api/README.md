# @takuhon/api

Hono-based HTTP route handlers, RFC 7807 Problem Details error envelope, and response builders for Takuhon.

Ships:

- `createPublicApp({ storage })` — public profile read endpoints, JSON-LD output, `/.well-known/takuhon.json`
- `createAdminApiApp({ storage, bearerToken, originAllowlist, cachePurger, auditLogger })` — `PUT`/`DELETE /api/admin/profile` with optimistic locking (`If-Match`), audit logging, and edge-cache purging
- `createAdminUiApp()` — minimal HTML admin editor (token + JSON textarea + Save/Delete)
- `CachePurger` and `AuditLogger` dependency-injection interfaces (with `noopCachePurger` / `noopAuditLogger` no-op implementations)
- `buildProblem` / `problemResponse` helpers and the `ProblemDetails` / `ErrorSlug` types for RFC 7807 error envelopes

The package is framework-agnostic Hono — adapters (`@takuhon/cloudflare`, `@takuhon/static`, …) compose these factories with a storage backend and a runtime.
