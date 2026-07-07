/**
 * Worker-level wiring for the contact form (turnkey PR3): the routing/mount
 * gate, the bundled `/contact-widget.{js,css}` delivery, and the env → seam
 * wiring of `POST /api/contact`. The full handleContact pipeline (guards →
 * validate → Turnstile → email) is exercised separately in
 * `contact-integration.test.ts`; here we confirm the Worker mounts it under the
 * right conditions and passes the configured recipient / From / subject through.
 */

import type { Takuhon } from '@takuhon/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import worker, { createTakuhonWorker, type Env, type SendEmailBinding } from '../index.js';
import { KV_KEY, type KvMetadata } from '../kv-storage.js';
import { FakeKV } from '../test-utils/fake-kv.js';

type SentMessage = Parameters<SendEmailBinding['send']>[0];

function emailCollector(): { sent: SentMessage[]; binding: SendEmailBinding } {
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

/** A send_email binding whose delivery always fails (to exercise the 502 path). */
function rejectingBinding(): SendEmailBinding {
  return { send: () => Promise.reject(new Error('delivery failed')) };
}

/** A profile that enables the contact form, for use as a worker `fallback`. */
function enabledProfile(): Takuhon {
  const base = exampleJson as Takuhon;
  return {
    ...base,
    settings: { ...base.settings, contact: { enabled: true, turnstileSiteKey: '0xSITEKEY' } },
  };
}

/** Store a profile that enables the contact form (with a public site key). */
async function seedContactProfile(
  kv: FakeKV,
  contact: Takuhon['settings']['contact'] = { enabled: true, turnstileSiteKey: '0xSITEKEY' },
): Promise<void> {
  const base = exampleJson as Takuhon;
  const stored: Takuhon = { ...base, settings: { ...base.settings, contact } };
  const metadata: KvMetadata = { version: 'v-contact', updatedAt: '2026-06-30T00:00:00Z' };
  await kv.put(KV_KEY, JSON.stringify(stored), { metadata });
}

function call(url: string, env: Env, init?: RequestInit): Promise<Response> {
  return Promise.resolve(worker.fetch(new Request(url, init), env));
}

const validSubmission = {
  email: 'visitor@example.com',
  message: 'Hello there',
  locale: 'en',
  token: 'tok',
  hp: '',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contact-widget assets', () => {
  it('serves /contact-widget.js as JavaScript with nosniff', async () => {
    const env: Env = { TAKUHON_KV: new FakeKV() as unknown as KVNamespace };
    const res = await call('https://worker.example/contact-widget.js', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.text()).toContain('TakuhonContact');
  });

  it('serves /contact-widget.css as CSS', async () => {
    const env: Env = { TAKUHON_KV: new FakeKV() as unknown as KVNamespace };
    const res = await call('https://worker.example/contact-widget.css', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(await res.text()).toContain('tkc-');
  });

  it('rejects a non-GET method on the asset path', async () => {
    const env: Env = { TAKUHON_KV: new FakeKV() as unknown as KVNamespace };
    const res = await call('https://worker.example/contact-widget.js', env, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('does not match a locale-prefixed asset path (router 404)', async () => {
    const env: Env = { TAKUHON_KV: new FakeKV() as unknown as KVNamespace };
    const res = await call('https://worker.example/ja/contact-widget.js', env);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/contact mount gate', () => {
  function post(env: Env): Promise<Response> {
    return call('https://worker.example/api/contact', env, {
      method: 'POST',
      // Same-origin: handleContact's allowlist is [request origin], so the
      // Origin header must match for the request to pass the origin guard.
      headers: { 'content-type': 'application/json', origin: 'https://worker.example' },
      body: JSON.stringify(validSubmission),
    });
  }

  it('falls through to the public app 405 when no send_email binding is bound', async () => {
    const { env } = { env: { TAKUHON_KV: new FakeKV() as unknown as KVNamespace } as Env };
    await seedContactProfile(env.TAKUHON_KV as unknown as FakeKV);
    const res = await post(env);
    // The public app's POST catch-all answers 405 (method not allowed).
    expect(res.status).toBe(405);
  });

  it('answers 404 when the binding is bound but the profile disables contact', async () => {
    const kv = new FakeKV();
    await seedContactProfile(kv, { enabled: false, turnstileSiteKey: '0xSITEKEY' });
    const env: Env = {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: emailCollector().binding,
    };
    const res = await post(env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects with 422 (challenge_failed) when Turnstile does not pass', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 })),
    );
    const kv = new FakeKV();
    await seedContactProfile(kv);
    const env: Env = {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: emailCollector().binding,
      TAKUHON_TURNSTILE_SECRET: 'secret',
      TAKUHON_CONTACT_TO: 'owner@example.com',
      TAKUHON_CONTACT_FROM: 'noreply@example.com',
    };
    const res = await post(env);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: 'challenge_failed' });
  });

  it('delivers to the configured recipient with the profile subject prefix on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    const kv = new FakeKV();
    await seedContactProfile(kv, {
      enabled: true,
      turnstileSiteKey: '0xSITEKEY',
      subjectPrefix: '[worker.example contact]',
    });
    const { sent, binding } = emailCollector();
    const env: Env = {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: binding,
      TAKUHON_TURNSTILE_SECRET: 'secret',
      TAKUHON_CONTACT_TO: 'owner@example.com',
      TAKUHON_CONTACT_FROM: 'noreply@example.com',
    };
    const res = await call('https://worker.example/api/contact', env, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://worker.example' },
      body: JSON.stringify(validSubmission),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('owner@example.com');
    // No display name configured (env has no from name), so the transport must
    // send a bare string `from` — the object form would throw in the real
    // Cloudflare binding ("name field is not string").
    expect(sent[0]?.from).toBe('noreply@example.com');
    expect(sent[0]?.replyTo).toBe('visitor@example.com');
    expect(sent[0]?.subject).toContain('[worker.example contact]');
  });

  it('degrades to 502 (send_failed) when delivery throws (e.g. recipient/From unset)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    const kv = new FakeKV();
    await seedContactProfile(kv);
    const env: Env = {
      TAKUHON_KV: kv as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: rejectingBinding(),
      TAKUHON_TURNSTILE_SECRET: 'secret',
      // No TAKUHON_CONTACT_TO / _FROM — the real binding would reject; the fake
      // rejecting binding stands in for that failure.
    };
    const res = await post(env);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: 'send_failed' });
  });

  it('does not handle a non-POST /api/contact (router 404)', async () => {
    const env: Env = {
      TAKUHON_KV: new FakeKV() as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: emailCollector().binding,
    };
    const res = await call('https://worker.example/api/contact', env);
    expect(res.status).toBe(404);
  });

  it('consults the fallback profile when KV is empty (cold-start path)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    // A worker whose fallback enables contact; KV is empty, so serveContact's
    // getProfile throws and the fallback profile is used to gate the form.
    const custom = createTakuhonWorker({ fallback: enabledProfile });
    const { sent, binding } = emailCollector();
    const env: Env = {
      TAKUHON_KV: new FakeKV() as unknown as KVNamespace,
      TAKUHON_CONTACT_EMAIL: binding,
      TAKUHON_TURNSTILE_SECRET: 'secret',
      TAKUHON_CONTACT_TO: 'owner@example.com',
      TAKUHON_CONTACT_FROM: 'noreply@example.com',
    };
    const res = await custom.fetch(
      new Request('https://worker.example/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://worker.example' },
        body: JSON.stringify(validSubmission),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });
});
