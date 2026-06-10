/**
 * `takuhon admin [path] [--port <n>] [--base-url <url>]` — run a local admin
 * server (Spec §14.1 Phase 5 "local Admin"): the React admin form SPA at
 * `/admin`, the canonical admin API at `/api/admin/*` backed by the project's
 * `takuhon.json`, and the static HTML preview at `/`, all on a loopback port.
 *
 * It reuses `@takuhon/api`'s {@link createAdminApiApp} (validation, `If-Match`
 * optimistic locking, RFC 7807 errors) over a filesystem {@link FileStorage},
 * and serves the same admin bundle shipped in this package (the one
 * `create-takuhon` copies into scaffolded projects). Editing in the form writes
 * `takuhon.json`; reloading `/` re-renders it, closing the edit → preview loop.
 *
 * Image uploads work locally too: `POST /api/admin/assets` stores into an
 * `assets/` directory beside `takuhon.json` via {@link FileTakuhonAssetStorage},
 * and `GET /assets/*` serves them back (with `nosniff`), so the local pipeline
 * matches the Cloudflare adapter's R2 + delivery proxy.
 *
 * Authentication reuses the Bearer-token path: a fresh random token is minted
 * per run, the server binds `127.0.0.1`, and the token is printed for the
 * operator to paste into the SPA's sign-in form. Nothing is persisted.
 *
 * Like `takuhon dev`, the long-running server splits testable wiring
 * ({@link createAdminApp}, served via `app.fetch`) from the I/O lifecycle
 * ({@link runAdmin}).
 *
 * Exit codes:
 *   0 — served, then stopped cleanly (Ctrl-C), or `--help`
 *   2 — bad arguments, or the port was already in use
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

import { serve } from '@hono/node-server';
import {
  adminAssetSecurityHeaders,
  createAdminApiApp,
  noopAuditLogger,
  noopCachePurger,
} from '@takuhon/api';
import { Hono } from 'hono';

import { handleRequest, loadSiteState } from './dev-command.js';
import { FileTakuhonAssetStorage } from './file-asset-storage.js';
import { FileStorage } from './file-storage.js';
import { resolveAdminBundleDir } from './scaffold/index.js';

const DEFAULT_PATH = 'takuhon.json';
const DEFAULT_PORT = 4322;

const USAGE = `Usage: takuhon admin [path] [--port <n>] [--base-url <url>]

Run a local admin server: the form editor at /admin, the admin API at
/api/admin/*, and a preview at /. With no path, edits ./takuhon.json. A fresh
admin token is printed each run; paste it into the sign-in form. The server
binds 127.0.0.1 only. Stop with Ctrl-C.

Options:
  --port <n>       Port to listen on (default: ${DEFAULT_PORT}).
  --base-url <url> Site origin for the preview's canonical / hreflang links.

Exit codes: 0 = served then stopped, 2 = bad arguments / port in use.
`;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

/**
 * Headers for the admin bundle over loopback http. Mirrors the production
 * `adminAssetSecurityHeaders()` (strict `script-src 'self'` CSP, nosniff, frame
 * DENY, no-store) but drops `strict-transport-security` (meaningless over http)
 * and `upgrade-insecure-requests` (would try to upgrade localhost subresources
 * to https and fail).
 */
function localAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { ...adminAssetSecurityHeaders() };
  delete headers['strict-transport-security'];
  const csp = headers['content-security-policy'];
  if (csp !== undefined) {
    headers['content-security-policy'] = csp
      .split(';')
      .map((directive) => directive.trim())
      .filter((directive) => directive !== '' && directive !== 'upgrade-insecure-requests')
      .join('; ');
  }
  return headers;
}

const plain = (status: number, body: string): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

/** Escape a string for safe inclusion in a double-quoted HTML attribute. */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inject the per-run token into the served `index.html` as a `<meta>` tag so
 * the loopback SPA can auto-authenticate instead of asking the operator to
 * paste the token. This is done at response time on the local server only — the
 * shipped bundle files (and therefore the public Cloudflare deployment, which
 * serves them verbatim) never carry the tag, so the public sign-in gate is
 * unaffected. A `<meta>` is CSP-safe under the strict `script-src 'self'`
 * policy (it is not script), unlike an inline bootstrap `<script>`.
 */
function injectLocalToken(html: string, token: string): string {
  const meta = `<meta name="takuhon-local-token" content="${escapeHtmlAttr(token)}" />`;
  if (html.includes('</head>')) return html.replace('</head>', `${meta}</head>`);
  // No <head> (e.g. a minimal test fixture): the browser still hoists a leading
  // <meta> into the document head during parsing, so querySelector finds it.
  return meta + html;
}

/**
 * Serve a file from the admin bundle for an `/admin*` request. Mirrors the
 * Cloudflare adapter's `serveAdminSpa`: strip the `/admin` prefix, map `/admin`
 * and `/admin/` to `index.html`, fall back to `index.html` for extension-less
 * paths (SPA routes), and 404 for missing assets. Guards against path traversal.
 * The `index.html` response gets the per-run token injected (see
 * {@link injectLocalToken}); other assets are served byte-for-byte.
 */
function serveAdminBundle(
  bundleDir: string,
  method: string,
  pathname: string,
  token: string,
): Response {
  if (method !== 'GET' && method !== 'HEAD') return plain(405, 'Method Not Allowed\n');

  const rest = pathname.slice('/admin'.length);
  let rel: string;
  try {
    rel = decodeURIComponent(rest).replace(/^\/+/, '');
  } catch {
    rel = '';
  }
  if (rel === '') rel = 'index.html';

  const root = resolve(bundleDir);
  let full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return plain(403, 'Forbidden\n');

  let body: Buffer;
  try {
    body = readFileSync(full);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    // SPA semantics: extension-less paths fall back to index.html; a missing
    // asset (e.g. /admin/assets/x.js) is a genuine 404.
    if (extname(rel) !== '') return plain(404, 'Not Found\n');
    full = join(root, 'index.html');
    try {
      body = readFileSync(full);
    } catch {
      return plain(404, 'Not Found\n');
    }
  }

  const contentType = contentTypeFor(full);
  const headers = new Headers(localAdminHeaders());
  headers.set('content-type', contentType);

  // The SPA entry document carries the per-run token so the loopback UI can
  // skip the sign-in form; every other asset is served unchanged.
  if (contentType.startsWith('text/html')) {
    const injected = injectLocalToken(body.toString('utf8'), token);
    return new Response(method === 'HEAD' ? null : injected, { status: 200, headers });
  }

  return new Response(method === 'HEAD' ? null : body, { status: 200, headers });
}

/**
 * Serve an uploaded asset from the project's `assets/` directory for a
 * `GET`/`HEAD /assets/*` request — the local counterpart of the Cloudflare
 * adapter's R2 delivery proxy. Forces `X-Content-Type-Options: nosniff`
 * (`security.md` §4.7) and a long-lived immutable cache (keys are unique). The
 * traversal guard lives in {@link FileTakuhonAssetStorage.readForServing}.
 */
function serveLocalAsset(
  assetStorage: FileTakuhonAssetStorage,
  method: string,
  pathname: string,
): Response {
  if (method !== 'GET' && method !== 'HEAD') return plain(405, 'Method Not Allowed\n');
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(1)); // drop the leading '/', → 'assets/...'
  } catch {
    return plain(400, 'Bad Request\n');
  }
  const asset = assetStorage.readForServing(key);
  if (asset === null) return plain(404, 'Not Found\n');
  const headers = new Headers();
  headers.set('content-type', asset.contentType);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(method === 'HEAD' ? null : asset.bytes, { status: 200, headers });
}

export interface CreateAdminAppOptions {
  /** Path to the project's takuhon.json. */
  readonly path: string;
  /** Bearer token the SPA must present (minted per run by {@link runAdmin}). */
  readonly token: string;
  /** Optional preview origin for canonical / hreflang links. */
  readonly baseUrl?: string;
  /** Admin bundle directory; defaults to the bundle shipped in this package. */
  readonly bundleDir?: string;
  /**
   * Origin used to build absolute asset `publicUrl`s (the loopback origin,
   * passed by {@link runAdmin}). When omitted, `publicUrl` is the relative
   * `/assets/...` path, which the same-origin SPA / preview can still fetch.
   */
  readonly assetBaseUrl?: string;
}

/**
 * Build the local admin Hono app. Pure (no listening socket) so tests can
 * exercise it through `app.fetch(new Request(...))`.
 */
export function createAdminApp(opts: CreateAdminAppOptions): Hono {
  const bundleDir = opts.bundleDir ?? resolveAdminBundleDir();
  const storage = new FileStorage(opts.path);
  // Uploads land in `assets/` beside takuhon.json and are served below at
  // /assets/*, mirroring the Cloudflare adapter's R2 + GET /assets/* pairing.
  const assetStorage = new FileTakuhonAssetStorage(opts.path, { publicBaseUrl: opts.assetBaseUrl });
  const app = new Hono();

  app.route(
    '/api/admin',
    createAdminApiApp({
      storage,
      assetStorage,
      getAdminToken: () => opts.token,
      // Loopback, same-origin SPA: no Origin allowlist needed (empty = skip).
      getAdminOrigins: () => [],
      cachePurger: noopCachePurger,
      auditLogger: noopAuditLogger,
    }),
  );

  // Unmatched `/api/admin/*` paths stay inside the mounted admin app (its
  // bearer middleware still gates them — an unknown path is a 401, never a
  // fall-through to the public preview), so only non-admin paths reach here.
  app.all('*', (c) => {
    const { method, path } = c.req;
    if (path === '/admin' || path.startsWith('/admin/')) {
      return serveAdminBundle(bundleDir, method, path, opts.token);
    }
    if (path.startsWith('/assets/')) {
      return serveLocalAsset(assetStorage, method, path);
    }
    const state = loadSiteState(opts.path, opts.baseUrl);
    const res = handleRequest(method, path, state);
    return new Response(method === 'HEAD' ? null : res.body, {
      status: res.status,
      headers: { 'content-type': res.contentType },
    });
  });

  return app;
}

/** Injectable sinks + token so tests run without a TTY or randomness. */
export interface AdminDeps {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Override the per-run token (tests); defaults to 32 random bytes. */
  token?: string;
}

interface ParsedArgs {
  path: string;
  port: number;
  baseUrl?: string;
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
      portRaw = arg.slice('--port='.length);
      if (portRaw === '') return { error: 'takuhon: `--port` requires a value.' };
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
      if (baseUrl === '') return { error: 'takuhon: `--base-url` requires a value.' };
      continue;
    }
    if (arg.startsWith('-')) return { error: `takuhon: unknown option \`${arg}\` for \`admin\`.` };
    if (path !== undefined) return { error: 'takuhon: `admin` takes at most one path argument.' };
    path = arg;
  }

  let port = DEFAULT_PORT;
  if (portRaw !== undefined) {
    if (!/^\d+$/.test(portRaw)) {
      return {
        error: `takuhon: \`--port\` must be an integer between 1 and 65535 (got \`${portRaw}\`).`,
      };
    }
    const n = Number(portRaw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return {
        error: `takuhon: \`--port\` must be an integer between 1 and 65535 (got \`${portRaw}\`).`,
      };
    }
    port = n;
  }

  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
    return { error: 'takuhon: `--base-url` must be an absolute http(s) URL.' };
  }

  return { path: path ?? DEFAULT_PATH, port, baseUrl: baseUrl?.replace(/\/+$/, '') };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Run `takuhon admin`. Resolves with the process exit code: it stays pending
 * while the server runs and resolves on graceful shutdown (Ctrl-C). The source
 * file may be absent — the form's empty-state import flow handles that — so
 * there is no missing-file fast-fail.
 */
export async function runAdmin(
  args: readonly string[] = [],
  deps: AdminDeps = {},
): Promise<number> {
  const out = deps.stdout ?? ((text: string) => void process.stdout.write(text));
  const err = deps.stderr ?? ((text: string) => void process.stderr.write(text));

  if (args[0] === '--help' || args[0] === '-h') {
    out(USAGE);
    return 0;
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    err(`${parsed.error}\nRun \`takuhon admin --help\` for usage.\n`);
    return 2;
  }

  const token = deps.token ?? randomBytes(32).toString('base64url');
  const app = createAdminApp({
    path: parsed.path,
    token,
    baseUrl: parsed.baseUrl,
    assetBaseUrl: `http://127.0.0.1:${String(parsed.port)}`,
  });

  return await new Promise<number>((resolvePromise) => {
    let closing = false;

    // Signal handlers are registered only once listening succeeds (below), so a
    // bind failure (EADDRINUSE) leaves none attached — mirroring `runDev`.
    function shutdown(): void {
      if (closing) return;
      closing = true;
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      server.close(() => resolvePromise(0));
    }

    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: parsed.port }, () => {
      const origin = `http://127.0.0.1:${parsed.port}`;
      out(`takuhon admin: editing ${parsed.path} at ${origin}/ (Ctrl-C to stop)\n`);
      out(`  Admin UI:    ${origin}/admin\n`);
      out(`  Admin token: ${token}\n`);
      out(`  Paste the token into the sign-in form; it is valid for this run only.\n`);
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        err(`takuhon: port ${parsed.port} is already in use; pass --port <n> to choose another.\n`);
      } else {
        err(`takuhon: ${error.message}\n`);
      }
      resolvePromise(2);
    });
  });
}
