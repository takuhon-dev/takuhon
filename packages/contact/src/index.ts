/**
 * `@takuhon/contact` — portable, framework-agnostic contact-form core.
 *
 * Provides input validation, a stateless request pipeline ({@link handleContact}),
 * and the {@link ChallengeVerifier} / {@link EmailTransport} seams that adapters
 * fill. Host-specific wiring (e.g. Cloudflare Turnstile + `send_email`) lives in
 * the adapters; this package carries no Cloudflare, Node, or framework
 * dependency, so the same core runs anywhere.
 */

export { handleContact } from './handler.js';
export {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_EMAIL_LENGTH,
  DEFAULT_MAX_MESSAGE_LENGTH,
  hasLineBreak,
  normalizeLocale,
  validateSubmission,
} from './validate.js';
export type {
  ChallengeContext,
  ChallengeVerifier,
  ContactConfig,
  ContactDeps,
  ContactLocale,
  EmailTransport,
  Inquiry,
  InquiryMeta,
  RawSubmission,
  ValidSubmission,
  ValidationError,
  ValidationResult,
} from './types.js';
