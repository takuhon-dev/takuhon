# takuhon

The bare-name redirect package for [Takuhon](https://github.com/takuhon-dev/takuhon).

This package is a 4 KB thin shim that runs [`@takuhon/cli`](https://www.npmjs.com/package/@takuhon/cli). Installing this package gives you the `takuhon` CLI globally:

```sh
npm i -g takuhon
# or
npx takuhon <subcommand>
```

…and you get exactly the same binary as `npm i -g @takuhon/cli` would give you. All real code lives in `@takuhon/cli`; this package's only job is to make the bare `takuhon` name resolvable.

## Why a separate package?

npm's name policy gives bare names (no `@scope/` prefix) priority over scoped ones for CLI discoverability and `npx <name>` ergonomics. By holding `takuhon` as a thin redirect to `@takuhon/cli`, the project keeps the canonical source in the `@takuhon/*` scope while letting users type the shorter form.

This is the "C+ pattern" documented in the Caronima OSS publish playbook.

## Versioning

This package ships in lockstep with `@takuhon/cli` (and the rest of the `@takuhon/*` family). Its `dependencies` pin `@takuhon/cli` at the same version, so `npm i -g takuhon@<v>` always resolves the matching CLI.

## License

[Apache-2.0](./LICENSE). See also [NOTICE](./NOTICE).
