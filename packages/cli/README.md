# @takuhon/cli

The Takuhon command-line interface: `create-takuhon` project scaffolding and the `takuhon` command for working with a local `takuhon.json` — validate, migrate, restore, export, import, build, and a local preview server.

## Installation

Run without installing, via `npx`:

```sh
npx create-takuhon my-profile      # scaffold a new project
npx takuhon validate               # run a command in an existing project
```

Or install the `takuhon` command globally / as a dev dependency:

```sh
npm install -g takuhon
# or, inside a project:
pnpm add -D @takuhon/cli
```

The bare-name `takuhon` package is a thin redirect to `@takuhon/cli`, so `npx takuhon …` and a global install expose the same `takuhon` command. ESM-only; targets Node.js 22+.

## Scaffolding a new project

```sh
npx create-takuhon my-profile
npx create-takuhon my-profile --license CC-BY-4.0   # non-interactive license
```

`create-takuhon` writes a Cloudflare Worker deployment — a `wrangler.toml`, a starter `takuhon.json`, a `tsconfig.json`, and a Worker entry that composes Takuhon via `@takuhon/cloudflare`. Run `create-takuhon --help` for options.

## Commands

Each command operates on a local `takuhon.json` (default `./takuhon.json`) and reuses `@takuhon/core`. Pure-data commands return an exit code (`0` success, `1` invalid profile, `2` operational error).

| Command                                | Description                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `takuhon validate [path]`              | Validate a `takuhon.json` against the schema, reporting each failure as a JSON Pointer.                                                                    |
| `takuhon migrate [path] [--to <v>]`    | Forward-migrate to a newer schema version (default: latest). Backs up first; supports `--out`, `--dry-run`.                                                |
| `takuhon restore --from <backup>`      | Restore a profile from a backup (prompts before overwriting; pass `--yes` to skip).                                                                        |
| `takuhon export [path] [--output <f>]` | Serialise a `takuhon.json` to stdout (or to `--output`).                                                                                                   |
| `takuhon import <file> [path]`         | Import an exported profile, migrating it to the current schema version. Backs up first.                                                                    |
| `takuhon build [path] [--output <d>]`  | Render the profile into a static site — one HTML page per locale with build-time JSON-LD. `--base-url` adds absolute canonical/hreflang links.             |
| `takuhon dev [path] [--port <n>]`      | Serve the profile as a local static preview, re-rendered on each request (default port `4321`, loopback only). `--base-url` adds canonical/hreflang links. |

Run `takuhon --help`, or `takuhon <command> --help` for a command's full usage. The `sync` subcommand (mirror a local `takuhon.json` to a remote instance) is planned for a future release.

## License

Apache-2.0. See `LICENSE` and `NOTICE` at the repository root.
