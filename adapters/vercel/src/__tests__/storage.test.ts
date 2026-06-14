import { describe, expect, it, vi } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { BundledTakuhonStorage, UrlTakuhonStorage } from '../storage.js';

describe('BundledTakuhonStorage', () => {
  it('returns the bundled profile with a read-only version token', async () => {
    const storage = new BundledTakuhonStorage(exampleJson);
    const { data, version } = await storage.getProfile();
    expect(data.profile.displayName).toEqual({ en: 'Pat Rivera', ja: 'パット・リベラ' });
    expect(version).toBe('read-only');
  });

  it('throws at construction when the profile is invalid (fail fast)', () => {
    expect(() => new BundledTakuhonStorage({ not: 'a profile' })).toThrow(
      /not a valid takuhon profile/,
    );
  });

  it('rejects writes — the adapter is read-only', async () => {
    const storage = new BundledTakuhonStorage(exampleJson);
    await expect(storage.saveProfile()).rejects.toThrow(/read-only/);
    await expect(storage.deleteProfile()).rejects.toThrow(/read-only/);
  });
});

describe('UrlTakuhonStorage', () => {
  function okResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  it('fetches the profile from the URL once and caches it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse(exampleJson)));
    const storage = new UrlTakuhonStorage('https://data.example/takuhon.json', {
      fetch: fetchMock as unknown as typeof fetch,
    });

    const first = await storage.getProfile();
    const second = await storage.getProfile();

    expect(first.data.profile.displayName).toEqual({ en: 'Pat Rivera', ja: 'パット・リベラ' });
    expect(second.data).toBe(first.data); // same cached document
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the URL responds with a non-OK status', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('nope', { status: 404 })));
    const storage = new UrlTakuhonStorage('https://data.example/takuhon.json', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(storage.getProfile()).rejects.toThrow(/HTTP 404/);
  });

  it('throws when the fetched body is not a valid profile', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okResponse({ bogus: true })));
    const storage = new UrlTakuhonStorage('https://data.example/takuhon.json', {
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(storage.getProfile()).rejects.toThrow(/not a valid takuhon profile/);
  });

  it('clears the cache after a failure so a later call can retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(okResponse(exampleJson));
    const storage = new UrlTakuhonStorage('https://data.example/takuhon.json', {
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(storage.getProfile()).rejects.toThrow(/HTTP 500/);
    const retried = await storage.getProfile();
    expect(retried.data.profile.displayName).toEqual({ en: 'Pat Rivera', ja: 'パット・リベラ' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects writes — the adapter is read-only', async () => {
    const storage = new UrlTakuhonStorage('https://data.example/takuhon.json');
    await expect(storage.saveProfile()).rejects.toThrow(/read-only/);
    await expect(storage.deleteProfile()).rejects.toThrow(/read-only/);
  });
});
