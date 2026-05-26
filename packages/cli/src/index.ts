#!/usr/bin/env node

/**
 * `@takuhon/cli` entry point — the `takuhon` command.
 *
 * At present this exposes only `--version` / `--help` plus a pointer to
 * `create-takuhon` for scaffolding. The dev / validate / sync / export /
 * migrate / restore subcommands land in subsequent releases. The bare-name
 * `takuhon` npm package (`packages/takuhon/`) redirects here via a 4-line
 * shim, so `npm i -g takuhon && takuhon --help` and `npm i -g @takuhon/cli
 * && takuhon --help` give the same output.
 */

const VERSION = '0.2.0';

const HELP = `takuhon ${VERSION}

Takuhon — open-source portable profile API server.

Usage:
  takuhon --version            Show the installed CLI version
  takuhon --help               Show this help

Scaffolding a new profile project:
  npx create-takuhon my-profile
  npx create-takuhon my-profile --license CC-BY-4.0

Subcommands (dev / validate / sync / export / migrate / restore) are planned
for a future release. Track progress at:

  https://github.com/takuhon-dev/takuhon
`;

function main(argv: readonly string[]): number {
  const first = argv[0];

  if (first === '--version' || first === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === undefined || first === '--help' || first === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  process.stderr.write(
    `takuhon: unknown command '${first}'\n` +
      `Run \`takuhon --help\` for usage. For scaffolding a new project, use \`create-takuhon\`.\n`,
  );
  return 2;
}

process.exit(main(process.argv.slice(2)));
