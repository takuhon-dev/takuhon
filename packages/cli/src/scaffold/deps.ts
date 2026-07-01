/**
 * Single source of truth for the `@takuhon/*` dependency range pinned into
 * every scaffolded project (Cloudflare and Vercel alike).
 *
 * All `@takuhon/*` packages release in lockstep, so a scaffolded project pins
 * the exact minor the CLI itself ships at (`^<major>.<minor>.0`). Advancing
 * this one constant on each release keeps both platform scaffolds in step; the
 * `scaffold.test.ts` pin-guard derives the expected range from the CLI's own
 * version, so a missed bump fails CI. (Under 0.x a caret could not even span
 * minors, which is what made this pin load-bearing; from 1.0.0 the pin keeps
 * the scaffold on the same lockstep generation the guard asserts.)
 */
export const TAKUHON_DEP_RANGE = '^1.1.0';
