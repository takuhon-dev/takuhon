import { describe, expect, it, vi } from 'vitest';

import { handleContact } from './handler.js';
import type { ChallengeVerifier, EmailTransport, Inquiry } from './types.js';

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const passVerifier: ChallengeVerifier = { verify: () => Promise.resolve(true) };
const failVerifier: ChallengeVerifier = { verify: () => Promise.resolve(false) };

function collector(): { sent: Inquiry[]; transport: EmailTransport } {
  const sent: Inquiry[] = [];
  return {
    sent,
    transport: {
      send: (inquiry) => {
        sent.push(inquiry);
        return Promise.resolve();
      },
    },
  };
}

const valid = { email: 'v@example.com', message: 'hello', locale: 'ja', token: 'tok' };

describe('handleContact', () => {
  it('sends an inquiry and returns 200 on a valid submission', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post(valid), { verifier: passVerifier, transport });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.email).toBe('v@example.com');
    expect(sent[0]?.meta?.receivedAt).toBeTypeOf('string');
  });

  it('rejects a non-POST method', async () => {
    const { transport } = collector();
    const res = await handleContact(new Request('https://example.test/', { method: 'GET' }), {
      verifier: passVerifier,
      transport,
    });
    expect(res.status).toBe(405);
  });

  it('rejects a non-JSON content type', async () => {
    const { transport } = collector();
    const res = await handleContact(post(valid, { 'content-type': 'text/plain' }), {
      verifier: passVerifier,
      transport,
    });
    expect(res.status).toBe(415);
  });

  it('rejects a disallowed origin when an allowlist is set', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post(valid, { origin: 'https://evil.test' }), {
      verifier: passVerifier,
      transport,
      config: { allowedOrigins: ['https://me.tak3.jp'] },
    });
    expect(res.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('allows a matching origin', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post(valid, { origin: 'https://me.tak3.jp' }), {
      verifier: passVerifier,
      transport,
      config: { allowedOrigins: ['https://me.tak3.jp'] },
    });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it('returns 422 and does not send when the challenge fails', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post(valid), { verifier: failVerifier, transport });
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'challenge_failed' });
    expect(sent).toHaveLength(0);
  });

  it('returns 422 when the token is missing', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post({ email: 'v@example.com', message: 'hi', locale: 'ja' }), {
      verifier: passVerifier,
      transport,
    });
    expect(res.status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it('feigns success (200) but sends nothing when the honeypot is tripped', async () => {
    const { sent, transport } = collector();
    const res = await handleContact(post({ ...valid, hp: 'bot' }), {
      verifier: passVerifier,
      transport,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it('returns 502 when the transport throws', async () => {
    const transport: EmailTransport = { send: () => Promise.reject(new Error('smtp down')) };
    const res = await handleContact(post(valid), { verifier: passVerifier, transport });
    expect(res.status).toBe(502);
  });

  it('rejects an oversized body', async () => {
    const { transport } = collector();
    const res = await handleContact(post({ ...valid, message: 'x'.repeat(20000) }), {
      verifier: passVerifier,
      transport,
      config: { maxBodyBytes: 1024 },
    });
    expect(res.status).toBe(413);
  });

  it('does not call the verifier before validation passes', async () => {
    const verify = vi.fn(() => Promise.resolve(true));
    const { transport } = collector();
    const res = await handleContact(post({ email: 'bad', message: 'x', token: 'tok' }), {
      verifier: { verify },
      transport,
    });
    expect(res.status).toBe(422);
    expect(verify).not.toHaveBeenCalled();
  });
});
