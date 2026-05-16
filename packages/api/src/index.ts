/**
 * @meport/api — Hono-based HTTP handlers and response builders for meport.
 *
 * Phase 3.3 introduces the public-app factory and the RFC 7807 envelope
 * helpers. Admin-side factories land in Phase 3.4.
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
