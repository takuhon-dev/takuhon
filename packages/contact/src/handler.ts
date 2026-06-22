/**
 * Framework-agnostic contact-form request handler.
 *
 * Pipeline: method / content-type / origin guards → size-bounded JSON parse →
 * {@link validateSubmission} → challenge verification → {@link EmailTransport}
 * delivery. Returns a small JSON {@link Response}. It is intentionally stateless
 * (no storage) and mountable on any Web-standard runtime; adapters supply the
 * verifier and transport.
 */

import type { ContactDeps, Inquiry, InquiryMeta, RawSubmission } from './types.js';
import { DEFAULT_MAX_BODY_BYTES, validateSubmission } from './validate.js';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** True if the request's Origin (or Referer origin) is allowed, or no allowlist is set. */
function originAllowed(request: Request, allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const origin = request.headers.get('origin');
  if (origin) return allowed.includes(origin);
  // Fall back to the Referer's origin when Origin is absent.
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

/** Best-effort visitor IP from common edge headers (used only for challenge scoring). */
function remoteIp(request: Request): string | undefined {
  const direct = request.headers.get('cf-connecting-ip');
  if (direct) return direct;
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return undefined;
  const first = forwarded.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : undefined;
}

export async function handleContact(request: Request, deps: ContactDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json(415, { ok: false, error: 'unsupported_media_type' });
  }

  if (!originAllowed(request, deps.config?.allowedOrigins)) {
    return json(403, { ok: false, error: 'forbidden_origin' });
  }

  const maxBytes = deps.config?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return json(413, { ok: false, error: 'payload_too_large' });

  let raw: RawSubmission;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (typeof parsed !== 'object' || parsed === null) {
      return json(400, { ok: false, error: 'invalid_json' });
    }
    raw = parsed;
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const validation = validateSubmission(raw, deps.config);
  if (!validation.ok) {
    // Honeypot: feign success so a bot cannot learn it was caught.
    if (validation.spam) return json(200, { ok: true });
    return json(422, { ok: false, error: validation.error });
  }

  const token = typeof raw.token === 'string' ? raw.token : '';
  const passed =
    token.length > 0 && (await deps.verifier.verify(token, { remoteIp: remoteIp(request) }));
  if (!passed) return json(422, { ok: false, error: 'challenge_failed' });

  const meta: InquiryMeta = {
    ...deps.readMeta?.(request),
    receivedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  const userAgent = request.headers.get('user-agent') ?? undefined;
  const inquiry: Inquiry = {
    ...validation.value,
    ...(userAgent ? { userAgent } : {}),
    meta,
  };

  try {
    await deps.transport.send(inquiry);
  } catch {
    return json(502, { ok: false, error: 'send_failed' });
  }

  return json(200, { ok: true });
}
