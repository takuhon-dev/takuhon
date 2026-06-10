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
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GitHubFetchError';
  }
}

export class GitHubClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /**
   * Aggregate language byte counts across the user's owned, non-fork repos
   * (capped at `maxRepos`, most-recently-pushed first). Returns raw bytes per
   * language; the caller converts to percentages via `@takuhon/core`.
   */
  async fetchLanguages(
    username: string,
    token?: string,
    maxRepos = DEFAULT_MAX_REPOS,
  ): Promise<Record<string, number>> {
    const repos = await this.getJson<RepoSummary[]>(
      `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed`,
      token,
    );
    const owned = repos.filter((repo) => !repo.fork).slice(0, maxRepos);

    const totals: Record<string, number> = {};
    for (const repo of owned) {
      const langs = await this.getJson<Record<string, number>>(
        `${GITHUB_API}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/languages`,
        token,
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
      throw new GitHubFetchError(`GitHub GraphQL responded ${String(res.status)}.`);
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
    if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`;
    const res = await this.fetchImpl(url, { headers });
    if (!res.ok) {
      throw new GitHubFetchError(`GitHub API responded ${String(res.status)}.`);
    }
    return (await res.json()) as T;
  }
}
