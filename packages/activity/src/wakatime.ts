/**
 * WakaTime fetcher for the activity snapshot.
 *
 * Reads total coding seconds over a range from the `users/{user}/stats/{range}`
 * endpoint. WakaTime has no unauthenticated mode, so an API key is REQUIRED; it
 * is sent as HTTP Basic auth (the key base64-encoded) and only ever flows
 * through this sync step — never into any stored document.
 *
 * The `fetch` implementation is injected for tests; production defaults to the
 * runtime global.
 */

const WAKATIME_API = 'https://wakatime.com/api/v1';

/** Default stats range — recent activity rather than all-time. */
export const DEFAULT_WAKATIME_RANGE = 'last_year';

interface WakaTimeStatsResponse {
  data?: { total_seconds?: number };
}

/** Thrown when a WakaTime request fails; carries no key or host-path detail. */
export class WakaTimeFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WakaTimeFetchError';
  }
}

export class WakaTimeClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** Total coding seconds for `username` over `range` (default last year). */
  async fetchCodingSeconds(
    username: string,
    apiKey: string,
    range = DEFAULT_WAKATIME_RANGE,
  ): Promise<number> {
    const res = await this.fetchImpl(
      `${WAKATIME_API}/users/${encodeURIComponent(username)}/stats/${encodeURIComponent(range)}`,
      // WakaTime Basic auth: the API key is the username, base64-encoded.
      { headers: { authorization: `Basic ${btoa(apiKey)}` } },
    );
    if (!res.ok) {
      throw new WakaTimeFetchError(`WakaTime API responded ${String(res.status)}.`);
    }
    const json = (await res.json()) as WakaTimeStatsResponse;
    const seconds = json.data?.total_seconds;
    if (typeof seconds !== 'number') {
      throw new WakaTimeFetchError('WakaTime response missing data.total_seconds.');
    }
    return seconds;
  }
}
