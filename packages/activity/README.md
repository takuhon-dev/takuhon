# @takuhon/activity

Developer-activity fetchers for [takuhon](https://github.com/takuhon-dev/takuhon).

This package reads the profile owner's configured **GitHub** and **WakaTime**
activity and assembles an `ActivitySnapshot` (the shape defined by
`@takuhon/core`). It performs the network I/O that `@takuhon/core` deliberately
does not, and reuses core's pure transforms to shape the result.

A sync step — the `takuhon activity sync` CLI command or a Cloudflare scheduled
(cron) job — calls `fetchActivitySnapshot`, then persists the snapshot through
an `ActivityStorage`. Rendering then reads the stored snapshot statically; the
public render path never calls these APIs.

## Usage

```ts
import { fetchActivitySnapshot } from '@takuhon/activity';

const snapshot = await fetchActivitySnapshot(
  takuhon.settings.activity, // owner-curated config from takuhon.json
  {
    githubToken: process.env.TAKUHON_GITHUB_TOKEN, // optional; required for contributions
    wakatimeKey: process.env.TAKUHON_WAKATIME_KEY, // OAuth token; required for coding time
  },
  { onError: (source, err) => console.warn(`activity sync: ${source} failed`, err) },
);
```

Each source degrades gracefully: one that is disabled, unconfigured, missing
its secret, or failing is simply omitted (reported via `onError`) rather than
failing the whole snapshot. `isEmptySnapshot(snapshot)` reports when nothing was
gathered, so the caller can keep the last-known snapshot instead of overwriting
it with an empty one.

## Signals

| Signal        | Source                                                    | Auth                                                   |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| Language %    | GitHub REST `repos/{owner}/{repo}/languages` (aggregated) | Optional token (raises rate limit)                     |
| Contributions | GitHub GraphQL `contributionsCollection`                  | **Token required** (calendar is GraphQL-only)          |
| Coding time   | WakaTime `users/{user}/stats/{range}`                     | **OAuth access token required** (`read_stats`, Bearer) |

When GitHub rejects the token (expired or revoked) on the first request of the
language read, that read retries unauthenticated instead of failing, while the
contribution read still fails and reports it. The retry is subject to GitHub's
unauthenticated rate limit (60 requests per hour per IP), so on a host that
shares its outbound IP it may still be refused. WakaTime API keys cannot read stats — they are
write-only, for editor plugins sending activity — so the WakaTime secret must be
an OAuth access token (a personal one is issued at
<https://wakatime.com/oauth>).

Secrets are provided per sync run and never stored in `takuhon.json` or the
snapshot. The `fetch` implementation is injectable for testing; it defaults to
the runtime global (Node 22+ / Cloudflare Workers).
