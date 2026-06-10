/**
 * @takuhon/activity — developer-activity fetchers for takuhon.
 *
 * Reads the owner's configured GitHub / WakaTime activity and assembles a
 * {@link import('@takuhon/core').ActivitySnapshot}. This package performs the
 * network I/O that `@takuhon/core` deliberately does not; it reuses core's pure
 * transforms to shape the result. A sync step (a CLI command or a Cloudflare
 * scheduled job) calls {@link fetchActivitySnapshot} and persists the snapshot
 * via an `ActivityStorage`, so rendering stays a static read.
 */

export {
  fetchActivitySnapshot,
  isEmptySnapshot,
  type ActivityFetchDeps,
  type ActivitySecrets,
} from './fetch-snapshot.js';
export { GitHubClient, GitHubFetchError, DEFAULT_MAX_REPOS } from './github.js';
export { WakaTimeClient, WakaTimeFetchError, DEFAULT_WAKATIME_RANGE } from './wakatime.js';
