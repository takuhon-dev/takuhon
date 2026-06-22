import type { Inquiry } from '@takuhon/contact';
import { describe, expect, it } from 'vitest';

import {
  buildInquiryEmail,
  createSendEmailTransport,
  createTurnstileVerifier,
  type SendEmailBinding,
} from '../contact.js';

function turnstileResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const inquiry: Inquiry = {
  email: 'visitor@example.com',
  message: 'Hello <there> & "friends"',
  locale: 'ja',
  pageUrl: 'https://me.tak3.jp/',
  userAgent: 'Mozilla/5.0',
  meta: { country: 'JP', ip: '203.0.113.7', receivedAt: '2026-06-22T00:00:00.000Z' },
};

describe('createTurnstileVerifier', () => {
  it('returns true on success and posts secret + response + remoteip', async () => {
    let captured: { url: unknown; init: RequestInit | undefined } | undefined;
    const fakeFetch: typeof fetch = (url, init) => {
      captured = { url, init };
      return Promise.resolve(turnstileResponse({ success: true }));
    };
    const verifier = createTurnstileVerifier('the-secret', { fetch: fakeFetch });

    const result = await verifier.verify('token-abc', { remoteIp: '203.0.113.7' });

    expect(result).toBe(true);
    expect(captured?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = captured?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    if (body instanceof FormData) {
      expect(body.get('secret')).toBe('the-secret');
      expect(body.get('response')).toBe('token-abc');
      expect(body.get('remoteip')).toBe('203.0.113.7');
    }
  });

  it('returns false when siteverify reports failure', async () => {
    const verifier = createTurnstileVerifier('secret', {
      fetch: () => Promise.resolve(turnstileResponse({ success: false })),
    });
    expect(await verifier.verify('bad')).toBe(false);
  });

  it('returns false for an empty token without calling fetch', async () => {
    let called = false;
    const fakeFetch: typeof fetch = () => {
      called = true;
      return Promise.resolve(turnstileResponse({ success: true }));
    };
    const verifier = createTurnstileVerifier('secret', { fetch: fakeFetch });
    expect(await verifier.verify('')).toBe(false);
    expect(called).toBe(false);
  });

  it('returns false when the request throws or is non-2xx', async () => {
    const throwing = createTurnstileVerifier('secret', {
      fetch: () => Promise.reject(new Error('network')),
    });
    expect(await throwing.verify('t')).toBe(false);

    const non200 = createTurnstileVerifier('secret', {
      fetch: () => Promise.resolve(turnstileResponse({}, 500)),
    });
    expect(await non200.verify('t')).toBe(false);
  });
});

describe('buildInquiryEmail', () => {
  it('puts the message in the text body with the fields appended', () => {
    const mail = buildInquiryEmail(inquiry, { subjectPrefix: '[me.tak3.jp contact]' });
    expect(mail.subject).toBe('[me.tak3.jp contact] visitor@example.com');
    expect(mail.text).toContain('Hello <there> & "friends"');
    expect(mail.text).toContain('From: visitor@example.com');
    expect(mail.text).toContain('Locale: ja');
    expect(mail.text).toContain('Page: https://me.tak3.jp/');
    expect(mail.text).toContain('Received: 2026-06-22T00:00:00.000Z');
  });

  it('escapes untrusted fields in the HTML body (no raw markup)', () => {
    const mail = buildInquiryEmail(inquiry);
    expect(mail.html).toContain('Hello &lt;there&gt; &amp; &quot;friends&quot;');
    expect(mail.html).not.toContain('<there>');
  });

  it('strips CR/LF from the subject (header-injection guard)', () => {
    const mail = buildInquiryEmail(inquiry, { subjectPrefix: 'evil\r\nBcc: x@y.z' });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('omits absent optional fields', () => {
    const minimal: Inquiry = { email: 'a@b.co', message: 'hi', locale: 'en' };
    const mail = buildInquiryEmail(minimal);
    expect(mail.text).not.toContain('Page:');
    expect(mail.text).not.toContain('User-Agent:');
  });
});

describe('createSendEmailTransport', () => {
  it('sends via the binding with Reply-To set to the visitor', async () => {
    const sent: Parameters<SendEmailBinding['send']>[0][] = [];
    const binding: SendEmailBinding = {
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    };
    const transport = createSendEmailTransport(binding, {
      to: 'owner@tak3.jp',
      from: { email: 'noreply@tak3.jp', name: 'me.tak3.jp Contact' },
      subjectPrefix: '[contact]',
    });

    await transport.send(inquiry);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('owner@tak3.jp');
    expect(sent[0]?.from).toEqual({ email: 'noreply@tak3.jp', name: 'me.tak3.jp Contact' });
    expect(sent[0]?.replyTo).toBe('visitor@example.com');
    expect(sent[0]?.subject).toBe('[contact] visitor@example.com');
    expect(sent[0]?.text).toContain('Hello <there>');
    expect(sent[0]?.html).toContain('&lt;there&gt;');
  });
});
