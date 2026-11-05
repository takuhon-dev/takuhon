/**
 * Read-only MCP endpoint (`POST /mcp`) for the Cloudflare adapter.
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
 * Only `POST` is served. A `GET` would open the SDK's standalone SSE stream,
 * which this endpoint never sends anything on but which the SDK keeps open with
 * periodic keep-alive frames for as long as the client stays connected; a
 * `DELETE` would end a session, and there are none. Every method but `POST` is
 * answered `405` with `Allow: POST`. For `GET` this is the answer the MCP
 * transport spec requires of a server that offers no SSE stream, and for
 * `DELETE` it is the one the spec allows a server that does not let clients
 * end sessions; no other method is part of the transport.
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
 * The answer to any method other than `POST`, shaped like the SDK's own `405`
 * (a JSON-RPC error body) but advertising only the method this endpoint serves.
 */
function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    }),
    {
      status: 405,
      headers: {
        allow: 'POST',
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    },
  );
}

/**
 * Handle one MCP request against the KV-backed profile. Builds a fresh,
 * stateless server + transport per request and returns its `Response` with
 * `nosniff` and a no-store cache policy layered on. Anything but `POST` is
 * answered `405` before a server or transport is built.
 */
export async function serveMcp(
  request: Request,
  kv: KVNamespace,
  fallback: () => Takuhon,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed();

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
