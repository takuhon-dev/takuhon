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
// Re-exported from @takuhon/core (it is a pure transform over core types and
// now lives there); kept here for backwards compatibility.
export { applyPublicPrivacyFilter } from '@takuhon/core';
export {
  LOCALE_AWARE_REMAINDERS,
  localePrefixGetPath,
  pathLocaleFromUrl,
  stripLocalePrefix,
} from './locale-prefix.js';

export { createAdminApiApp, type AdminApiAppDeps } from './admin/admin-api-app.js';
export { createAdminUiApp } from './admin/admin-ui-app.js';
export { adminAssetSecurityHeaders } from './admin/admin-asset-headers.js';
export {
  noopAuditLogger,
  type AuditEvent,
  type AuditEventType,
  type AuditLogger,
} from './admin/audit-logger.js';
export { noopCachePurger, type CachePurger } from './admin/cache-purger.js';

// Pure, core-only static HTML rendering. `renderProfileHtml` powers both the
// server-rendered public profile page (the `GET /` route below) and the static
// pages emitted by `@takuhon/cli`'s `build`/`dev`; keeping it here lets every
// adapter serve the same markup the CLI writes to disk.
export {
  renderProfileHtml,
  escapeHtml,
  type RenderInput,
  type Alternate,
  type LocaleLink,
} from './html/build-html.js';
export { generateSite, type SitePage, type GenerateOptions } from './html/site.js';
export { renderCvHtml } from './html/cv-html.js';
