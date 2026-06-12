/**
 * Read-only activity-badge endpoint (`GET`/`HEAD /activity.svg`) for the
 * Cloudflare adapter.
 *
 * Renders the synced developer-activity snapshot as a self-contained SVG card,
 * suitable for embedding as an image in a GitHub profile README (served through
 * the Camo image proxy) or anywhere an `<img>` can point at a public URL. The
 * markup is the same `renderActivitySvg` output the profile page embeds, so the
 * badge never drifts from the in-page dashboard.
 *
 * Public and unauthenticated, at parity with `GET /api/activity`: the owner's
 * opt-in (`settings.activity.enabled`) is re-checked on every request, so
 * disabling the feature 404s the badge immediately even while a stale snapshot
 * is still stored. `?theme=dark` selects the dark palette; anything else
 * (including no query) renders the default light card.
 *
 * The card carries its own opaque background, so it stays legible on a dark
 * README. The response is `nosniff` `image/svg+xml` with a ~4h public cache
 * policy — the badge is fronted by GitHub's Camo cache, so the origin is hit
 * rarely.
 */

import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  NotFoundError,
  renderActivitySvg,
  type Takuhon,
} from '@takuhon/core';

import { KvActivityStorage } from './kv-activity-storage.js';
import { KvTakuhonStorage } from './kv-storage.js';

/**
 * ~4 hours, matching github-readme-stats' default. README badges are cached at
 * Camo, so a longer TTL keeps origin traffic minimal at the cost of a bounded
 * delay before a fresh sync shows up.
 */
export const ACTIVITY_SVG_CACHE_CONTROL = 'public, max-age=14400';

/**
 * Render `GET`/`HEAD /activity.svg` against the KV-backed profile and snapshot.
 * Builds its own storage wrappers from `kv` (no shared state) and falls back to
 * the bundled profile when KV is empty, exactly as the public API does.
 */
export async function serveActivitySvg(
  request: Request,
  kv: KVNamespace,
  fallback: () => Takuhon,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const notFound = (): Response => new Response('Not Found', { status: 404 });

  // Re-check the owner's opt-in on every request (parity with GET /api/activity):
  // disabling settings.activity must 404 the badge immediately, even while a
  // stale snapshot is still stored.
  let profile: Takuhon;
  try {
    profile = (await new KvTakuhonStorage(kv).getProfile()).data;
  } catch (e) {
    // KV is empty before the first admin write; serve the bundled profile.
    if (e instanceof NotFoundError) profile = fallback();
    else throw e;
  }
  if (profile.settings.activity?.enabled !== true) return notFound();

  const snapshot = await new KvActivityStorage(kv).getActivitySnapshot();
  if (snapshot === null) return notFound();

  const palette =
    new URL(request.url).searchParams.get('theme') === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const svg = renderActivitySvg(snapshot, { palette });
  // An opted-in but metric-less snapshot renders to ''. There is no image to
  // serve, so treat it like a missing snapshot rather than emit an empty badge.
  if (svg === '') return notFound();

  return new Response(request.method === 'HEAD' ? null : svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': ACTIVITY_SVG_CACHE_CONTROL,
      // Force nosniff so the SVG can't be reinterpreted as another type
      // (security.md §4.7), matching the /assets/* delivery proxy.
      'x-content-type-options': 'nosniff',
    },
  });
}
