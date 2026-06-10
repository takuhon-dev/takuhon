import type { ActivitySettings } from '@takuhon/core';
import { describe, expect, it, vi } from 'vitest';

import { fetchActivitySnapshot, isEmptySnapshot } from '../fetch-snapshot.js';
import { jsonResponse, recordingFetch } from '../test-utils/fake-fetch.js';

const NOW = (): Date => new Date('2026-06-10T00:00:00.000Z');

/** Route the four endpoints the orchestrator may hit. `opts` toggles failures. */
function routedFetch(opts: { reposStatus?: number } = {}): typeof fetch {
  return recordingFetch((url) => {
    if (url.includes('/graphql')) {
      return jsonResponse({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 5,
                weeks: [{ contributionDays: [{ date: '2026-06-09', contributionCount: 5 }] }],
              },
            },
          },
        },
      });
    }
    if (url.includes('/stats/')) return jsonResponse({ data: { total_seconds: 3600 } });
    if (url.includes('/languages')) return jsonResponse({ TypeScript: 300 });
    if (url.includes('/repos')) {
      if (opts.reposStatus) return jsonResponse({}, opts.reposStatus);
      return jsonResponse([{ name: 'a', fork: false }]);
    }
    return jsonResponse({}, 404);
  }).fetchImpl;
}

describe('fetchActivitySnapshot', () => {
  it('assembles all signals when configured and authorized', async () => {
    const config: ActivitySettings = {
      enabled: true,
      github: { username: 'octocat' },
      wakatime: { username: 'octocat' },
      showRank: true,
    };
    const snapshot = await fetchActivitySnapshot(
      config,
      { githubToken: 'tok', wakatimeKey: 'wk' },
      { fetch: routedFetch(), now: NOW },
    );

    expect(snapshot.lastSyncedAt).toBe('2026-06-10T00:00:00.000Z');
    expect(snapshot.languages).toEqual([{ name: 'TypeScript', bytes: 300, percent: 100 }]);
    expect(snapshot.contributions?.total).toBe(5);
    expect(snapshot.codingTime?.hours).toBe(1);
    expect(snapshot.rank).toBeDefined();
  });

  it('fetches languages without a token but skips contributions (GraphQL needs one)', async () => {
    const config: ActivitySettings = { enabled: true, github: { username: 'octocat' } };
    const onError = vi.fn();
    const snapshot = await fetchActivitySnapshot(
      config,
      {},
      { fetch: routedFetch(), now: NOW, onError },
    );

    expect(snapshot.languages).toHaveLength(1);
    expect(snapshot.contributions).toBeUndefined();
    // Skipping contributions for lack of a token is not an error.
    expect(onError).not.toHaveBeenCalled();
    // No signal that feeds rank → no rank stamped.
    expect(snapshot.rank).toBeUndefined();
  });

  it('reports a failing source via onError and omits it, keeping the others', async () => {
    const config: ActivitySettings = {
      enabled: true,
      github: { username: 'octocat' },
      wakatime: { username: 'octocat' },
    };
    const onError = vi.fn();
    const snapshot = await fetchActivitySnapshot(
      config,
      { githubToken: 'tok', wakatimeKey: 'wk' },
      { fetch: routedFetch({ reposStatus: 500 }), now: NOW, onError },
    );

    expect(snapshot.languages).toBeUndefined();
    expect(onError).toHaveBeenCalledWith('github-languages', expect.anything());
    // The other sources still came through.
    expect(snapshot.contributions?.total).toBe(5);
    expect(snapshot.codingTime?.hours).toBe(1);
    expect(snapshot.rank).toBeDefined();
  });

  it('produces an empty snapshot (and reports it) when nothing can be gathered', async () => {
    const config: ActivitySettings = { enabled: true, github: { username: 'octocat' } };
    const onError = vi.fn();
    const snapshot = await fetchActivitySnapshot(
      config,
      {}, // no token → contributions skipped; languages will fail below
      { fetch: routedFetch({ reposStatus: 500 }), now: NOW, onError },
    );

    expect(isEmptySnapshot(snapshot)).toBe(true);
    expect(snapshot.lastSyncedAt).toBe('2026-06-10T00:00:00.000Z');
    expect(onError).toHaveBeenCalledWith('github-languages', expect.anything());
  });

  it('skips a source whose show flag is false', async () => {
    const config: ActivitySettings = {
      enabled: true,
      github: { username: 'octocat', showLanguages: false },
    };
    const snapshot = await fetchActivitySnapshot(
      config,
      { githubToken: 'tok' },
      { fetch: routedFetch(), now: NOW },
    );
    expect(snapshot.languages).toBeUndefined();
    // Contributions still fetched (showContributions defaults true, token present).
    expect(snapshot.contributions?.total).toBe(5);
  });
});
