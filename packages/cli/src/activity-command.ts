/**
 * `takuhon activity sync [path]` — fetch the GitHub / WakaTime activity
 * configured under `settings.activity` and store the snapshot as an
 * `activity.json` beside the profile, plus `takuhon activity show [path]` to
 * print what is stored.
 *
 * `activity` is a subcommand namespace (not a flag on `takuhon sync`): `sync`
 * already means "push the profile to a deployment", and the activity sync is a
 * different operation against different storage. Secrets are read from the
 * environment only (`TAKUHON_GITHUB_TOKEN` optional, `TAKUHON_WAKATIME_KEY`
 * required for WakaTime), never from flags or the profile, so they cannot leak
 * into shell history or any stored document.
 *
 * A sync that gathers no data never overwrites a good snapshot: the last-known
 * `activity.json` is kept and the command exits non-zero so a scheduled run
 * surfaces the failure.
 *
 * Exit codes:
 *   0 — snapshot synced and written (individual sources may still have been
 *       skipped or failed; those are reported on stderr) / snapshot shown
 *   1 — the sync gathered no data (the last-known snapshot, if any, is kept and
 *       nothing is written), or `show` found no stored snapshot
 *   2 — the command could not run: bad arguments, a missing/unreadable/non-JSON
 *       profile, or activity is not configured / not enabled in
 *       `settings.activity`
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { fetchActivitySnapshot, isEmptySnapshot, type ActivitySecrets } from '@takuhon/activity';
import type { ActivitySettings } from '@takuhon/core';

import { ACTIVITY_FILENAME, FileActivityStorage } from './file-activity-storage.js';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

/** Environment variable carrying the optional GitHub token. */
const GITHUB_TOKEN_ENV = 'TAKUHON_GITHUB_TOKEN';

/** Environment variable carrying the WakaTime API key. */
const WAKATIME_KEY_ENV = 'TAKUHON_WAKATIME_KEY';

const SYNC_USAGE = `Usage: takuhon activity sync [path]

Fetch the GitHub / WakaTime activity configured under settings.activity in a
takuhon.json and store the result as activity.json beside it — the sibling
snapshot the renderer reads, kept outside the canonical profile. With no path,
syncs ./takuhon.json in the current working directory.

Secrets are read from the environment, never from flags or the profile:
  ${GITHUB_TOKEN_ENV}   Optional. Raises the GitHub rate limit and unlocks the
                         contribution calendar (which is GraphQL/token-only).
                         Languages work without it.
  ${WAKATIME_KEY_ENV}   Required to read WakaTime coding time.

A sync that gathers no data keeps the last-known activity.json — a good
snapshot is never overwritten with an empty one.

Exit codes: 0 = synced, 1 = no data gathered (last-known snapshot kept),
2 = bad arguments / profile missing / unreadable / not JSON / activity not
configured or not enabled in settings.activity.
`;

const SHOW_USAGE = `Usage: takuhon activity show [path]

Print the stored activity snapshot (the activity.json beside the profile) as
JSON. With no path, reads beside ./takuhon.json in the current working
directory.

Exit codes: 0 = printed, 1 = no (or invalid) snapshot stored, 2 = bad
arguments.
`;

export interface ActivityOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/** Injectable dependencies, so tests can stub the network, secrets, and clock. */
export interface ActivitySyncDeps {
  /** HTTP client. Defaults to the global `fetch` (Node 22+). */
  fetch?: typeof fetch;
  /** Secret source. Defaults to reading the two environment variables. */
  getSecrets?: () => ActivitySecrets;
  /** Clock for `lastSyncedAt`; injectable for deterministic tests. */
  now?: () => Date;
}

function defaultSecrets(): ActivitySecrets {
  return {
    githubToken: process.env[GITHUB_TOKEN_ENV],
    wakatimeKey: process.env[WAKATIME_KEY_ENV],
  };
}

/** Parse the single optional positional path; `activity` takes no other options. */
function parsePathArg(
  args: readonly string[],
  sub: 'sync' | 'show',
): { path: string } | { error: string } {
  let path: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`activity ${sub}\`.` };
    }
    if (path !== undefined) {
      return { error: `takuhon: \`activity ${sub}\` takes at most one path argument.` };
    }
    path = arg;
  }
  return { path: path ?? DEFAULT_PATH };
}

/** The `activity.json` path as shown to the user, relative to the path they gave. */
function activityDisplayPath(profilePath: string): string {
  return join(dirname(profilePath), ACTIVITY_FILENAME);
}

/**
 * Read `settings.activity` out of the profile at `path`. The profile is not
 * schema-validated here — `activity sync` only needs the activity config, and
 * an unrelated validation error should not block a metrics refresh — but it
 * must be readable JSON and the config must be present, enabled, and name at
 * least one account to sync.
 */
function readActivityConfig(
  path: string,
): { config: ActivitySettings } | { outcome: ActivityOutcome } {
  const fail = (code: number, stderr: string): { outcome: ActivityOutcome } => ({
    outcome: { code, stdout: '', stderr },
  });

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return fail(
      2,
      `takuhon: cannot read '${path}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(2, `takuhon: '${path}' is not valid JSON: ${detail}\n`);
  }

  const settings =
    typeof data === 'object' && data !== null
      ? (data as { settings?: { activity?: ActivitySettings } }).settings
      : undefined;
  const config = settings?.activity;

  if (config === undefined) {
    return fail(
      2,
      `takuhon: '${path}' has no settings.activity; nothing to sync.\n` +
        `Opt in by adding settings.activity with "enabled": true and a github/wakatime username.\n`,
    );
  }
  if (config.enabled !== true) {
    return fail(
      2,
      `takuhon: activity is not enabled in '${path}'; nothing to sync.\n` +
        `Set settings.activity.enabled to true to opt in.\n`,
    );
  }
  const hasGithub = config.github?.username !== undefined && config.github.username !== '';
  const hasWakatime = config.wakatime?.username !== undefined && config.wakatime.username !== '';
  if (!hasGithub && !hasWakatime) {
    return fail(
      2,
      `takuhon: settings.activity in '${path}' names no github or wakatime username; nothing to sync.\n`,
    );
  }

  return { config };
}

/** Remove any literal occurrence of the secrets from a string before it is shown. */
function redactSecrets(text: string, secrets: ActivitySecrets): string {
  let out = text;
  for (const secret of [secrets.githubToken, secrets.wakatimeKey]) {
    if (secret !== undefined && secret !== '') out = out.split(secret).join('***');
  }
  return out;
}

/**
 * Run `takuhon activity sync` against the arguments that follow the
 * subcommand (i.e. `process.argv.slice(2)` minus the leading
 * `"activity", "sync"`).
 */
export async function runActivitySync(
  args: readonly string[] = [],
  deps: ActivitySyncDeps = {},
): Promise<ActivityOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: SYNC_USAGE, stderr: '' };
  }

  const parsed = parsePathArg(args, 'sync');
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon activity sync --help\` for usage.\n`,
    };
  }

  const read = readActivityConfig(parsed.path);
  if ('outcome' in read) return read.outcome;
  const { config } = read;

  const getSecrets = deps.getSecrets ?? defaultSecrets;
  const secrets = getSecrets();

  // A configured source whose secret is absent is skipped silently by the
  // fetcher; surface that here so a scheduled run's log explains the gap.
  const notes: string[] = [];
  const githubUser = config.github?.username;
  if (
    githubUser !== undefined &&
    githubUser !== '' &&
    config.github?.showContributions !== false &&
    !secrets.githubToken
  ) {
    notes.push(
      `takuhon: ${GITHUB_TOKEN_ENV} is not set; skipping GitHub contributions (languages need no token).\n`,
    );
  }
  const wakatimeUser = config.wakatime?.username;
  if (
    wakatimeUser !== undefined &&
    wakatimeUser !== '' &&
    config.wakatime?.showCodingTime !== false &&
    !secrets.wakatimeKey
  ) {
    notes.push(`takuhon: ${WAKATIME_KEY_ENV} is not set; skipping WakaTime coding time.\n`);
  }

  const snapshot = await fetchActivitySnapshot(config, secrets, {
    fetch: deps.fetch,
    now: deps.now,
    onError: (source, err) => {
      const detail = err instanceof Error ? err.message : String(err);
      notes.push(`takuhon: ${source} failed: ${redactSecrets(detail, secrets)}\n`);
    },
  });

  const storage = new FileActivityStorage(parsed.path);
  const displayPath = activityDisplayPath(parsed.path);
  const stderr = notes.join('');

  if (isEmptySnapshot(snapshot)) {
    // Never replace a good snapshot with an empty one: keep the last-known
    // file (if any) and exit non-zero so cron-style callers notice.
    const existing = await storage.getActivitySnapshot();
    const kept =
      existing !== null ? `keeping the last-known snapshot at '${displayPath}'` : 'nothing written';
    return {
      code: 1,
      stdout: '',
      stderr: `${stderr}takuhon: the sync gathered no activity data; ${kept}.\n`,
    };
  }

  await storage.saveActivitySnapshot(snapshot);
  const gathered = (['languages', 'contributions', 'codingTime', 'rank'] as const)
    .filter((field) => snapshot[field] !== undefined)
    .join(', ');
  return { code: 0, stdout: `synced activity -> ${displayPath} (${gathered})\n`, stderr };
}

/**
 * Run `takuhon activity show` against the arguments that follow the
 * subcommand.
 */
export async function runActivityShow(args: readonly string[] = []): Promise<ActivityOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: SHOW_USAGE, stderr: '' };
  }

  const parsed = parsePathArg(args, 'show');
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon activity show --help\` for usage.\n`,
    };
  }

  const snapshot = await new FileActivityStorage(parsed.path).getActivitySnapshot();
  if (snapshot === null) {
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: no activity snapshot at '${activityDisplayPath(parsed.path)}'. Run \`takuhon activity sync\` first.\n`,
    };
  }
  return { code: 0, stdout: `${JSON.stringify(snapshot, null, 2)}\n`, stderr: '' };
}
