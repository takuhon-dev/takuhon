/**
 * GitHub fetchers for the activity snapshot.
 *
 * Two signals are read:
 * - **Language bytes** via the REST `repos/{owner}/{repo}/languages` endpoint,
 *   aggregated across the user's owned (non-fork) repositories. REST works
 *   unauthenticated (at a low rate limit); a token raises the limit.
 * - **Contribution calendar** via the GraphQL `contributionsCollection`. The
 *   calendar is only exposed over GraphQL (the REST events API does not provide
 *   it), so this REQUIRES a token.
 *
 * The `fetch` implementation is injected so tests can supply fakes; in
 * production it defaults to the runtime global (Node 22+ / Workers).
 */

import type { ContributionCalendar } from '@takuhon/core';

import { defaultFetch } from './fetch-impl.js';

const GITHUB_API = 'https://api.github.com';

/** GitHub requires a User-Agent on every request. */
const USER_AGENT = 'takuhon-activity';

/** Default cap on repositories scanned for languages, to bound fan-out. */
export const DEFAULT_MAX_REPOS = 50;

interface RepoSummary {
  name: string;
  fork: boolean;
}

interface GraphQLContributionResponse {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions: number;
          weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
        };
      };
    };
  };
  errors?: { message: string }[];
}

/** Thrown when a GitHub request fails; carries no token or host-path detail. */
export class GitHubFetchError extends Error {
  /** HTTP status of the failed response, when the failure was one. */
  readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, options);
    this.name = 'GitHubFetchError';
    this.status = options?.status;
  }
}

export class GitHubClient {
  constructor(private readonly fetchImpl: typeof fetch = defaultFetch) {}

  /**
   * Aggregate language byte counts across the user's owned, non-fork repos
   * (capped at `maxRepos`, most-recently-pushed first). Returns raw bytes per
   * language; the caller converts to percentages via `@takuhon/core`.
   *
   * The token is optional here, so when GitHub rejects it on the first request
   * (expired or revoked: 401) the whole read is retried unauthenticated rather
   * than failing; the retry is then subject to GitHub's unauthenticated rate
   * limit. A 401 on a later per-repo request is not retried. The
   * token-required contribution read still fails and reports the bad token.
   */
  async fetchLanguages(
    username: string,
    token?: string,
    maxRepos = DEFAULT_MAX_REPOS,
  ): Promise<Record<string, number>> {
    const reposUrl = `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed`;
    let auth = token;
    let repos: RepoSummary[];
    try {
      repos = await this.getJson<RepoSummary[]>(reposUrl, auth);
    } catch (err) {
      if (!(err instanceof GitHubFetchError && err.status === 401 && hasToken(auth))) throw err;
      auth = undefined;
      repos = await this.getJson<RepoSummary[]>(reposUrl, auth);
    }
    const owned = repos.filter((repo) => !repo.fork).slice(0, maxRepos);

    const totals: Record<string, number> = {};
    for (const repo of owned) {
      const langs = await this.getJson<Record<string, number>>(
        `${GITHUB_API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/languages`,
        auth,
      );
      for (const [name, bytes] of Object.entries(langs)) {
        totals[name] = (totals[name] ?? 0) + bytes;
      }
    }
    return totals;
  }

  /**
   * Read the trailing-year contribution calendar. Requires a token (the
   * calendar is GraphQL-only).
   */
  async fetchContributions(username: string, token: string): Promise<ContributionCalendar> {
    const query =
      'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}';
    const res = await this.fetchImpl(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables: { login: username } }),
    });
    if (!res.ok) {
      throw new GitHubFetchError(`GitHub GraphQL responded ${String(res.status)}.`, {
        status: res.status,
      });
    }
    const json = (await res.json()) as GraphQLContributionResponse;
    if (json.errors && json.errors.length > 0) {
      throw new GitHubFetchError(`GitHub GraphQL error: ${json.errors[0]?.message ?? 'unknown'}.`);
    }
    const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) {
      throw new GitHubFetchError('GitHub GraphQL response missing the contribution calendar.');
    }
    const days = calendar.weeks
      .flatMap((week) => week.contributionDays)
      .map((day) => ({ date: day.date, count: day.contributionCount }));
    return { total: calendar.totalContributions, days };
  }

  private async getJson<T>(url: string, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': USER_AGENT,
    };
    if (hasToken(token)) headers.authorization = `Bearer ${token}`;
    const res = await this.fetchImpl(url, { headers });
    if (!res.ok) {
      throw new GitHubFetchError(`GitHub API responded ${String(res.status)}.`, {
        status: res.status,
      });
    }
    return (await res.json()) as T;
  }
}

function hasToken(token: string | undefined): token is string {
  return token !== undefined && token !== '';
}
