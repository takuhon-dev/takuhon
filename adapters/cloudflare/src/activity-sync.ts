/**
 * Scheduled developer-activity sync for the Cloudflare worker.
 *
 * The cron-driven counterpart of the CLI's `takuhon activity sync`: it reads
 * `settings.activity` from the stored profile, fetches the configured GitHub /
 * WakaTime metrics through `@takuhon/activity`, and persists the snapshot via
 * an `ActivityStorage` — so public rendering stays a static read.
 *
 * The function reports its outcome instead of throwing wherever it can, and a
 * sync that gathers no data never overwrites a good snapshot: the last-known
 * one is kept and the result says so, letting the `scheduled` handler log the
 * failure without failing the cron run.
 */

import { fetchActivitySnapshot, isEmptySnapshot, type ActivitySecrets } from '@takuhon/activity';
import {
  NotFoundError,
  type ActivityStorage,
  type Takuhon,
  type TakuhonStorage,
} from '@takuhon/core';

export interface ActivitySyncOptions {
  /** Source of the profile whose `settings.activity` configures the sync. */
  profileStorage: TakuhonStorage;
  /** Destination for the synced snapshot. */
  activityStorage: ActivityStorage;
  /** Secrets from the Worker env; never persisted. */
  secrets: ActivitySecrets;
  /** Fallback profile used when storage has none (same as the public app). */
  fallback?: () => Takuhon;
  /** HTTP client override for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Clock for `lastSyncedAt`; injectable for deterministic tests. */
  now?: () => Date;
}

/** A per-source fetch failure, with any secret value already redacted. */
export interface ActivitySourceFailure {
  source: string;
  message: string;
}

export interface ActivitySyncResult {
  /**
   * `synced` — a snapshot was gathered and stored. `skipped` — activity is not
   * configured / enabled, so nothing was attempted. `empty` — every configured
   * source came back empty or failing; the last-known snapshot was kept.
   */
  status: 'synced' | 'skipped' | 'empty';
  /** Why a `skipped` / `empty` run did not store anything. */
  reason?: string;
  /** Per-source failures reported by the fetcher (may be non-empty on `synced`). */
  failures: ActivitySourceFailure[];
}

/** Remove any literal occurrence of the secrets from a string before it is logged. */
function redactSecrets(text: string, secrets: ActivitySecrets): string {
  let out = text;
  for (const secret of [secrets.githubToken, secrets.wakatimeKey]) {
    if (secret !== undefined && secret !== '') out = out.split(secret).join('***');
  }
  return out;
}

/**
 * Run one activity sync. Resolves with a result for every configuration state;
 * it only rejects if the storage layer itself fails (the `scheduled` handler
 * catches that, so a broken sync never fails the cron run).
 */
export async function syncActivity(opts: ActivitySyncOptions): Promise<ActivitySyncResult> {
  let profile: Takuhon;
  try {
    profile = (await opts.profileStorage.getProfile()).data;
  } catch (err) {
    if (err instanceof NotFoundError && opts.fallback) {
      profile = opts.fallback();
    } else if (err instanceof NotFoundError) {
      return { status: 'skipped', reason: 'no stored profile', failures: [] };
    } else {
      throw err;
    }
  }

  const config = profile.settings.activity;
  if (config?.enabled !== true) {
    return {
      status: 'skipped',
      reason: 'activity is not enabled in settings.activity',
      failures: [],
    };
  }
  const hasGithub = config.github?.username !== undefined && config.github.username !== '';
  const hasWakatime = config.wakatime?.username !== undefined && config.wakatime.username !== '';
  if (!hasGithub && !hasWakatime) {
    return { status: 'skipped', reason: 'no github or wakatime username configured', failures: [] };
  }

  const failures: ActivitySourceFailure[] = [];
  const snapshot = await fetchActivitySnapshot(config, opts.secrets, {
    fetch: opts.fetch,
    now: opts.now,
    onError: (source, err) => {
      const detail = err instanceof Error ? err.message : String(err);
      failures.push({ source, message: redactSecrets(detail, opts.secrets) });
    },
  });

  if (isEmptySnapshot(snapshot)) {
    // Never replace a good snapshot with an empty one (design §6): keep the
    // last-known document and report the dry run.
    return {
      status: 'empty',
      reason: 'the sync gathered no activity data; kept the last-known snapshot',
      failures,
    };
  }

  await opts.activityStorage.saveActivitySnapshot(snapshot);
  return { status: 'synced', failures };
}
