import { describe, expect, it } from 'vitest';

import { headerOf, jsonResponse, recordingFetch } from '../test-utils/fake-fetch.js';
import { WakaTimeClient, WakaTimeFetchError } from '../wakatime.js';

describe('WakaTimeClient.fetchCodingSeconds', () => {
  it('returns total_seconds and sends the base64 Basic auth key', async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      expect(url).toContain('/users/octocat/stats/last_year');
      return jsonResponse({ data: { total_seconds: 451800 } });
    });
    const seconds = await new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'waka-key');
    expect(seconds).toBe(451800);
    expect(headerOf(calls[0], 'authorization')).toBe(`Basic ${btoa('waka-key')}`);
  });

  it('honors a custom range', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ data: { total_seconds: 1 } }));
    await new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k', 'last_30_days');
    expect(calls[0]?.url).toContain('/stats/last_30_days');
  });

  it('throws WakaTimeFetchError on a non-2xx response', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 401));
    await expect(
      new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k'),
    ).rejects.toBeInstanceOf(WakaTimeFetchError);
  });

  it('throws when total_seconds is missing', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ data: {} }));
    await expect(
      new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k'),
    ).rejects.toBeInstanceOf(WakaTimeFetchError);
  });
});
