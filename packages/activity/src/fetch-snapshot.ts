/**
 * Build an {@link ActivitySnapshot} from the owner's configured sources.
 *
 * Each source is fetched independently and degrades gracefully: a source that
 * is disabled, unconfigured, missing its secret, or failing is simply omitted
 * (its error is reported via {@link ActivityFetchDeps.onError}) rather than
 * aborting the whole snapshot. The caller (a CLI command or scheduled job)
 * decides what to do with a snapshot that gathered nothing — typically keeping
 * the last-known one rather than overwriting it with an empty result.
 *
 * This module performs network I/O, so it lives outside `@takuhon/core` (which
 * is platform-independent); it reuses core's pure transforms to shape the data.
 */

import {
  computeLanguagePercentages,
  deriveRankTier,
  formatCodingTime,
  type ActivitySettings,
  type ActivitySnapshot,
} from '@takuhon/core';

import { defaultFetch } from './fetch-impl.js';
import { GitHubClient } from './github.js';
import { WakaTimeClient } from './wakatime.js';

/** Secrets for the activity sources. Never persisted; supplied per sync run. */
export interface ActivitySecrets {
  /** GitHub token. Optional for languages; REQUIRED for contributions. */
  githubToken?: string;
  /** WakaTime API key. REQUIRED to read coding time. */
  wakatimeKey?: string;
}

export interface ActivityFetchDeps {
  /** HTTP client. Defaults to the runtime global `fetch` (Node 22+ / Workers). */
  fetch?: typeof fetch;
  /** Clock for `lastSyncedAt`; injectable for deterministic tests. */
  now?: () => Date;
  /** Reports a per-source failure so the caller can audit-log it. */
  onError?: (
    source: 'github-languages' | 'github-contributions' | 'wakatime',
    err: unknown,
  ) => void;
}

/**
 * Fetch and assemble the activity snapshot for the given config. Always
 * resolves (never rejects): failures surface through `onError` and leave the
 * corresponding field absent.
 */
export async function fetchActivitySnapshot(
  config: ActivitySettings,
  secrets: ActivitySecrets = {},
  deps: ActivityFetchDeps = {},
): Promise<ActivitySnapshot> {
  const fetchImpl = deps.fetch ?? defaultFetch;
  const now = deps.now ?? ((): Date => new Date());
  const onError = deps.onError ?? ((): void => undefined);
  const github = new GitHubClient(fetchImpl);
  const wakatime = new WakaTimeClient(fetchImpl);

  const snapshot: ActivitySnapshot = { lastSyncedAt: now().toISOString() };

  let contributionsTotal: number | undefined;
  let codingSeconds: number | undefined;

  const githubUser = config.github?.username;
  if (githubUser !== undefined && githubUser !== '') {
    if (config.github?.showLanguages !== false) {
      try {
        const languages = computeLanguagePercentages(
          await github.fetchLanguages(githubUser, secrets.githubToken),
        );
        if (languages.length > 0) snapshot.languages = languages;
      } catch (err) {
        onError('github-languages', err);
      }
    }
    // Contributions require a token (GraphQL-only); skip silently without one.
    if (config.github?.showContributions !== false && secrets.githubToken) {
      try {
        const calendar = await github.fetchContributions(githubUser, secrets.githubToken);
        snapshot.contributions = calendar;
        contributionsTotal = calendar.total;
      } catch (err) {
        onError('github-contributions', err);
      }
    }
  }

  const wakatimeUser = config.wakatime?.username;
  if (
    wakatimeUser !== undefined &&
    wakatimeUser !== '' &&
    config.wakatime?.showCodingTime !== false &&
    secrets.wakatimeKey
  ) {
    try {
      codingSeconds = await wakatime.fetchCodingSeconds(wakatimeUser, secrets.wakatimeKey);
      snapshot.codingTime = formatCodingTime(codingSeconds);
    } catch (err) {
      onError('wakatime', err);
    }
  }

  // Only rank when at least one signal was gathered, so an unconfigured /
  // failed sync does not stamp a misleading "D".
  if (
    config.showRank !== false &&
    (contributionsTotal !== undefined || codingSeconds !== undefined)
  ) {
    snapshot.rank = deriveRankTier({ contributions: contributionsTotal, codingSeconds });
  }

  return snapshot;
}

/** True when the snapshot carries no metric data (only `lastSyncedAt`). */
export function isEmptySnapshot(snapshot: ActivitySnapshot): boolean {
  return (
    snapshot.languages === undefined &&
    snapshot.contributions === undefined &&
    snapshot.codingTime === undefined &&
    snapshot.rank === undefined
  );
}
