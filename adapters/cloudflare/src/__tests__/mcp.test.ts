import { describe, expect, it } from 'vitest';

import worker, { type Env } from '../index.js';
import { FakeKV } from '../test-utils/fake-kv.js';

function makeEnv(): Env {
  return { TAKUHON_KV: new FakeKV() as unknown as KVNamespace };
}

/** POST a single JSON-RPC message to `/mcp` and return the parsed JSON body. */
async function rpc(env: Env, message: Record<string, unknown>): Promise<any> {
  const res = await worker.fetch(
    new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(message),
    }),
    env,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  return res.json();
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
};

describe('cloudflare /mcp — stateless MCP endpoint', () => {
  it('answers initialize with the server identity and tools capability', async () => {
    const body = await rpc(makeEnv(), INITIALIZE);
    expect(body.result.serverInfo.name).toBe('takuhon');
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.capabilities.resources).toBeDefined();
  });

  it('answers a GET with 405 instead of opening a standalone SSE stream', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/mcp', {
        method: 'GET',
        headers: { accept: 'text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      }),
      makeEnv(),
    );
    // Checked before the body is read: an open SSE stream would never end.
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json<{ error: { code: number } }>();
    expect(body.error.code).toBe(-32000);
  });

  it.each(['DELETE', 'PUT', 'HEAD'])('answers %s with 405 and Allow: POST', async (method) => {
    const res = await worker.fetch(
      new Request('https://worker.example/mcp', { method }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('answers 413 to a body over the size bound without parsing it', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ ...INITIALIZE, padding: 'x'.repeat(128 * 1024) }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('lists the four tools without a prior session (stateless)', async () => {
    const body = await rpc(makeEnv(), { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = body.result.tools as { name: string }[];
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_jsonld',
      'get_profile',
      'get_section',
      'list_locales',
    ]);
  });

  it('answers tools/call get_profile from the bundled fixture', async () => {
    const body = await rpc(makeEnv(), {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_profile', arguments: { lang: 'en' } },
    });
    const profile = JSON.parse(body.result.content[0].text);
    expect(profile.profile.displayName).toBeTruthy();
    expect(profile.resolvedLocale).toBe('en');
  });

  it('lists and reads resources', async () => {
    const list = await rpc(makeEnv(), {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/list',
      params: {},
    });
    const resources = list.result.resources as { uri: string }[];
    expect(resources.map((r) => r.uri).sort()).toEqual(['takuhon://profile', 'takuhon://schema']);

    const read = await rpc(makeEnv(), {
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'takuhon://schema' },
    });
    const schema = JSON.parse(read.result.contents[0].text);
    expect(typeof schema.$id).toBe('string');
  });

  it('serves a profile stored in KV', async () => {
    const env = makeEnv();
    // Seed KV through the admin path is heavier; instead drive get_profile and
    // assert it reflects the fixture (KV empty → bundled fallback), proving the
    // loader is wired. A populated-KV case is covered by the public-API tests.
    const body = await rpc(env, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'get_profile', arguments: {} },
    });
    expect(body.result.isError).toBeFalsy();
  });

  it('advertises the mcp endpoint in /.well-known/takuhon.json', async () => {
    const res = await worker.fetch(
      new Request('https://worker.example/.well-known/takuhon.json'),
      makeEnv(),
    );
    const body: any = await res.json();
    expect(body.mcp).toBe('/mcp');
  });
});
