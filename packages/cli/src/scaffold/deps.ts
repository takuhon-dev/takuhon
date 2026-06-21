/**
 * Single source of truth for the `@takuhon/*` dependency range pinned into
 * every scaffolded project (Cloudflare and Vercel alike).
 *
 * Under 0.x semver a caret does not span minors, so a scaffolded project must
 * pin the same minor the CLI itself ships at — all `@takuhon/*` packages release
 * in lockstep. Advancing this one constant on each minor release keeps both
 * platform scaffolds in step; the `scaffold.test.ts` pin-guard derives the
 * expected range from the CLI's own version, so a missed bump fails CI.
 */
export const TAKUHON_DEP_RANGE = '^0.23.0';
