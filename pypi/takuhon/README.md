# takuhon (Python)

This package reserves the `takuhon` namespace on PyPI for the future
Python SDK of [Takuhon](https://takuhon.org), an open-source portable
profile server.

A functional Python SDK has **not yet been released**. This is a
placeholder package. Do not depend on its API surface; importing
`takuhon` only exposes a `__version__` string at this stage.

## What is Takuhon?

Takuhon lets you own your profile as a portable JSON document and publish
it as a mobile-first profile page plus a public API (JSON-LD for AI
agents and search engines included). The core schema, validation,
HTTP handlers, and UI components are currently distributed as npm
packages under the [`@takuhon` scope](https://www.npmjs.com/org/takuhon):

- [`@takuhon/core`](https://www.npmjs.com/package/@takuhon/core) — schema, validation, JSON-LD
- [`@takuhon/api`](https://www.npmjs.com/package/@takuhon/api) — Hono-based HTTP handlers
- [`@takuhon/ui`](https://www.npmjs.com/package/@takuhon/ui) — React mobile-first profile UI
- [`@takuhon/cli`](https://www.npmjs.com/package/@takuhon/cli) — `create-takuhon` scaffolding
- [`takuhon`](https://www.npmjs.com/package/takuhon) — bare-name redirect to `@takuhon/cli`

## Status

| Component                        | Stage                      |
| -------------------------------- | -------------------------- |
| JSON schema and core types (npm) | Implemented, version 0.1.0 |
| Python SDK design                | Not started                |
| Python SDK release               | Not scheduled              |

When the Python SDK is implemented, this package's version will move
to `0.1.0` or higher and the API will be documented here.

## License

Apache-2.0. See `LICENSE` for the full text and `NOTICE` for required
attribution.

## Links

- Project homepage: <https://takuhon.org>
- Source repository: <https://github.com/takuhon-dev/takuhon>
- Issue tracker: <https://github.com/takuhon-dev/takuhon/issues>
