import { describe, expect, it } from 'vitest';

import { headerOf, jsonResponse, recordingFetch } from '../test-utils/fake-fetch.js';
import { WakaTimeClient, WakaTimeFetchError } from '../wakatime.js';

describe('WakaTimeClient.fetchCodingSeconds', () => {
  it('returns total_seconds and sends the OAuth token as a Bearer token', async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      expect(url).toContain('/users/octocat/stats/last_year');
      return jsonResponse({ data: { total_seconds: 451800 } });
    });
    const seconds = await new WakaTimeClient(fetchImpl).fetchCodingSeconds(
      'octocat',
      'waka_tok_abc',
    );
    expect(seconds).toBe(451800);
    expect(headerOf(calls[0], 'authorization')).toBe('Bearer waka_tok_abc');
  });

  it('honors a custom range', async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ data: { total_seconds: 1 } }));
    await new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k', 'last_30_days');
    expect(calls[0]?.url).toContain('/stats/last_30_days');
  });

  it('throws WakaTimeFetchError on a non-2xx response', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 500));
    const failure = new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k');
    await expect(failure).rejects.toBeInstanceOf(WakaTimeFetchError);
    await expect(failure).rejects.toThrow(/^WakaTime API responded 500\.$/);
  });

  it.each([401, 403])(
    'points a rejected credential (%i) at the OAuth token, since API keys are write-only',
    async (status) => {
      const { fetchImpl } = recordingFetch(() => jsonResponse({}, status));
      const failure = new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'waka_key');
      await expect(failure).rejects.toBeInstanceOf(WakaTimeFetchError);
      await expect(failure).rejects.toThrow(/read_stats scope; WakaTime API keys are write-only/);
    },
  );

  it('throws when total_seconds is missing', async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({ data: {} }));
    await expect(
      new WakaTimeClient(fetchImpl).fetchCodingSeconds('octocat', 'k'),
    ).rejects.toBeInstanceOf(WakaTimeFetchError);
  });
});
