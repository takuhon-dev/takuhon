/**
 * `takuhon dev [path] [--port <n>] [--base-url <url>]` — serve a `takuhon.json`
 * as a local static preview (Spec §14.1 Phase 1 "edit → preview").
 *
 * This is the in-memory companion of `takuhon build`: it renders the same
 * per-locale surface (via the shared {@link generateSite}) but serves it over
 * `node:http` instead of writing to disk — no bundler, no Hono/Vite/React, no
 * remote/secret coupling. The source is re-read and re-rendered on every
 * request, so editing `takuhon.json` and reloading the browser shows changes
 * with no watch machinery; an invalid file is served as a live error page so it
 * can be fixed in place.
 *
 * A long-running server does not fit the pure `runXxx → {code,stdout,stderr}`
 * shape of the other commands, so the testable logic is split from the I/O:
 * {@link loadSiteState} (source → route map), {@link resolveRoute},
 * {@link contentType}, and {@link handleRequest} are pure; {@link createDevServer}
 * and {@link runDev} are the thin `node:http` wrapper around them.
 *
 * Exit codes:
 *   0 — served, then stopped cleanly (Ctrl-C), or `--help`
 *   2 — the command could not run: bad arguments, a missing/unreadable file,
 *       or the port was already in use
 */

import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';

import { applyPublicPrivacyFilter, normalize, validate } from '@takuhon/core';

import { escapeHtml } from './build-html.js';
import { readActivitySnapshotSync } from './file-activity-storage.js';
import { generateSite } from './site.js';

const DEFAULT_PATH = 'takuhon.json';
const DEFAULT_PORT = 4321;

const USAGE = `Usage: takuhon dev [path] [--port <n>] [--base-url <url>]

Serve a takuhon.json as a local static preview (one page per locale, plus a
print-ready CV page at /cv) — the same surface \`takuhon build\` produces. With
no path, serves ./takuhon.json. The file is re-read and re-rendered on every
request, so edit it and reload the browser to see changes. Stop with Ctrl-C.

Options:
  --port <n>       Port to listen on (default: ${DEFAULT_PORT}).
  --base-url <url> Site origin (e.g. https://me.example). Enables absolute
                   canonical and hreflang links; without it those are omitted.

The public privacy filter is applied (meta.privacy is honoured). An invalid
takuhon.json is served as an error page so you can fix it and reload.

Exit codes: 0 = served then stopped, 2 = bad arguments / file missing /
unreadable / port in use.
`;

/** Injectable output sinks so tests can capture streams without a real TTY. */
export interface DevDeps {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

interface ParsedArgs {
  path: string;
  port: number;
  baseUrl?: string;
}

/**
 * The current render state of the source file. Recomputed per request so edits
 * are reflected on reload; a read/parse/validate failure becomes a served error
 * page rather than crashing the server.
 */
export type SiteState =
  | { readonly ok: true; readonly pages: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly status: number; readonly message: string };

/** A fully-resolved HTTP response, independent of the `node:http` socket. */
export interface DevResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

/**
 * Read, validate, and render `path` into a route→HTML map. Any failure (missing
 * file, bad JSON, invalid profile) yields a 500 state carrying a human-readable
 * message — validation errors are formatted with their JSON Pointers, mirroring
 * `takuhon build`. The public privacy filter is applied, exactly as `build` does.
 */
export function loadSiteState(path: string, baseUrl?: string): SiteState {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, status: 500, message: `cannot read '${path}'.` };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 500, message: `'${path}' is not valid JSON: ${detail}` };
  }

  const result = validate(data);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    return {
      ok: false,
      status: 500,
      message: `'${path}' is not a valid takuhon profile:\n${lines.join('\n')}`,
    };
  }

  const filtered = applyPublicPrivacyFilter(normalize(result.data));
  // Re-read the synced activity snapshot alongside the profile on every load,
  // so a fresh `takuhon activity sync` shows up on the next request. Only read
  // when the owner opted in; generateSite re-checks the gate.
  const activitySnapshot =
    filtered.settings.activity?.enabled === true ? readActivitySnapshotSync(path) : null;
  // `dev` always renders the CV page too (at /cv), so it is previewable without
  // a flag; `takuhon build` gates the same output behind `--cv`.
  const pages = new Map(
    generateSite(filtered, { baseUrl, activitySnapshot, cv: true }).map((p) => [p.route, p.html]),
  );
  return { ok: true, pages };
}

/**
 * Normalize a request path to a site route key. A trailing `index.html` is
 * stripped and a trailing slash is added, so `/ja`, `/ja/`, and
 * `/ja/index.html` all map to `/ja/` (and `/`, ``, `/index.html` to `/`).
 */
export function resolveRoute(urlPath: string): string {
  let p = urlPath;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    // Keep the raw path on malformed percent-encoding; it will simply 404.
  }
  p = p.replace(/\/index\.html$/, '/');
  if (p === '' || p === '/') return '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

/**
 * Content-type for a served route. The static surface is HTML-only (the build
 * emits one HTML page per locale and no assets/JSON), so this is constant; it is
 * a named function to keep the response shape ready should the surface grow.
 */
export function contentType(_route: string): string {
  return 'text/html; charset=utf-8';
}

/** Resolve a request to a response against the current {@link SiteState}. Pure. */
export function handleRequest(method: string, urlPath: string, state: SiteState): DevResponse {
  if (method !== 'GET' && method !== 'HEAD') {
    return { status: 405, contentType: 'text/plain; charset=utf-8', body: 'Method Not Allowed\n' };
  }
  if (!state.ok) {
    return {
      status: state.status,
      contentType: contentType('/'),
      body: renderErrorPage(state.message),
    };
  }
  const route = resolveRoute(urlPath);
  const html = state.pages.get(route);
  if (html === undefined) {
    return {
      status: 404,
      contentType: contentType(route),
      body: renderNotFoundPage(route, [...state.pages.keys()]),
    };
  }
  return { status: 200, contentType: contentType(route), body: html };
}

/**
 * Create the preview server. Each request recomputes the site state (so edits
 * are live on reload) and delegates to the pure {@link handleRequest}. Not
 * started here — the caller binds a port. Importing this module has no side
 * effects.
 */
export function createDevServer(opts: { path: string; baseUrl?: string }): Server {
  return createServer((req, res) => {
    const method = req.method ?? 'GET';
    const state = loadSiteState(opts.path, opts.baseUrl);
    const response = handleRequest(method, pathnameOf(req.url ?? '/'), state);
    res.writeHead(response.status, { 'Content-Type': response.contentType });
    if (method === 'HEAD') res.end();
    else res.end(response.body);
  });
}

/**
 * Run `takuhon dev`. Resolves with the process exit code: it stays pending while
 * the server runs and resolves on graceful shutdown (Ctrl-C). Argument and
 * missing-file errors return before any port is bound.
 */
export async function runDev(args: readonly string[] = [], deps: DevDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((text: string) => void process.stdout.write(text));
  const err = deps.stderr ?? ((text: string) => void process.stderr.write(text));

  if (args[0] === '--help' || args[0] === '-h') {
    out(USAGE);
    return 0;
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    err(`${parsed.error}\nRun \`takuhon dev --help\` for usage.\n`);
    return 2;
  }

  // Fast-fail only when the source is missing/unreadable — there is nothing to
  // preview. A present-but-invalid file is served as a live error page instead,
  // so it can be fixed without restarting the server.
  try {
    readFileSync(parsed.path, 'utf8');
  } catch {
    err(
      `takuhon: cannot read '${parsed.path}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    );
    return 2;
  }

  const server = createDevServer({ path: parsed.path, baseUrl: parsed.baseUrl });

  return await new Promise<number>((resolve) => {
    let closing = false;
    const shutdown = (): void => {
      if (closing) return;
      closing = true;
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      server.close(() => resolve(0));
      // Drop keep-alive sockets so close() does not hang (Node >= 18.2).
      server.closeAllConnections();
    };

    server.once('error', (error: NodeJS.ErrnoException) => {
      // The signal handlers are only registered once listening starts, so a
      // bind failure (e.g. EADDRINUSE) has none to detach.
      if (error.code === 'EADDRINUSE') {
        err(`takuhon: port ${parsed.port} is already in use; pass --port <n> to choose another.\n`);
      } else {
        err(`takuhon: ${error.message}\n`);
      }
      resolve(2);
    });

    // Bind to loopback only: a local preview must not expose draft profile
    // content (or the dev error pages) to the rest of the network.
    server.listen(parsed.port, '127.0.0.1', () => {
      out(
        `takuhon dev: serving ${parsed.path} at http://localhost:${parsed.port}/ (Ctrl-C to stop)\n`,
      );
      // Surface a current validation problem up front; the browser shows it too.
      const state = loadSiteState(parsed.path, parsed.baseUrl);
      if (!state.ok) {
        err(
          `takuhon dev: ${parsed.path} is not a valid profile yet; the preview will show the error until it is fixed.\n`,
        );
      }
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });
  });
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  let portRaw: string | undefined;
  let baseUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--port' || arg === '--base-url') {
      const value = args[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return { error: `takuhon: \`${arg}\` requires a value.` };
      }
      if (arg === '--port') portRaw = value;
      else baseUrl = value;
      i++;
      continue;
    }
    if (arg.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      if (value === '') return { error: 'takuhon: `--port` requires a value.' };
      portRaw = value;
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      const value = arg.slice('--base-url='.length);
      if (value === '') return { error: 'takuhon: `--base-url` requires a value.' };
      baseUrl = value;
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`dev\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `dev` takes at most one path argument.' };
    }
    path = arg;
  }

  let port = DEFAULT_PORT;
  if (portRaw !== undefined) {
    const parsedPort = parsePort(portRaw);
    if (parsedPort === undefined) {
      return {
        error: `takuhon: \`--port\` must be an integer between 1 and 65535 (got \`${portRaw}\`).`,
      };
    }
    port = parsedPort;
  }

  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
    return { error: 'takuhon: `--base-url` must be an absolute http(s) URL.' };
  }

  return {
    path: path ?? DEFAULT_PATH,
    port,
    // Drop any trailing slash so URL joins are predictable.
    baseUrl: baseUrl?.replace(/\/+$/, ''),
  };
}

function parsePort(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Extract the path portion of a request URL, dropping any query/fragment. */
function pathnameOf(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

/** Minimal HTML document used by the dev-only error and 404 pages. */
function devPage(title: string, body: string): string {
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(title)}</title>\n` +
    `<style>body{margin:0;font:16px/1.6 system-ui,-apple-system,sans-serif;color:#1a1a1a}` +
    `main{max-width:42rem;margin:2rem auto;padding:0 1.25rem}` +
    `pre{background:#f6f6f6;padding:1rem;border-radius:.4rem;overflow:auto;white-space:pre-wrap}` +
    `code{background:#f2f2f2;padding:.1rem .3rem;border-radius:.2rem}</style>\n` +
    `</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`
  );
}

function renderErrorPage(message: string): string {
  return devPage(
    'takuhon dev — error',
    `<h1>takuhon dev</h1>\n<p>The profile could not be rendered:</p>\n` +
      `<pre>${escapeHtml(message)}</pre>\n<p>Fix the file and reload.</p>`,
  );
}

function renderNotFoundPage(route: string, routes: readonly string[]): string {
  const links = routes
    .map((r) => `<li><a href="${escapeHtml(r)}">${escapeHtml(r)}</a></li>`)
    .join('');
  return devPage(
    'takuhon dev — 404',
    `<h1>404</h1>\n<p>No page for <code>${escapeHtml(route)}</code>.</p>\n` +
      `<p>Available pages:</p>\n<ul>${links}</ul>`,
  );
}
