/**
 * Cloudflare implementations of the `@takuhon/contact` adapter seams.
 *
 * Two pieces — a Turnstile {@link ChallengeVerifier} and a `send_email`-binding
 * {@link EmailTransport} — are the only Cloudflare-specific parts of the contact
 * feature. Everything else (validation, the request pipeline) lives in the
 * portable `@takuhon/contact` core, so the feature can be re-homed on another
 * host by swapping just these.
 */

import type { ChallengeVerifier, EmailTransport, Inquiry } from '@takuhon/contact';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Options for {@link createTurnstileVerifier}. */
export interface TurnstileVerifierOptions {
  /** Override the siteverify endpoint (for tests). */
  endpoint?: string;
  /** Injected `fetch` (for tests). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Create a {@link ChallengeVerifier} backed by Cloudflare Turnstile's
 * server-side `siteverify` endpoint. The secret is used server-side only and is
 * never exposed to the client.
 */
export function createTurnstileVerifier(
  secret: string,
  options?: TurnstileVerifierOptions,
): ChallengeVerifier {
  const endpoint = options?.endpoint ?? TURNSTILE_SITEVERIFY_URL;
  // Always invoke fetch as a free function (never as a method) so the runtime
  // never sees a rebound `this` — cf. the @takuhon/activity illegal-invocation fix.
  const doFetch: typeof fetch = options?.fetch ?? ((input, init) => fetch(input, init));

  return {
    async verify(token, context) {
      if (!token) return false;
      const form = new FormData();
      form.append('secret', secret);
      form.append('response', token);
      if (context?.remoteIp) form.append('remoteip', context.remoteIp);

      let response: Response;
      try {
        response = await doFetch(endpoint, { method: 'POST', body: form });
      } catch {
        return false;
      }
      if (!response.ok) return false;

      const outcome = (await response.json().catch(() => null)) as { success?: boolean } | null;
      return outcome?.success === true;
    },
  };
}

/**
 * Minimal structural shape of the Cloudflare `send_email` binding we depend on
 * (the object-form `send`). Declared here rather than imported so the adapter
 * does not pin a specific `@cloudflare/workers-types` shape; the real binding
 * satisfies it structurally.
 */
export interface SendEmailBinding {
  send(message: {
    to: string | string[];
    // A bare string `from` (address only) or the object form with a display
    // name. The Cloudflare binding's `EmailAddress` rejects the object form when
    // `name` is `undefined` ("Incorrect type for the 'name' field on
    // 'EmailAddress'"), so callers must pass a string when there is no name.
    from: string | { email: string; name: string };
    replyTo?: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
}

/** Configuration for {@link createSendEmailTransport}. */
export interface SendEmailTransportConfig {
  /** Verified destination address — the site owner's inbox. */
  to: string;
  /** From address; must be on a domain you control (e.g. `noreply@tak3.jp`). */
  from: { email: string; name?: string };
  /** Optional subject prefix, e.g. `"[me.tak3.jp contact]"`. */
  subjectPrefix?: string;
}

/** A built notification email. */
export interface InquiryEmail {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Strip CR/LF so a value is safe to use in an email header (the subject). */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Build the owner-facing notification email for an inquiry: a plain-text body
 * plus an HTML body with every untrusted field escaped. The visitor's message
 * is rendered as text and never interpolated into HTML unescaped.
 */
export function buildInquiryEmail(
  inquiry: Inquiry,
  config: Pick<SendEmailTransportConfig, 'subjectPrefix'> = {},
): InquiryEmail {
  const prefix = config.subjectPrefix?.trim();
  const subject = sanitizeHeader(
    prefix ? `${prefix} ${inquiry.email}` : `Contact from ${inquiry.email}`,
  );

  const fields: [string, string | undefined][] = [
    ['From', inquiry.email],
    ['Locale', inquiry.locale],
    ['Page', inquiry.pageUrl],
    ['User-Agent', inquiry.userAgent],
    ['Country', inquiry.meta?.country],
    ['IP', inquiry.meta?.ip],
    ['Received', inquiry.meta?.receivedAt],
  ];
  const present = fields.filter((entry): entry is [string, string] => entry[1] !== undefined);

  const text = [
    inquiry.message,
    '',
    '—',
    ...present.map(([key, value]) => `${key}: ${value}`),
  ].join('\n');

  const html = [
    `<p style="white-space:pre-wrap;margin:0 0 1em">${escapeHtml(inquiry.message)}</p>`,
    '<hr>',
    '<p style="color:#555;font-size:13px;line-height:1.6">',
    present.map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`).join('<br>'),
    '</p>',
  ].join('');

  return { subject, text, html };
}

/**
 * Create an {@link EmailTransport} that delivers an inquiry to the owner's inbox
 * via the Cloudflare `send_email` binding. `Reply-To` is set to the visitor's
 * address so the owner can reply straight from their normal mail app.
 */
export function createSendEmailTransport(
  binding: SendEmailBinding,
  config: SendEmailTransportConfig,
): EmailTransport {
  return {
    async send(inquiry) {
      const mail = buildInquiryEmail(inquiry, config);
      // The Cloudflare `send_email` binding's `EmailAddress` requires `name` to
      // be a string when the object form is used; `{ email }` (name undefined)
      // throws at runtime. Send the object form only when a display name is
      // present, otherwise a bare address string.
      const name = config.from.name?.trim();
      const from = name ? { email: config.from.email, name } : config.from.email;
      await binding.send({
        to: config.to,
        from,
        replyTo: inquiry.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}
