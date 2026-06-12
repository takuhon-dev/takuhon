/**
 * `@takuhon/mcp` — a transport-agnostic Model Context Protocol server that
 * exposes a takuhon profile to AI agents, read-only.
 *
 * This package is the runtime-aware glue between two SDK-free halves:
 *
 * - `@takuhon/core` owns *what* is exposed and *what each call returns* — the
 *   `MCP_TOOLS` / `MCP_RESOURCES` catalog and the pure `executeMcpTool` /
 *   `readMcpResource` projections (spec §2.3).
 * - the transports own the I/O: the CLI connects this server to a stdio
 *   transport, and the Cloudflare adapter connects it to a stateless HTTP
 *   transport.
 *
 * {@link createTakuhonMcpServer} builds an `McpServer` (from the official
 * `@modelcontextprotocol/sdk`) with the catalog registered and a caller-supplied
 * `loadProfile` thunk wired into every handler. It deliberately does *not*
 * attach a transport — the caller does that, so the same server runs over stdio
 * or HTTP. The SDK dependency is contained entirely within this file; core's
 * catalog stays SDK-free so the protocol layer could be swapped without touching
 * core.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import {
  executeMcpTool,
  MCP_PROFILE_SECTIONS,
  MCP_RESOURCES,
  MCP_TOOLS,
  McpRequestError,
  readMcpResource,
  type McpToolDefinition,
  type Takuhon,
} from '@takuhon/core';
import { z } from 'zod';

/** Default server name advertised to MCP clients. */
const DEFAULT_SERVER_NAME = 'takuhon';
/** Default server version advertised to MCP clients. */
const DEFAULT_SERVER_VERSION = '0.0.0';

/** Loads the profile document to project. Sync or async; the I/O is the caller's. */
export type ProfileLoader = () => Promise<Takuhon> | Takuhon;

/** Options for {@link createTakuhonMcpServer}. */
export interface TakuhonMcpServerOptions {
  /**
   * Load the profile to project. Called once per tool/resource request, so a
   * long-lived stdio server reflects the current file and a stateless HTTP
   * handler reads fresh storage on every request. The transport layer owns this
   * I/O; this package and core stay free of it.
   */
  loadProfile: ProfileLoader;
  /** Server name advertised to clients. Defaults to `"takuhon"`. */
  name?: string;
  /** Server version advertised to clients. Defaults to `"0.0.0"`. */
  version?: string;
}

/** The shared optional `lang` argument every locale-aware tool accepts. */
const LANG_ARG = z
  .string()
  .optional()
  .describe('BCP-47 locale tag (e.g. "ja", "en"); falls back to the profile default.');

/** The `section` argument of `get_section`, constrained to the core catalog. */
const SECTION_ARG = z.enum(MCP_PROFILE_SECTIONS).describe('Which profile section to return.');

/**
 * Build a read-only takuhon MCP server. Registers the core catalog
 * ({@link MCP_TOOLS} / {@link MCP_RESOURCES}) against the SDK and wires every
 * handler to `loadProfile`. The returned server has no transport attached — the
 * caller connects one (stdio for the CLI, stateless HTTP on Cloudflare).
 */
export function createTakuhonMcpServer(options: TakuhonMcpServerOptions): McpServer {
  const { loadProfile, name = DEFAULT_SERVER_NAME, version = DEFAULT_SERVER_VERSION } = options;

  const server = new McpServer(
    { name, version },
    {
      instructions:
        'Read-only access to a single takuhon profile. Use the tools to read ' +
        'the profile (optionally per locale) and the resources to fetch the ' +
        'whole document or its JSON Schema. Nothing here can modify the profile.',
    },
  );

  registerTools(server, loadProfile);
  registerResources(server, loadProfile);
  return server;
}

/** Register the four read-only tools. Titles/descriptions come from core's catalog. */
function registerTools(server: McpServer, loadProfile: ProfileLoader): void {
  server.registerTool(
    'get_profile',
    { ...meta('get_profile'), inputSchema: { lang: LANG_ARG } },
    (args) => runTool('get_profile', args, loadProfile),
  );
  server.registerTool(
    'get_section',
    { ...meta('get_section'), inputSchema: { section: SECTION_ARG, lang: LANG_ARG } },
    (args) => runTool('get_section', args, loadProfile),
  );
  server.registerTool(
    'get_jsonld',
    { ...meta('get_jsonld'), inputSchema: { lang: LANG_ARG } },
    (args) => runTool('get_jsonld', args, loadProfile),
  );
  server.registerTool('list_locales', { ...meta('list_locales'), inputSchema: {} }, () =>
    runTool('list_locales', {}, loadProfile),
  );
}

/** Register the two read-only resources, sourced from core's catalog. */
function registerResources(server: McpServer, loadProfile: ProfileLoader): void {
  for (const def of MCP_RESOURCES) {
    server.registerResource(
      def.name,
      def.uri,
      { title: def.title, description: def.description, mimeType: def.mimeType },
      () => runResource(def.uri, loadProfile),
    );
  }
}

/** Load the profile, run a core tool executor, and shape the MCP tool result. */
async function runTool(
  name: string,
  args: Readonly<Record<string, unknown>>,
  loadProfile: ProfileLoader,
): Promise<CallToolResult> {
  let profile: Takuhon;
  try {
    profile = await loadProfile();
  } catch (err) {
    return errorResult(`Could not load the profile: ${errorMessage(err)}`);
  }
  try {
    const { data } = executeMcpTool(name, args, profile);
    return { content: [{ type: 'text', text: stringify(data) }] };
  } catch (err) {
    // A bad argument is a tool-level error the model should see, not a
    // protocol fault. The SDK's Zod validation already rejects malformed input
    // before this runs, so this is a defensive backstop.
    if (err instanceof McpRequestError) return errorResult(err.message);
    throw err;
  }
}

/** Load the profile and shape the MCP resource read result. */
async function runResource(uri: string, loadProfile: ProfileLoader): Promise<ReadResourceResult> {
  const profile = await loadProfile();
  const { mimeType, data } = readMcpResource(uri, profile);
  return { contents: [{ uri, mimeType, text: stringify(data) }] };
}

/** A tool's title/description from the core catalog, by name. */
function meta(name: string): { title: string; description: string } {
  const def: McpToolDefinition | undefined = MCP_TOOLS.find((t) => t.name === name);
  if (def === undefined) throw new Error(`No MCP tool definition for "${name}".`);
  return { title: def.title, description: def.description };
}

/** A failed tool call: the message surfaces to the model as an error result. */
function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Pretty-print a structured value for an MCP text content block. */
function stringify(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
