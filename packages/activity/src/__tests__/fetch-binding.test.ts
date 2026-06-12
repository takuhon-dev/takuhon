import type { ActivitySettings } from '@takuhon/core';
import { afterEach, describe, expect, it } from 'vitest';

import { fetchActivitySnapshot } from '../fetch-snapshot.js';
import { GitHubClient } from '../github.js';
import { jsonResponse } from '../test-utils/fake-fetch.js';
import { WakaTimeClient } from '../wakatime.js';

const NOW = (): Date => new Date('2026-06-10T00:00:00.000Z');

/**
 * Install a stand-in for the `workerd` global `fetch`, which throws
 * "Illegal invocation" when called with a `this` other than the global scope.
 *
 * Node's built-in `fetch` tolerates a detached `this`, so this guard is what
 * lets a Node-run unit test reproduce the Workers-only binding failure: a
 * client that keeps the bare global `fetch` in a field and calls it as
 * `this.fetchImpl(url)` invokes it with the client instance as `this`, which a
 * faithful `workerd` would reject. Returns a restore function.
 */
function installWorkerdLikeFetch(handler: (url: string) => Response): () => void {
  const original: typeof fetch = globalThis.fetch;
  const guarded = function (this: unknown, input: RequestInfo | URL): Promise<Response> {
    // A free call (`fetch(...)`) runs with `this === undefined` under strict
    // mode; only a property/method call leaks a non-global receiver.
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect `this` reference.');
    }
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(handler(url));
  } as typeof fetch;
  globalThis.fetch = guarded;
  return () => {
    globalThis.fetch = original;
  };
}

function githubHandler(url: string): Response {
  // Check `/languages` first: the per-repo languages URL also contains
  // `/repos/{owner}/{repo}/languages`, so the order matters.
  if (url.includes('/languages')) return jsonResponse({ TypeScript: 100 });
  if (url.includes('/repos')) return jsonResponse([{ name: 'a', fork: false }]);
  return jsonResponse({}, 404);
}

describe('default fetch stays callable as an instance field (workerd binding)', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('GitHubClient invokes the global fetch with the right `this`', async () => {
    restore = installWorkerdLikeFetch(githubHandler);
    // Default-constructed (no injected fetch) → exercises the production default.
    const langs = await new GitHubClient().fetchLanguages('octocat');
    expect(langs).toEqual({ TypeScript: 100 });
  });

  it('WakaTimeClient invokes the global fetch with the right `this`', async () => {
    restore = installWorkerdLikeFetch((url) =>
      url.includes('/stats/')
        ? jsonResponse({ data: { total_seconds: 3600 } })
        : jsonResponse({}, 404),
    );
    const seconds = await new WakaTimeClient().fetchCodingSeconds('octocat', 'wk');
    expect(seconds).toBe(3600);
  });

  it('fetchActivitySnapshot gathers data through the default fetch (no injected client)', async () => {
    restore = installWorkerdLikeFetch(githubHandler);
    const config: ActivitySettings = { enabled: true, github: { username: 'octocat' } };
    const failures: string[] = [];
    // No `fetch` dep → the orchestrator falls back to the default fetch, the
    // exact path the Cloudflare scheduled sync takes.
    const snapshot = await fetchActivitySnapshot(
      config,
      {},
      { now: NOW, onError: (source) => failures.push(source) },
    );
    // The binding bug surfaced here as a 'github-languages' failure.
    expect(failures).toEqual([]);
    expect(snapshot.languages).toEqual([{ name: 'TypeScript', bytes: 100, percent: 100 }]);
  });
});
