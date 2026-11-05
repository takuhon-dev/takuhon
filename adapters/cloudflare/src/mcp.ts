/**
 * Read-only MCP endpoint (`GET`/`POST /mcp`) for the Cloudflare adapter.
 *
 * The deployed profile is exposed over the Model Context Protocol so any MCP
 * client can read it — the remote counterpart of the CLI's `takuhon mcp`. It
 * reuses the transport-agnostic server from `@takuhon/mcp` (the same core
 * catalog the CLI serves) and connects it to the SDK's **Web Standard**
 * Streamable HTTP transport, which speaks `fetch` `Request`/`Response` and runs
 * on Workers.
 *
 * Stateless by design — no Durable Object, no new binding, no session: each
 * request builds a fresh server + transport (the SDK requires a fresh transport
 * per request in stateless mode, and skips session validation), reads the
 * profile from the existing KV, and answers. `enableJsonResponse` returns a
 * single JSON body instead of an SSE stream, which suits read-only
 * request/response with no server-initiated messages.
 *
 * Unauthenticated public read, at parity with `GET /api/profile`: every answer
 * is privacy-filtered by core and no admin/write surface is exposed.
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { NotFoundError, type Takuhon } from '@takuhon/core';
import { createTakuhonMcpServer } from '@takuhon/mcp';

import { KvTakuhonStorage } from './kv-storage.js';

const MCP_SERVER_NAME = 'takuhon';

/**
 * Upper bound, in bytes, on a `POST /mcp` body. The endpoint is public and
 * unauthenticated, and every request it serves is a small read-only JSON-RPC
 * message, so the SDK's 4 MiB default is far more than it needs. A tighter
 * bound keeps one request from spending a Worker's memory or CPU on parsing;
 * anything larger is answered `413` before it is parsed.
 */
const MAX_MCP_REQUEST_BODY_BYTES = 64 * 1024;

/**
 * Handle one MCP request against the KV-backed profile. Builds a fresh,
 * stateless server + transport per request and returns its `Response` with
 * `nosniff` and a no-store cache policy layered on.
 */
export async function serveMcp(
  request: Request,
  kv: KVNamespace,
  fallback: () => Takuhon,
): Promise<Response> {
  const storage = new KvTakuhonStorage(kv);
  const loadProfile = async (): Promise<Takuhon> => {
    try {
      return (await storage.getProfile()).data;
    } catch (e) {
      // Before the first admin write KV is empty; serve the bundled fixture,
      // exactly as the public API's loadProfile does.
      if (e instanceof NotFoundError) return fallback();
      throw e;
    }
  };

  const server = createTakuhonMcpServer({ loadProfile, name: MCP_SERVER_NAME });
  // Stateless: `sessionIdGenerator: undefined` disables sessions, and the SDK
  // requires a fresh transport per request in this mode (it rejects reuse to
  // avoid cross-client message-id collisions). `enableJsonResponse` returns a
  // buffered JSON body rather than an SSE stream.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_MCP_REQUEST_BODY_BYTES,
  });
  await server.connect(transport);

  // The server / transport are per-request locals with no cross-request state,
  // so the Worker can let them be collected when the request ends.
  const response = await transport.handleRequest(request);

  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
