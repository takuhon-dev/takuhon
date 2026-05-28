/**
 * @takuhon/api — Hono-based HTTP handlers and response builders for takuhon.
 *
 * Phase 3.3 introduced the public-app factory and the RFC 7807 envelope
 * helpers. Phase 3.4 adds the admin app factories (PUT/DELETE profile and
 * the inline `/admin` HTML editor) plus the `CachePurger` / `AuditLogger`
 * dependency-injection interfaces that adapters bind to a runtime.
 */

export {
  ERROR_SLUGS,
  buildProblem,
  problemResponse,
  type ErrorSlug,
  type ProblemDetails,
  type ProblemFieldError,
  type BuildProblemInput,
  type ProblemResponseInput,
} from './error-envelope.js';
export { createPublicApp, type PublicAppDeps } from './public-app.js';
export { applyPublicPrivacyFilter } from './privacy-filter.js';

export { createAdminApiApp, type AdminApiAppDeps } from './admin/admin-api-app.js';
export { createAdminUiApp } from './admin/admin-ui-app.js';
export {
  noopAuditLogger,
  type AuditEvent,
  type AuditEventType,
  type AuditLogger,
} from './admin/audit-logger.js';
export { noopCachePurger, type CachePurger } from './admin/cache-purger.js';
