/**
 * `takuhon mcp [path]` — serve a local takuhon.json over the Model Context
 * Protocol on stdio, so an MCP client (Claude Desktop, …) can read the profile.
 *
 * It connects the transport-agnostic server from `@takuhon/mcp` to a
 * `StdioServerTransport`. The profile is exposed read-only — the same surface as
 * the public HTTP API (`get_profile` / `get_section` / `get_jsonld` /
 * `list_locales` tools; `takuhon://profile` / `takuhon://schema` resources),
 * with the public privacy filter applied. The file is re-read and re-validated
 * on every request, so edits are reflected without restarting.
 *
 * stdio note: stdin/stdout carry the MCP JSON-RPC stream, so this command writes
 * NOTHING to stdout — all diagnostics go to stderr.
 *
 * Like `dev` / `admin`, this is a long-lived process: {@link runMcp} resolves
 * with the exit code only when the client disconnects (stdin EOF) or on a
 * signal.
 *
 * Exit codes:
 *   0 — served, then the client disconnected / Ctrl-C; or `--help`
 *   2 — could not start: bad arguments, or the file is missing / unreadable /
 *       not a valid takuhon profile
 */

import { readFileSync } from 'node:fs';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { validate, type Takuhon } from '@takuhon/core';
import { createTakuhonMcpServer } from '@takuhon/mcp';

const DEFAULT_PATH = 'takuhon.json';
const SERVER_NAME = 'takuhon';

const USAGE = `Usage: takuhon mcp [path]

Serve a takuhon.json over the Model Context Protocol on stdio, so an MCP client
(e.g. Claude Desktop) can read the profile read-only. With no path, serves
./takuhon.json. The file is re-read on every request, so edits are reflected
without restarting.

Exposes (read-only, the same surface as the public API, privacy filter applied):
  tools:     get_profile, get_section, get_jsonld, list_locales
  resources: takuhon://profile, takuhon://schema

stdin/stdout carry the protocol stream; diagnostics go to stderr. The server
runs until the client disconnects or you press Ctrl-C.

Example Claude Desktop config (claude_desktop_config.json):
  {
    "mcpServers": {
      "my-profile": { "command": "takuhon", "args": ["mcp", "/path/to/takuhon.json"] }
    }
  }

Exit codes: 0 = served then stopped, 2 = bad arguments / file missing /
unreadable / invalid.
`;

/** Injectable seams so tests can capture output and supply a transport. */
export interface McpDeps {
  /**
   * Sink for `--help` only. The MCP session never writes to stdout (that is the
   * protocol channel); this exists solely so the help path is testable.
   */
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Transport factory; defaults to stdio. Tests inject an in-memory transport. */
  createTransport?: () => Transport;
}

/** The CLI version, advertised to MCP clients as the server version. */
const VERSION = readCliVersion();

interface ParsedArgs {
  path: string;
}

/**
 * Read, parse, and validate a takuhon.json. Throws an `Error` with a
 * human-readable message (validation errors carry their JSON Pointers) on any
 * failure — the caller turns it into a startup error or a tool error result.
 */
export function loadMcpProfile(path: string): Takuhon {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read '${path}'.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`'${path}' is not valid JSON: ${detail}`, { cause: error });
  }

  const result = validate(data);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    throw new Error(`'${path}' is not a valid takuhon profile:\n${lines.join('\n')}`);
  }
  return result.data;
}

/**
 * Run `takuhon mcp`. Resolves with the process exit code: it stays pending while
 * the server runs and resolves on client disconnect (stdin EOF) or a signal.
 * Argument and load errors return before any transport is connected.
 */
export async function runMcp(args: readonly string[] = [], deps: McpDeps = {}): Promise<number> {
  const err = deps.stderr ?? ((text: string) => void process.stderr.write(text));

  if (args[0] === '--help' || args[0] === '-h') {
    // --help is the one thing that goes to stdout: it is an ordinary CLI help
    // request, not an active MCP session, so stdout is safe here.
    const out = deps.stdout ?? ((text: string) => void process.stdout.write(text));
    out(USAGE);
    return 0;
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    err(`${parsed.error}\nRun \`takuhon mcp --help\` for usage.\n`);
    return 2;
  }

  // Fast-fail with a clear message if the profile cannot be loaded now: an MCP
  // client launching a broken server would otherwise see only opaque tool
  // errors. A file that later becomes invalid is handled per-request below.
  try {
    loadMcpProfile(parsed.path);
  } catch (error) {
    err(`takuhon: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const server = createTakuhonMcpServer({
    // Re-read per request so edits are reflected; if the file later becomes
    // invalid, the load failure surfaces to the client as a tool error result.
    loadProfile: () => loadMcpProfile(parsed.path),
    name: SERVER_NAME,
    version: VERSION,
  });

  const transport = (deps.createTransport ?? (() => new StdioServerTransport()))();
  await server.connect(transport);
  err(`takuhon mcp: serving ${parsed.path} (read-only) on stdio\n`);

  return await new Promise<number>((resolve) => {
    let done = false;
    function finish(): void {
      if (done) return;
      done = true;
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
      resolve(0);
    }
    function shutdown(): void {
      void server.close();
      finish();
    }
    // The client disconnecting closes the transport (stdin EOF), which the SDK
    // surfaces as the server's `onclose`; that ends the run.
    server.server.onclose = finish;
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`mcp\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `mcp` takes at most one path argument.' };
    }
    path = arg;
  }
  return { path: path ?? DEFAULT_PATH };
}

/** Read this CLI's version from its package.json (same source as `--version`). */
function readCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
