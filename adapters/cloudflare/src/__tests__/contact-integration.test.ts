/**
 * End-to-end integration of the portable contact core with the Cloudflare
 * implementations: drive `handleContact` (from `@takuhon/contact`) with the real
 * {@link createTurnstileVerifier} and {@link createSendEmailTransport} from this
 * adapter, using an injected siteverify `fetch` and a fake `send_email` binding.
 *
 * This validates the whole server path — guards → validation → Turnstile →
 * email delivery — without any network or credentials, so the integration can
 * be dogfooded and trusted before publishing.
 */

import { handleContact } from '@takuhon/contact';
import { describe, expect, it } from 'vitest';

import {
  createSendEmailTransport,
  createTurnstileVerifier,
  type SendEmailBinding,
} from '../contact.js';

type SentMessage = Parameters<SendEmailBinding['send']>[0];

function collector(): { sent: SentMessage[]; binding: SendEmailBinding } {
  const sent: SentMessage[] = [];
  return {
    sent,
    binding: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
  };
}

/** A siteverify fetch that always reports the given outcome. */
function turnstileFetch(success: boolean): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify({ success }), { status: 200 }));
}

function makeDeps(captured: { binding: SendEmailBinding }, challengePasses: boolean) {
  return {
    verifier: createTurnstileVerifier('secret', { fetch: turnstileFetch(challengePasses) }),
    transport: createSendEmailTransport(captured.binding, {
      to: 'owner@tak3.jp',
      from: { email: 'noreply@tak3.jp', name: 'me.tak3.jp Contact' },
      subjectPrefix: '[me.tak3.jp contact]',
    }),
    readMeta: (request: Request) => ({
      country: 'JP',
      ip: request.headers.get('cf-connecting-ip') ?? undefined,
    }),
  };
}

function post(body: unknown): Request {
  return new Request('https://me.tak3.jp/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
    body: JSON.stringify(body),
  });
}

const valid = {
  email: 'visitor@example.com',
  message: 'Hello <b>world</b>',
  locale: 'en',
  token: 'tok',
  hp: '',
};

describe('contact (core + Cloudflare implementations)', () => {
  it('delivers an email on a valid submission with a passing challenge', async () => {
    const captured = collector();
    const res = await handleContact(post(valid), makeDeps(captured, true));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(captured.sent).toHaveLength(1);

    const message = captured.sent[0];
    expect(message?.to).toBe('owner@tak3.jp');
    expect(message?.replyTo).toBe('visitor@example.com');
    expect(message?.subject).toBe('[me.tak3.jp contact] visitor@example.com');
    // The message is escaped in HTML but kept raw in the text body.
    expect(message?.html).toContain('&lt;b&gt;world&lt;/b&gt;');
    expect(message?.text).toContain('Hello <b>world</b>');
    // Server-derived metadata (from readMeta) reaches the email.
    expect(message?.text).toContain('Country: JP');
    expect(message?.text).toContain('IP: 203.0.113.5');
  });

  it('returns 422 and sends nothing when the challenge fails', async () => {
    const captured = collector();
    const res = await handleContact(post(valid), makeDeps(captured, false));

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'challenge_failed' });
    expect(captured.sent).toHaveLength(0);
  });

  it('feigns success but sends nothing when the honeypot is tripped', async () => {
    const captured = collector();
    const res = await handleContact(post({ ...valid, hp: 'bot' }), makeDeps(captured, true));

    expect(res.status).toBe(200);
    expect(captured.sent).toHaveLength(0);
  });
});
