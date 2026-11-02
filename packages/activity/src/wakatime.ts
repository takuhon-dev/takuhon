/**
 * WakaTime fetcher for the activity snapshot.
 *
 * Reads total coding seconds over a range from the `users/{user}/stats/{range}`
 * endpoint. Reading stats REQUIRES an OAuth access token with the `read_stats`
 * scope, sent as a Bearer token. A WakaTime API key cannot be used here: API
 * keys are write-only (they only let editor plugins send coding activity), so
 * a read authorized by one is rejected. The token only ever flows through this
 * sync step — never into any stored document.
 *
 * The `fetch` implementation is injected for tests; production defaults to the
 * runtime global.
 */

import { defaultFetch } from './fetch-impl.js';

const WAKATIME_API = 'https://wakatime.com/api/v1';

/** Default stats range — recent activity rather than all-time. */
export const DEFAULT_WAKATIME_RANGE = 'last_year';

interface WakaTimeStatsResponse {
  data?: { total_seconds?: number };
}

/** Thrown when a WakaTime request fails; carries no token or host-path detail. */
export class WakaTimeFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WakaTimeFetchError';
  }
}

export class WakaTimeClient {
  constructor(private readonly fetchImpl: typeof fetch = defaultFetch) {}

  /** Total coding seconds for `username` over `range` (default last year). */
  async fetchCodingSeconds(
    username: string,
    accessToken: string,
    range = DEFAULT_WAKATIME_RANGE,
  ): Promise<number> {
    const res = await this.fetchImpl(
      `${WAKATIME_API}/users/${encodeURIComponent(username)}/stats/${encodeURIComponent(range)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      // A deployment still configured with an API key lands here, so name the
      // fix in the message the sync logs rather than leaving a bare status.
      const hint =
        res.status === 401 || res.status === 403
          ? ' Reading stats needs an OAuth access token with the read_stats scope; WakaTime API keys are write-only.'
          : '';
      throw new WakaTimeFetchError(`WakaTime API responded ${String(res.status)}.${hint}`);
    }
    const json = (await res.json()) as WakaTimeStatsResponse;
    const seconds = json.data?.total_seconds;
    if (typeof seconds !== 'number') {
      throw new WakaTimeFetchError('WakaTime response missing data.total_seconds.');
    }
    return seconds;
  }
}
