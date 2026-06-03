#!/usr/bin/env node

/**
 * `@takuhon/cli` entry point — the `takuhon` command.
 *
 * At present this exposes `--version` / `--help`, the `validate` command, and
 * a pointer to `create-takuhon` for scaffolding. The dev / sync / export /
 * migrate / restore subcommands land in subsequent releases.
 *
 * `main` is pure (returns an exit code, never calls `process.exit`); the only
 * place that exits the process is {@link run}, invoked either when this module
 * is the entry script or by the bare-name `takuhon` package's `bin.mjs`, which
 * imports and calls `run()`. Keeping `process.exit` at that single boundary
 * lets tests import this module without terminating the test runner.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    return emit(runValidate(argv.slice(1)));
  }

  process.stderr.write(
    `takuhon: unknown command '${first}'\n` +
      `Run \`takuhon --help\` for usage. For scaffolding a new project, use \`create-takuhon\`.\n`,
  );
  return 2;
}

/** Write a command outcome's streams and return its exit code. */
function emit(outcome: { code: number; stdout: string; stderr: string }): number {
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  return outcome.code;
}

/**
 * Process entry point: run {@link main} and exit with its code. This is the
 * only function that calls `process.exit`. Exported so the bare-name
 * `takuhon` package can invoke it after importing this module.
 */
export function run(argv: readonly string[] = process.argv.slice(2)): void {
  process.exit(main(argv));
}

/** True when this module was started directly (`node …/index.js`). */
function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  run();
}
