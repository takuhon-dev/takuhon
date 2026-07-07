/**
 * Shared argument parsing for the admin-bundle commands (`takuhon admin update`
 * / `takuhon admin verify`).
 *
 * Both accept an optional project path and `--dir <name>` naming the bundle
 * directory within the project (default `admin-dist/`). A project that serves
 * the admin bundle from a *shared* assets directory — e.g. a Cloudflare
 * `public/` that also holds PWA/static files — passes `--dir public`. `--dir` is
 * restricted to a single path segment so a command that rm/replaces files can
 * never be pointed outside the intended directory (`..`, absolute paths, and
 * nested paths are rejected).
 */

import { ADMIN_DIST_DIRNAME } from './scaffold/wrangler-toml.js';

export interface AdminTargetArgs {
  /** The positional project path, or `undefined` for the current directory. */
  readonly pathArg: string | undefined;
  /** The bundle directory name within the project (a single, safe path segment). */
  readonly dir: string;
}

/**
 * Parse `[path] [--dir <name>]`. Rejects unknown flags, more than one path
 * argument, and an unsafe `--dir` value. Returns `{ error }` with a message
 * suitable for the caller's usage error.
 */
export function parseAdminTargetArgs(
  args: readonly string[],
): AdminTargetArgs | { readonly error: string } {
  let dir = ADMIN_DIST_DIRNAME;
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--dir') {
      const value = args[i + 1];
      if (value === undefined) return { error: `option '--dir' requires a value.` };
      dir = value;
      i++;
    } else if (arg.startsWith('--dir=')) {
      dir = arg.slice('--dir='.length);
    } else if (arg.startsWith('-')) {
      return { error: `unknown option '${arg}'.` };
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length > 1) {
    return { error: 'takes at most one path argument.' };
  }
  if (dir === '' || dir === '.' || dir === '..' || dir.includes('/') || dir.includes('\\')) {
    return { error: `'--dir' must be a single directory name (got '${dir}').` };
  }
  return { pathArg: positionals[0], dir };
}
