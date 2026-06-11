/**
 * `takuhon build [path] [--output <dir>] [--base-url <url>]` — render a
 * `takuhon.json` into a deployable static site (Spec §13 Static Edition).
 *
 * Mirrors the other command runners: {@link runBuild} is a pure function that
 * reads the source itself and returns its output as strings plus an exit code.
 * The render pipeline reuses `@takuhon/core` only: validate → normalize →
 * `applyPublicPrivacyFilter` (so the static site honours `meta.privacy` exactly
 * like the live API) → for each available locale `resolveLocale` →
 * {@link renderProfileHtml}. The default locale is written to `<dir>/index.html`
 * and every other locale to `<dir>/<locale>/index.html`.
 *
 * Canonical / hreflang links require absolute URLs, so they are emitted only
 * when `--base-url` is supplied; the human locale switcher always uses
 * depth-correct relative links. Asset files are referenced by URL as-is and
 * never copied (out of scope; assets are remote per the schema). Writes are
 * atomic via {@link writeFileAtomic}.
 *
 * Exit codes:
 *   0 — site generated (or `--help`)
 *   1 — the source was read but is not a valid takuhon profile
 *   2 — the command could not run: bad arguments, a missing/unreadable file,
 *       a non-JSON file, or a failed write
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { applyPublicPrivacyFilter, normalize, validate } from '@takuhon/core';

import { writeFileAtomic } from './backup.js';
import { readActivitySnapshotSync } from './file-activity-storage.js';
import { generateSite } from './site.js';

const DEFAULT_PATH = 'takuhon.json';
const DEFAULT_OUTPUT = 'dist';

const USAGE = `Usage: takuhon build [path] [--output <dir>] [--base-url <url>]

Render a takuhon.json into a static site (one HTML page per locale, with
build-time Schema.org JSON-LD). With no path, builds ./takuhon.json.

Options:
  --output <dir>   Output directory (default: ${DEFAULT_OUTPUT}). The default
                   locale is written to <dir>/index.html and each other locale
                   to <dir>/<locale>/index.html.
  --base-url <url> Site origin (e.g. https://me.example). Enables absolute
                   canonical and hreflang links; without it those are omitted.

The public privacy filter is applied (meta.privacy is honoured). Asset URLs are
referenced as-is and are not copied. The output directory is written into, not
cleaned — use a dedicated/empty directory so stale pages do not linger.

Exit codes: 0 = built, 1 = source is not a valid profile,
2 = bad arguments / file missing / unreadable / not JSON / write failed.
`;

export interface BuildOutcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface ParsedArgs {
  path: string;
  output: string;
  baseUrl?: string;
}

/**
 * Run `takuhon build` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"build"`).
 */
export function runBuild(args: readonly string[] = []): BuildOutcome {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon build --help\` for usage.\n`,
    };
  }

  return buildSite(parsed);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  let output: string | undefined;
  let baseUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--output' || arg === '--base-url') {
      const value = args[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return { error: `takuhon: \`${arg}\` requires a value.` };
      }
      if (arg === '--output') output = value;
      else baseUrl = value;
      i++;
      continue;
    }
    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length);
      if (value === '') return { error: 'takuhon: `--output` requires a value.' };
      output = value;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      const value = arg.slice('--base-url='.length);
      if (value === '') return { error: 'takuhon: `--base-url` requires a value.' };
      baseUrl = value;
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`build\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `build` takes at most one path argument.' };
    }
    path = arg;
  }

  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
    return { error: 'takuhon: `--base-url` must be an absolute http(s) URL.' };
  }

  return {
    path: path ?? DEFAULT_PATH,
    output: output ?? DEFAULT_OUTPUT,
    // Drop any trailing slash so URL joins are predictable.
    baseUrl: baseUrl?.replace(/\/+$/, ''),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildSite(parsed: ParsedArgs): BuildOutcome {
  const { path, output, baseUrl } = parsed;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: cannot read '${path}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: '${path}' is not valid JSON: ${detail}\n` };
  }

  const result = validate(data);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: '${path}' is not a valid takuhon profile; refusing to build:\n${lines.join('\n')}\n`,
    };
  }

  const filtered = applyPublicPrivacyFilter(normalize(result.data));
  // The synced developer-activity snapshot (activity.json beside the profile)
  // is read only when the owner opted in; generateSite re-checks the gate.
  const activitySnapshot =
    filtered.settings.activity?.enabled === true ? readActivitySnapshotSync(path) : null;

  const written: string[] = [];
  try {
    for (const page of generateSite(filtered, { baseUrl, activitySnapshot })) {
      const outFile = join(output, page.file);
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileAtomic(outFile, page.html);
      written.push(outFile);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: failed to write the site: ${detail}\n` };
  }

  const summary = written.map((w) => `  ${w}`).join('\n');
  return {
    code: 0,
    stdout: `built ${written.length} page${written.length === 1 ? '' : 's'} from ${path}:\n${summary}\n`,
    stderr: '',
  };
}
