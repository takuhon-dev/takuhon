/**
 * `takuhon sync [path] --url <base-url> [--if-match <etag>] [--dry-run]` —
 * push a local `takuhon.json` to a deployed takuhon instance.
 *
 * `sync` is the secondary update path in Spec §9.6: it mirrors the local
 * profile into the deployment's store by calling the same admin write
 * endpoint the Admin UI uses — `PUT <base-url>/api/admin/profile` — so it
 * reuses the server's schema validation, optimistic locking, audit logging,
 * and edge-cache purge. The local file is the source of truth: by default the
 * push is unconditional (a mirror). Pass `--if-match <etag>` to opt into
 * optimistic locking (the server rejects the write with 409 if the stored
 * version no longer matches).
 *
 * The admin bearer token is read from the `TAKUHON_ADMIN_TOKEN` environment
 * variable, never a flag, so it cannot leak into shell history; the name
 * matches the Worker secret. The document is sent as-is after a local schema
 * check — `sync` does not migrate (run `takuhon migrate` first if the file is
 * an older schema version).
 *
 * Exit codes:
 *   0 — synced (or, with --dry-run, the payload is valid and ready to send)
 *   1 — the local file failed validation, or the remote refused the write for
 *       content reasons (422 validation, 409 If-Match conflict)
 *   2 — the command could not run: bad arguments, a missing/unreadable/non-JSON
 *       file, an unset token, an auth failure (401/403), a network error, or
 *       any other non-success response
 */

import { readFileSync } from 'node:fs';

import { validate } from '@takuhon/core';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

/** Admin write endpoint, appended to the supplied `--url` origin. */
const ADMIN_PROFILE_PATH = '/api/admin/profile';

/** Environment variable carrying the deployment's admin bearer token. */
const TOKEN_ENV = 'TAKUHON_ADMIN_TOKEN';

const USAGE = `Usage: takuhon sync [path] --url <base-url> [--if-match <etag>] [--dry-run]

Push a local takuhon.json to a deployed takuhon instance by calling its admin
write endpoint (PUT <base-url>/api/admin/profile). With no path, syncs
./takuhon.json in the current working directory.

The local file is the source of truth: by default the push is unconditional
(a mirror). Pass --if-match <etag> to opt into optimistic locking (the server
returns 409 if the stored version no longer matches). The document is sent
as-is after a local schema check; run \`takuhon migrate\` first if it is an
older schema version.

The admin bearer token is read from the ${TOKEN_ENV} environment variable, e.g.:
  ${TOKEN_ENV}=... takuhon sync --url https://me.example

Options:
  --url <base-url> Required. Absolute http(s) origin of the deployment.
  --if-match <etag> Send If-Match for optimistic locking (opt-in).
  --dry-run        Validate locally and report what would be sent; no request.

Exit codes: 0 = synced (or dry-run ok), 1 = local invalid / remote refused
(422 / 409), 2 = bad arguments / file missing / unreadable / not JSON / token
unset / auth failure / network error / other non-success response.
`;

export interface SyncOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/** Injectable dependencies, so tests can stub the network and the token source. */
export interface SyncDeps {
  /** HTTP client. Defaults to the global `fetch` (Node 22+). */
  fetch?: typeof fetch;
  /** Admin token source. Defaults to reading `TAKUHON_ADMIN_TOKEN`. */
  getToken?: () => string | undefined;
}

interface ParsedArgs {
  path: string;
  url: string;
  ifMatch?: string;
  dryRun: boolean;
}

/**
 * Run `takuhon sync` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"sync"`).
 */
export async function runSync(
  args: readonly string[] = [],
  deps: SyncDeps = {},
): Promise<SyncOutcome> {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon sync --help\` for usage.\n`,
    };
  }

  return syncProfile(parsed, deps);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  let url: string | undefined;
  let ifMatch: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--url' || arg === '--if-match') {
      const value = args[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return { error: `takuhon: \`${arg}\` requires a value.` };
      }
      if (arg === '--url') url = value;
      else ifMatch = value;
      i++;
      continue;
    }
    if (arg.startsWith('--url=')) {
      const value = arg.slice('--url='.length);
      if (value === '') return { error: 'takuhon: `--url` requires a value.' };
      url = value;
      continue;
    }
    if (arg.startsWith('--if-match=')) {
      const value = arg.slice('--if-match='.length);
      if (value === '') return { error: 'takuhon: `--if-match` requires a value.' };
      ifMatch = value;
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`sync\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `sync` takes at most one path argument.' };
    }
    path = arg;
  }

  if (url === undefined) {
    return { error: 'takuhon: `sync` requires `--url <base-url>`.' };
  }
  const base = parseOrigin(url);
  if ('error' in base) return base;

  return { path: path ?? DEFAULT_PATH, url: base.origin, ifMatch, dryRun };
}

/**
 * Validate `--url` and reduce it to a bare `http(s)` origin. We reject any URL
 * carrying a path, query, fragment, or credentials: the admin endpoint is
 * appended to the origin, and a non-origin URL would both misplace that suffix
 * and risk sending the bearer token to an unintended target.
 */
function parseOrigin(value: string): { origin: string } | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'takuhon: `--url` must be an absolute http(s) URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'takuhon: `--url` must be an absolute http(s) URL.' };
  }
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    return {
      error:
        "takuhon: `--url` must be the deployment's origin (e.g. https://me.example), " +
        'with no path, query, or credentials.',
    };
  }
  return { origin: parsed.origin };
}

/** Remove any literal occurrence of a secret from a string before it is shown. */
function redact(text: string, secret: string): string {
  return secret === '' ? text : text.split(secret).join('***');
}

/** Strip RFC 7232 double-quote delimiters so the value can be re-wrapped cleanly. */
function unquoteETag(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function syncProfile(parsed: ParsedArgs, deps: SyncDeps): Promise<SyncOutcome> {
  const { path, url, ifMatch, dryRun } = parsed;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { code: 2, stdout: '', stderr: `takuhon: cannot read '${path}'.\n` };
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
      stderr: `takuhon: '${path}' is not a valid takuhon profile; refusing to sync:\n${lines.join('\n')}\n`,
    };
  }

  const endpoint = `${url}${ADMIN_PROFILE_PATH}`;
  const body = `${JSON.stringify(result.data)}\n`;
  const bytes = Buffer.byteLength(body, 'utf8');

  if (dryRun) {
    const lock = ifMatch !== undefined ? `, If-Match "${unquoteETag(ifMatch)}"` : '';
    return {
      code: 0,
      stdout: `would sync ${path} -> ${endpoint} (${String(bytes)} bytes${lock})\n--dry-run: nothing sent.\n`,
      stderr: '',
    };
  }

  const getToken = deps.getToken ?? (() => process.env[TOKEN_ENV]);
  const token = getToken();
  if (token === undefined || token === '') {
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: ${TOKEN_ENV} is not set; sync needs the deployment's admin token.\n` +
        `Set it for this command only, e.g.:\n` +
        `  ${TOKEN_ENV}=... takuhon sync --url ${url}\n`,
    };
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  };
  if (ifMatch !== undefined) {
    headers['if-match'] = `"${unquoteETag(ifMatch)}"`;
  }

  const fetchImpl = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(endpoint, { method: 'PUT', headers, body });
  } catch (error) {
    const detail = redact(error instanceof Error ? error.message : String(error), token);
    return { code: 2, stdout: '', stderr: `takuhon: could not reach ${endpoint}: ${detail}\n` };
  }

  return interpretResponse(res, { path, url, endpoint });
}

interface Target {
  path: string;
  url: string;
  endpoint: string;
}

async function interpretResponse(res: Response, target: Target): Promise<SyncOutcome> {
  const { path, url, endpoint } = target;

  if (res.ok) {
    const version = await readVersion(res);
    if (version === undefined) {
      // A 2xx without the admin API's `{ meta: { version } }` envelope means we
      // did not actually reach a takuhon admin endpoint (a proxy login page, a
      // static host, a wrong path). Do not claim success.
      return {
        code: 2,
        stdout: '',
        stderr: `takuhon: unexpected response from ${endpoint} (HTTP ${String(res.status)} but no meta.version); is --url a takuhon deployment?\n`,
      };
    }
    return { code: 0, stdout: `synced ${path} -> ${url} (version ${version})\n`, stderr: '' };
  }

  const problem = await readProblem(res);
  const status = res.status;

  if (status === 409) {
    const current = problem?.currentVersion;
    const hint =
      current !== undefined
        ? `remote is at version ${current}. Re-sync against it, or drop --if-match to overwrite.`
        : 'the stored version no longer matches --if-match. Re-sync, or drop --if-match to overwrite.';
    return { code: 1, stdout: '', stderr: `takuhon: sync conflict (409): ${hint}\n` };
  }

  if (status === 422) {
    const errors = Array.isArray(problem?.errors) ? problem.errors : [];
    const lines = errors.map((e) => `  ${e.path}: ${e.message}`);
    const detail = lines.length > 0 ? `:\n${lines.join('\n')}` : '.';
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: the deployment rejected the profile (422)${detail}\n`,
    };
  }

  if (status === 401 || status === 403) {
    const reason =
      status === 401
        ? `unauthorized (401); check ${TOKEN_ENV}`
        : 'forbidden (403); the request origin may not be allowed';
    return { code: 2, stdout: '', stderr: `takuhon: ${reason}.\n` };
  }

  const detail = problem?.detail ?? res.statusText ?? '';
  const tail = detail ? `: ${detail}` : '.';
  return { code: 2, stdout: '', stderr: `takuhon: sync failed (${String(status)})${tail}\n` };
}

interface ProblemBody {
  detail?: string;
  currentVersion?: string;
  errors?: { path: string; message: string }[];
}

/** Best-effort parse of the success body's `meta.version`. */
async function readVersion(res: Response): Promise<string | undefined> {
  try {
    const parsed = (await res.json()) as { meta?: { version?: unknown } };
    const version = parsed.meta?.version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort parse of an RFC 7807 problem body; undefined if it is not JSON. */
async function readProblem(res: Response): Promise<ProblemBody | undefined> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text) as ProblemBody;
  } catch {
    return undefined;
  }
}
