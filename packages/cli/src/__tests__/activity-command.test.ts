import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ActivitySecrets } from '@takuhon/activity';
import type { ActivitySettings, ActivitySnapshot } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runActivityShow, runActivitySync } from '../activity-command.js';
import { ACTIVITY_FILENAME } from '../file-activity-storage.js';

const NOW = (): Date => new Date('2026-06-11T00:00:00.000Z');

const FULL_CONFIG: ActivitySettings = {
  enabled: true,
  github: { username: 'octocat' },
  wakatime: { username: 'waka' },
};

const SECRETS = (): ActivitySecrets => ({ githubToken: 'gh-token', wakatimeKey: 'waka-key' });

function serializeProfile(activity?: unknown): string {
  return `${JSON.stringify({ schemaVersion: '0.5.0', settings: { activity } }, null, 2)}\n`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A stub `fetch` that routes by URL substring; an unrouted URL throws. */
function makeFetch(handler: (url: string) => Response): typeof fetch {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url));
  };
}

/** Responds to all four upstream calls of a fully-configured sync. */
const happyFetch = makeFetch((url) => {
  if (url.includes('/users/octocat/repos')) return json([{ name: 'repo1', fork: false }]);
  if (url.includes('/repos/octocat/repo1/languages')) return json({ TypeScript: 800, CSS: 200 });
  if (url.endsWith('/graphql')) {
    return json({
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 1234,
              weeks: [{ contributionDays: [{ date: '2026-06-10', contributionCount: 3 }] }],
            },
          },
        },
      },
    });
  }
  if (url.includes('wakatime.com')) return json({ data: { total_seconds: 451800 } });
  throw new Error(`unexpected fetch: ${url}`);
});

describe('runActivitySync()', () => {
  let dir: string;
  let path: string;
  let activityPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-activity-sync-'));
    path = join(dir, 'takuhon.json');
    activityPath = join(dir, ACTIVITY_FILENAME);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', async () => {
    const out = await runActivitySync(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon activity sync');
  });

  it('rejects unknown options with exit 2', async () => {
    const out = await runActivitySync(['--nope']);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('unknown option');
  });

  it('rejects a second positional argument with exit 2', async () => {
    const out = await runActivitySync([path, 'extra']);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('at most one path');
  });

  it('exits 2 when the profile cannot be read', async () => {
    const out = await runActivitySync([path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read');
  });

  it('exits 2 when the profile is not valid JSON', async () => {
    writeFileSync(path, '{ not json', 'utf8');
    const out = await runActivitySync([path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('not valid JSON');
  });

  it('exits 2 (and fetches nothing) when settings.activity is absent', async () => {
    writeFileSync(path, serializeProfile(undefined), 'utf8');
    const out = await runActivitySync([path], { fetch: happyFetch, getSecrets: SECRETS });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('no settings.activity');
    expect(existsSync(activityPath)).toBe(false);
  });

  it('exits 2 when activity is not enabled (the default)', async () => {
    writeFileSync(path, serializeProfile({ ...FULL_CONFIG, enabled: undefined }), 'utf8');
    const out = await runActivitySync([path], { fetch: happyFetch, getSecrets: SECRETS });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('not enabled');
  });

  it('exits 2 when no github or wakatime username is configured', async () => {
    writeFileSync(path, serializeProfile({ enabled: true }), 'utf8');
    const out = await runActivitySync([path], { fetch: happyFetch, getSecrets: SECRETS });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('no github or wakatime username');
  });

  it('fetches all configured sources and writes activity.json beside the profile', async () => {
    writeFileSync(path, serializeProfile(FULL_CONFIG), 'utf8');

    const out = await runActivitySync([path], {
      fetch: happyFetch,
      getSecrets: SECRETS,
      now: NOW,
    });

    expect(out.stderr).toBe('');
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`synced activity -> ${activityPath}`);
    expect(out.stdout).toContain('languages, contributions, codingTime, rank');

    const stored = JSON.parse(readFileSync(activityPath, 'utf8')) as ActivitySnapshot;
    expect(stored.lastSyncedAt).toBe('2026-06-11T00:00:00.000Z');
    expect(stored.languages).toEqual([
      { name: 'TypeScript', bytes: 800, percent: 80 },
      { name: 'CSS', bytes: 200, percent: 20 },
    ]);
    expect(stored.contributions).toEqual({
      total: 1234,
      days: [{ date: '2026-06-10', count: 3 }],
    });
    expect(stored.codingTime).toEqual({
      totalSeconds: 451800,
      hours: 125,
      minutes: 30,
      seconds: 0,
    });
    expect(stored.rank).toBeDefined();
  });

  it('still syncs languages without a GitHub token, noting the skipped contributions', async () => {
    writeFileSync(path, serializeProfile(FULL_CONFIG), 'utf8');
    // No graphql route: an attempted contributions call would throw "unexpected
    // fetch" and surface as a failure, so a clean stderr proves it was skipped.
    const fetch = makeFetch((url) => {
      if (url.includes('/users/octocat/repos')) return json([{ name: 'repo1', fork: false }]);
      if (url.includes('/repos/octocat/repo1/languages')) return json({ TypeScript: 100 });
      if (url.includes('wakatime.com')) return json({ data: { total_seconds: 60 } });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const out = await runActivitySync([path], {
      fetch,
      getSecrets: () => ({ wakatimeKey: 'waka-key' }),
      now: NOW,
    });

    expect(out.code).toBe(0);
    expect(out.stderr).toContain('TAKUHON_GITHUB_TOKEN is not set');
    expect(out.stderr).not.toContain('failed');
    const stored = JSON.parse(readFileSync(activityPath, 'utf8')) as ActivitySnapshot;
    expect(stored.languages).toBeDefined();
    expect(stored.contributions).toBeUndefined();
    expect(stored.codingTime).toBeDefined();
  });

  it('notes a missing WakaTime key and saves what the other sources gathered', async () => {
    writeFileSync(path, serializeProfile(FULL_CONFIG), 'utf8');

    const out = await runActivitySync([path], {
      fetch: happyFetch,
      getSecrets: () => ({ githubToken: 'gh-token' }),
      now: NOW,
    });

    expect(out.code).toBe(0);
    expect(out.stderr).toContain('TAKUHON_WAKATIME_KEY is not set');
    const stored = JSON.parse(readFileSync(activityPath, 'utf8')) as ActivitySnapshot;
    expect(stored.codingTime).toBeUndefined();
    expect(stored.languages).toBeDefined();
  });

  it('keeps the last-known snapshot when the sync gathers nothing (exit 1)', async () => {
    const existing = `${JSON.stringify({ lastSyncedAt: '2026-06-01T00:00:00.000Z' })}\n`;
    writeFileSync(activityPath, existing, 'utf8');
    writeFileSync(
      path,
      serializeProfile({
        enabled: true,
        github: { username: 'octocat', showContributions: false },
      }),
      'utf8',
    );
    const failing = makeFetch(() => json({ message: 'boom' }, 500));

    const out = await runActivitySync([path], { fetch: failing, getSecrets: () => ({}) });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('github-languages failed');
    expect(out.stderr).toContain('keeping the last-known snapshot');
    expect(readFileSync(activityPath, 'utf8')).toBe(existing);
  });

  it('writes nothing when the sync gathers nothing and no snapshot exists (exit 1)', async () => {
    writeFileSync(
      path,
      serializeProfile({
        enabled: true,
        github: { username: 'octocat', showContributions: false },
      }),
      'utf8',
    );
    const failing = makeFetch(() => json({ message: 'boom' }, 500));

    const out = await runActivitySync([path], { fetch: failing, getSecrets: () => ({}) });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('nothing written');
    expect(existsSync(activityPath)).toBe(false);
  });
});

describe('runActivityShow()', () => {
  let dir: string;
  let path: string;
  let activityPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-activity-show-'));
    path = join(dir, 'takuhon.json');
    activityPath = join(dir, ACTIVITY_FILENAME);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', async () => {
    const out = await runActivityShow(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon activity show');
  });

  it('prints the stored snapshot as JSON', async () => {
    const snapshot: ActivitySnapshot = {
      lastSyncedAt: '2026-06-11T00:00:00.000Z',
      rank: { tier: 'B', score: 41 },
    };
    writeFileSync(activityPath, `${JSON.stringify(snapshot)}\n`, 'utf8');

    const out = await runActivityShow([path]);

    expect(out.code).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual(snapshot);
  });

  it('exits 1 when no snapshot is stored', async () => {
    const out = await runActivityShow([path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('no activity snapshot');
    expect(out.stderr).toContain('takuhon activity sync');
  });
});
