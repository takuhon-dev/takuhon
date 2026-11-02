import { describe, expect, it } from 'vitest';

import { GitHubClient, GitHubFetchError } from '../github.js';
import { headerOf, jsonResponse, recordingFetch } from '../test-utils/fake-fetch.js';

describe('GitHubClient.fetchLanguages', () => {
  it('aggregates language bytes across owned non-fork repos', async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.includes('/users/octocat/repos')) {
        return jsonResponse([
          { name: 'a', fork: false },
          { name: 'b', fork: false },
          { name: 'forked', fork: true },
        ]);
      }
      if (url.includes('/repos/octocat/a/languages'))
        return jsonResponse({ TypeScript: 100, CSS: 50 });
      if (url.includes('/repos/octocat/b/languages')) return jsonResponse({ TypeScript: 200 });
      return jsonResponse({}, 404);
    });

    const bytes = await new GitHubClient(fetchImpl).fetchLanguages('octocat');
    expect(bytes).toEqual({ TypeScript: 300, CSS: 50 });
    // The fork is skipped, so its languages endpoint is never queried.
    expect(calls.some((c) => c.url.includes('/forked/languages'))).toBe(false);
  });

  it('caps the number of repositories scanned', async () => {
    const repos = Array.from({ length: 10 }, (_, i) => ({ name: `r${String(i)}`, fork: false }));
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.includes('/repos'))
        return jsonResponse(url.includes('/languages') ? { Go: 1 } : repos);
      return jsonResponse([]);
    });
    await new GitHubClient(fetchImpl).fetchLanguages('octocat', undefined, 3);
    const languageCalls = calls.filter((c) => c.url.includes('/languages'));
    expect(languageCalls).toHaveLength(3);
  });

  it('sends a bearer token when one is supplied, and omits it otherwise', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse([]));
    await new GitHubClient(fetchImpl).fetchLanguages('octocat', 'tok');
    expect(headerOf(calls[0], 'authorization')).toBe('Bearer tok');

    const anon = recordingFetch(() => jsonResponse([]));
    await new GitHubClient(anon.fetchImpl).fetchLanguages('octocat');
    expect(headerOf(anon.calls[0], 'authorization')).toBeUndefined();
  });

  it('throws GitHubFetchError on a non-2xx response', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 403));
    await expect(new GitHubClient(fetchImpl).fetchLanguages('octocat')).rejects.toMatchObject({
      name: 'GitHubFetchError',
      status: 403,
    });
  });

  // GitHub answers an expired or revoked token with 401 even on endpoints that
  // need no token, so the token must not take the languages read down with it.
  const rejectsToken = (url: string, init?: RequestInit): Response => {
    const authorized = (init?.headers as Record<string, string>).authorization !== undefined;
    if (authorized) return jsonResponse({ message: 'Bad credentials' }, 401);
    if (url.includes('/users/octocat/repos')) return jsonResponse([{ name: 'a', fork: false }]);
    return jsonResponse({ TypeScript: 100 });
  };

  it('retries unauthenticated when GitHub rejects the token', async () => {
    const { fetchImpl, calls } = recordingFetch(rejectsToken);
    const bytes = await new GitHubClient(fetchImpl).fetchLanguages('octocat', 'expired');
    expect(bytes).toEqual({ TypeScript: 100 });
    expect(calls.map((c) => headerOf(c, 'authorization'))).toEqual([
      'Bearer expired',
      undefined,
      undefined,
    ]);
  });

  it('does not retry a 401 that was already unauthenticated', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}, 401));
    await expect(new GitHubClient(fetchImpl).fetchLanguages('octocat')).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
  });

  it('keeps the token on failures other than a rejected token', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}, 403));
    await expect(
      new GitHubClient(fetchImpl).fetchLanguages('octocat', 'tok'),
    ).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
  });
});

describe('GitHubClient.fetchContributions', () => {
  const calendarResponse = {
    data: {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: 5,
            weeks: [
              {
                contributionDays: [
                  { date: '2026-06-08', contributionCount: 2 },
                  { date: '2026-06-09', contributionCount: 3 },
                ],
              },
            ],
          },
        },
      },
    },
  };

  it('parses the GraphQL calendar into total + flat days and posts a bearer token', async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      expect(url).toContain('/graphql');
      return jsonResponse(calendarResponse);
    });
    const calendar = await new GitHubClient(fetchImpl).fetchContributions('octocat', 'tok');
    expect(calendar.total).toBe(5);
    expect(calendar.days).toEqual([
      { date: '2026-06-08', count: 2 },
      { date: '2026-06-09', count: 3 },
    ]);
    expect(headerOf(calls[0], 'authorization')).toBe('Bearer tok');
    expect(calls[0]?.init?.method).toBe('POST');
  });

  it('throws with the status when GitHub rejects the token', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ message: 'Bad credentials' }, 401));
    await expect(
      new GitHubClient(fetchImpl).fetchContributions('octocat', 'expired'),
    ).rejects.toMatchObject({ name: 'GitHubFetchError', status: 401 });
  });

  it('throws on a GraphQL errors payload', async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ errors: [{ message: 'bad token' }] }),
    );
    await expect(
      new GitHubClient(fetchImpl).fetchContributions('octocat', 'tok'),
    ).rejects.toBeInstanceOf(GitHubFetchError);
  });
});
