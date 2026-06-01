#!/usr/bin/env node

/**
 * `@takuhon/cli` entry point — the `takuhon` command.
 *
 * At present this exposes `--version` / `--help`, the `validate` command, and
 * a pointer to `create-takuhon` for scaffolding. The dev / sync / export /
 * migrate / restore subcommands land in subsequent releases. The bare-name
 * `takuhon` npm package (`packages/takuhon/`) redirects here via a 4-line
 * shim, so `npm i -g takuhon && takuhon --help` and `npm i -g @takuhon/cli
 * && takuhon --help` give the same output.
 */

import { readFileSync } from 'node:fs';

import { runValidate } from './validate-command.js';

// Source the reported version from package.json (read at runtime relative to
// this module) so `takuhon --version` can never drift from the published
// release — there is no hand-maintained version literal to fall out of sync.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const VERSION = pkg.version;

const HELP = `takuhon ${VERSION}

Takuhon — open-source portable profile API server.

Usage:
  takuhon --version            Show the installed CLI version
  takuhon --help               Show this help

Commands:
  takuhon validate [path]      Validate a takuhon.json (default: ./takuhon.json)

Scaffolding a new profile project:
  npx create-takuhon my-profile
  npx create-takuhon my-profile --license CC-BY-4.0

Subcommands (dev / sync / export / migrate / restore) are planned
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

  if (first === 'validate') {
    const { code, stdout, stderr } = runValidate(argv.slice(1));
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return code;
  }

  process.stderr.write(
    `takuhon: unknown command '${first}'\n` +
      `Run \`takuhon --help\` for usage. For scaffolding a new project, use \`create-takuhon\`.\n`,
  );
  return 2;
}

process.exit(main(process.argv.slice(2)));
