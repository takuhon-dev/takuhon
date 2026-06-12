# @takuhon/mcp

A transport-agnostic [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes a [takuhon](https://github.com/takuhon-dev/takuhon) profile
to AI agents — **read-only**.

It registers the tool/resource catalog defined by `@takuhon/core` against the
official `@modelcontextprotocol/sdk` and wires every handler to a profile loader
you supply. It does **not** attach a transport: the caller connects one, so the
same server runs over stdio (the `takuhon mcp` CLI command) or stateless HTTP
(the Cloudflare adapter).

Everything is read-only and passes through the same privacy filter as the public
API, so an MCP client sees exactly what `GET /api/profile`, `GET /api/jsonld`,
`GET /api/schema`, and `GET /takuhon.json` already expose — no admin surface.

## Tools and resources

| Tool           | Arguments          | Returns                                       |
| -------------- | ------------------ | --------------------------------------------- |
| `get_profile`  | `lang?`            | the locale-resolved, privacy-filtered profile |
| `get_section`  | `section`, `lang?` | a single profile section                      |
| `get_jsonld`   | `lang?`            | Schema.org JSON-LD (`ProfilePage` + `Person`) |
| `list_locales` | —                  | the available locales and the default         |

| Resource            | Contents                                     |
| ------------------- | -------------------------------------------- |
| `takuhon://profile` | the canonical takuhon.json, privacy-filtered |
| `takuhon://schema`  | the public JSON Schema contract              |

## Usage

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTakuhonMcpServer } from '@takuhon/mcp';

const server = createTakuhonMcpServer({
  // Called once per request, so the server always reflects current storage.
  loadProfile: async () => loadValidatedProfile(),
  name: 'takuhon',
  version: '1.0.0',
});

await server.connect(new StdioServerTransport());
```

`loadProfile` returns a validated `Takuhon` (from `@takuhon/core`). This package
performs no I/O of its own; the transport layer owns it.
