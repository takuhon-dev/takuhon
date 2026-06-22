/**
 * Core types for the takuhon contact-form pipeline.
 *
 * These are runtime-agnostic: no Cloudflare, Node, or framework imports. The
 * two interfaces ({@link ChallengeVerifier}, {@link EmailTransport}) are the
 * seams an adapter fills — e.g. a Cloudflare adapter provides a Turnstile
 * verifier and a `send_email` transport. Keeping them abstract is what lets the
 * same contact core run on any host (the takuhon "host anywhere" promise).
 */

/** Locales the widget and emails support. */
export type ContactLocale = 'ja' | 'en';

/** Server-derived metadata attached to an inquiry for triage. Never trusted for security. */
export interface InquiryMeta {
  /** Visitor country (e.g. from `request.cf.country`), if known. */
  country?: string;
  /** Visitor IP (e.g. from `CF-Connecting-IP`), if known. */
  ip?: string;
  /** ISO 8601 timestamp the inquiry was received. */
  receivedAt?: string;
}

/** A validated inquiry, ready to be delivered to the site owner. */
export interface Inquiry {
  /**
   * The visitor's reply-to email address. Validated to be a single address
   * with no CR/LF, so it is safe to place in a `Reply-To` header.
   */
  email: string;
  /** Free-text message body. Untrusted — render as plain text, escape for HTML. */
  message: string;
  /** UI locale the widget was shown in. */
  locale: ContactLocale;
  /** URL of the page the widget was embedded on, if the client provided it. */
  pageUrl?: string;
  /** The visitor's user agent, if available. */
  userAgent?: string;
  /** Best-effort, server-derived metadata. */
  meta?: InquiryMeta;
}

/** Optional context passed to a {@link ChallengeVerifier}. */
export interface ChallengeContext {
  /** The visitor's IP, if the host can supply it (improves Turnstile scoring). */
  remoteIp?: string;
}

/**
 * Verifies an anti-abuse challenge token (e.g. Cloudflare Turnstile).
 * Implementations MUST verify server-side; never trust a client claim of success.
 */
export interface ChallengeVerifier {
  verify(token: string, context?: ChallengeContext): Promise<boolean>;
}

/**
 * Delivers a validated {@link Inquiry} to its destination — for the MVP, the
 * site owner's verified inbox. Implementations set `From` / `Reply-To` / subject.
 */
export interface EmailTransport {
  send(inquiry: Inquiry): Promise<void>;
}

/** Tunable limits and policy for {@link validateSubmission} and the handler. */
export interface ContactConfig {
  /** Max message length in characters. Default 5000. */
  maxMessageLength?: number;
  /** Max email length in characters. Default 254 (RFC 5321 path limit). */
  maxEmailLength?: number;
  /** Max request body size in bytes. Default 16384 (16 KiB). */
  maxBodyBytes?: number;
  /**
   * Allowed page origins for the Origin/Referer check (e.g.
   * `['https://me.tak3.jp']`). Empty or omitted disables the check — use that
   * for same-origin deployments where the host already constrains callers.
   */
  allowedOrigins?: string[];
}

/** Dependencies injected into {@link handleContact}. */
export interface ContactDeps {
  /** Verifies the anti-abuse challenge (e.g. Turnstile). */
  verifier: ChallengeVerifier;
  /** Delivers the validated inquiry (e.g. via `send_email`). */
  transport: EmailTransport;
  /** Limits and policy. */
  config?: ContactConfig;
  /**
   * Optional extractor for server-derived metadata (e.g. country/IP from
   * `request.cf`). Runs after validation; its result is best-effort only.
   */
  readMeta?: (request: Request) => InquiryMeta;
  /** Clock injection for tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

/** The raw, untrusted JSON body a widget POSTs. Every field is unknown. */
export interface RawSubmission {
  email?: unknown;
  message?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  /** Anti-bot honeypot: must be empty/absent for a human submission. */
  hp?: unknown;
  /** Challenge token, verified separately by a {@link ChallengeVerifier}. */
  token?: unknown;
}

/** The clean subset extracted from a {@link RawSubmission} once validated. */
export interface ValidSubmission {
  email: string;
  message: string;
  locale: ContactLocale;
  pageUrl?: string;
}

/** Machine-readable validation failure reasons. */
export type ValidationError =
  | 'email_missing'
  | 'email_invalid'
  | 'email_too_long'
  | 'message_missing'
  | 'message_too_long'
  | 'honeypot';

/** Result of {@link validateSubmission}. */
export type ValidationResult =
  | { ok: true; value: ValidSubmission }
  | { ok: false; error: ValidationError; spam?: boolean };
