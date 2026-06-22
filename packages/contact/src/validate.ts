/**
 * Pure, synchronous validation for an untrusted contact submission.
 *
 * No I/O and no challenge check (that is the verifier's job). The email rules
 * are deliberately strict — a single address with no CR/LF — so the result is
 * safe to drop into a `Reply-To` header without enabling email header
 * injection, the most important security invariant of this feature.
 */

import type { ContactConfig, ContactLocale, RawSubmission, ValidationResult } from './types.js';

/** Default limits, exported so adapters and the handler share one source of truth. */
export const DEFAULT_MAX_MESSAGE_LENGTH = 5000;
export const DEFAULT_MAX_EMAIL_LENGTH = 254;
export const DEFAULT_MAX_BODY_BYTES = 16384;

const SUPPORTED_LOCALES: readonly string[] = ['ja', 'en'];

/**
 * A deliberately strict, single-address email check. Rejects whitespace
 * (including CR/LF) and anything with more than one `@`.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True if the string contains a CR or LF (an email header-injection vector). */
export function hasLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

/**
 * Normalize an unknown locale claim to a supported {@link ContactLocale},
 * defaulting to `'ja'` (the house default locale).
 */
export function normalizeLocale(value: unknown): ContactLocale {
  if (typeof value === 'string') {
    const primary = value.trim().toLowerCase().split('-')[0];
    if (primary !== undefined && SUPPORTED_LOCALES.includes(primary)) {
      return primary as ContactLocale;
    }
  }
  return 'ja';
}

/**
 * Validate a raw, untrusted submission into a {@link ValidationResult}.
 *
 * A tripped honeypot returns `{ ok: false, error: 'honeypot', spam: true }` so
 * the caller can choose to feign success rather than reveal the trap.
 */
export function validateSubmission(raw: RawSubmission, config?: ContactConfig): ValidationResult {
  // Honeypot: any non-empty value means a bot filled a hidden field.
  if (typeof raw.hp === 'string' && raw.hp.trim() !== '') {
    return { ok: false, error: 'honeypot', spam: true };
  }

  const maxEmail = config?.maxEmailLength ?? DEFAULT_MAX_EMAIL_LENGTH;
  const maxMessage = config?.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH;

  // Email — required, single address, no CR/LF, within length, well-formed.
  if (typeof raw.email !== 'string') return { ok: false, error: 'email_missing' };
  const email = raw.email.trim();
  if (email === '') return { ok: false, error: 'email_missing' };
  if (email.length > maxEmail) return { ok: false, error: 'email_too_long' };
  if (hasLineBreak(email) || !EMAIL_RE.test(email)) return { ok: false, error: 'email_invalid' };

  // Message — required, non-empty after trim, within length. Newlines allowed in the body.
  if (typeof raw.message !== 'string') return { ok: false, error: 'message_missing' };
  const message = raw.message.trim();
  if (message === '') return { ok: false, error: 'message_missing' };
  if (message.length > maxMessage) return { ok: false, error: 'message_too_long' };

  const pageUrl = typeof raw.pageUrl === 'string' ? raw.pageUrl.trim() : '';
  return {
    ok: true,
    value: {
      email,
      message,
      locale: normalizeLocale(raw.locale),
      ...(pageUrl !== '' ? { pageUrl } : {}),
    },
  };
}
