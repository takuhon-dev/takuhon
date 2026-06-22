/**
 * Pure helpers for the widget↔server protocol: building the POST payload and
 * mapping a server error code to a user-facing message key. Kept DOM-free so
 * they are unit-testable.
 */

import type { ContactLocale, RawSubmission } from '../types.js';

import type { MessageKey } from './i18n.js';

/** The data the widget collects across the chat steps. */
export interface SubmissionState {
  email: string;
  message: string;
  token: string;
  /** Honeypot field value — empty for a human. */
  honeypot: string;
  locale: ContactLocale;
  pageUrl?: string;
}

/** Build the JSON body POSTed to the contact endpoint. */
export function buildSubmission(state: SubmissionState): RawSubmission {
  return {
    email: state.email,
    message: state.message,
    locale: state.locale,
    token: state.token,
    hp: state.honeypot,
    ...(state.pageUrl ? { pageUrl: state.pageUrl } : {}),
  };
}

/** Map a server error code (from the JSON body) to the bot message to show. */
export function messageKeyForError(
  code: string | undefined,
): Extract<MessageKey, 'errorEmail' | 'errorChallenge' | 'errorGeneric'> {
  switch (code) {
    case 'email_invalid':
    case 'email_missing':
    case 'email_too_long':
      return 'errorEmail';
    case 'challenge_failed':
      return 'errorChallenge';
    default:
      return 'errorGeneric';
  }
}
