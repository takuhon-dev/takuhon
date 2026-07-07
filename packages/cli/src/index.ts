#!/usr/bin/env node

/**
 * `@takuhon/cli` entry point — the `takuhon` command.
 *
 * Exposes `--version` / `--help`, the local profile commands (`validate`,
 * `migrate`, `restore`, `export`, `import`, `build`, `dev`, `admin`), `sync`
 * (push a local profile to a deployment), `activity` (sync / show the
 * developer-activity snapshot), and a pointer to `create-takuhon` for
 * scaffolding.
 *
 * `main` is pure (returns an exit code, never calls `process.exit`); the only
 * place that exits the process is {@link run}, invoked either when this module
 * is the entry script or by the bare-name `takuhon` package's `bin.mjs`, which
 * imports and calls `run()`. Keeping `process.exit` at that single boundary
 * lets tests import this module without terminating the test runner.
 */

import { realpathSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { runActivityShow, runActivitySync } from './activity-command.js';
import { readCliVersion } from './admin-bundle-manifest.js';
import { runAdmin } from './admin-command.js';
import { runBuild } from './build-command.js';
import { runDev } from './dev-command.js';
import { runExport } from './export-command.js';
import { runImport } from './import-command.js';
import { runMcp } from './mcp-command.js';
import { runMigrate } from './migrate-command.js';
import { runRefreshAdmin } from './refresh-admin-command.js';
import { runRestore } from './restore-command.js';
import { runSync } from './sync-command.js';
import { runValidate } from './validate-command.js';
import { runVerifyAdmin } from './verify-admin-command.js';

// Source the reported version from package.json at runtime (via the shared
// resolver) so `takuhon --version` can never drift from the published release —
// there is no hand-maintained version literal to fall out of sync.
const VERSION = readCliVersion();

const HELP = `takuhon ${VERSION}

Takuhon — open-source portable profile API server.

Usage:
  takuhon --version            Show the installed CLI version
  takuhon --help               Show this help

Commands:
  takuhon validate [path]              Validate a takuhon.json (default: ./takuhon.json)
  takuhon migrate [path] [--to <v>]    Forward-migrate a takuhon.json to a newer schema
                                       version (default target: latest). Backs up first.
                                       Add --out <file> to write elsewhere, --dry-run to preview.
  takuhon restore --from <backup>      Restore a profile from a backup (prompts before
                                       overwriting; pass --yes to skip).
  takuhon export [path] [--output <f>] Serialise a takuhon.json to stdout (or --output file).
  takuhon import <file> [path]         Import an exported profile into a takuhon.json,
                                       migrating to the current schema version. Backs up first.
  takuhon build [path] [--output <d>]  Render a takuhon.json into a static site (HTML +
                                       JSON-LD, one page per locale). --base-url <url> adds
                                       absolute canonical/hreflang links.
  takuhon dev [path] [--port <n>]      Serve a takuhon.json as a local static preview,
                                       re-rendered on each request (default port: 4321).
                                       --base-url <url> adds canonical/hreflang links.
  takuhon admin [path] [--port <n>]    Run a local admin server: edit the profile through
                                       the form UI at /admin (writes takuhon.json, backs up
                                       first) with a preview at / (default port: 4322). Binds
                                       127.0.0.1; prints a per-run token to paste into the form.
  takuhon admin update [path]          Refresh a project's admin bundle with the admin form UI
    [--dir <name>]                     bundled in this @takuhon/cli (use after upgrading the
                                       CLI). Updates an existing admin-dist/ (or --dir) only,
                                       and stamps a provenance manifest.
  takuhon admin verify [path]          Check the committed admin bundle matches this
    [--dir <name>]                     @takuhon/cli (provenance). Exits 1 on drift; good for CI.
  takuhon mcp [path]                   Serve a takuhon.json over the Model Context Protocol on
                                       stdio (read-only), so an MCP client such as Claude Desktop
                                       can read the profile. Re-reads the file per request.
  takuhon sync [path] --url <url>      Push a takuhon.json to a deployment's admin API
                                       (PUT <url>/api/admin/profile). Reads the admin token
                                       from TAKUHON_ADMIN_TOKEN. --if-match <etag> opts into
                                       optimistic locking; --dry-run previews without sending.
  takuhon activity sync [path]         Fetch the GitHub / WakaTime activity configured in
                                       settings.activity and store it as activity.json beside
                                       the profile. Secrets come from the environment only:
                                       TAKUHON_GITHUB_TOKEN (optional) / TAKUHON_WAKATIME_KEY.
  takuhon activity show [path]         Print the stored activity snapshot (activity.json).

Scaffolding a new profile project:
  npx create-takuhon my-profile
  npx create-takuhon my-profile --license CC-BY-4.0
`;

async function main(argv: readonly string[]): Promise<number> {
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

  if (first === 'migrate') {
    return emit(runMigrate(argv.slice(1)));
  }

  if (first === 'export') {
    return emit(runExport(argv.slice(1)));
  }

  if (first === 'build') {
    return emit(runBuild(argv.slice(1)));
  }

  if (first === 'dev') {
    // `dev` runs a long-lived server and streams its own output, so it does not
    // go through `emit` (a one-shot result writer); it returns the exit code
    // directly and resolves only on graceful shutdown.
    return runDev(argv.slice(1));
  }

  if (first === 'admin') {
    if (argv[1] === 'update') {
      // One-shot bundle refresh, not the long-lived server: goes through `emit`.
      return emit(await runRefreshAdmin(argv.slice(2)));
    }
    if (argv[1] === 'verify') {
      // One-shot provenance check, not the long-lived server: goes through `emit`.
      return emit(await runVerifyAdmin(argv.slice(2)));
    }
    // Long-lived server, like `dev`: returns the exit code directly.
    return runAdmin(argv.slice(1));
  }

  if (first === 'mcp') {
    // Long-lived stdio server, like `dev`: returns the exit code directly and
    // resolves on client disconnect / Ctrl-C. stdout is the MCP channel, so it
    // does not go through `emit`.
    return runMcp(argv.slice(1));
  }

  if (first === 'import') {
    return emit(runImport(argv.slice(1)));
  }

  if (first === 'restore') {
    // Only offer an interactive prompt on a real TTY; otherwise `runRestore`
    // refuses to overwrite without `--yes`, which is the safe default for
    // pipelines.
    const confirm = stdin.isTTY ? promptConfirm : undefined;
    return emit(await runRestore(argv.slice(1), { confirm }));
  }

  if (first === 'sync') {
    return emit(await runSync(argv.slice(1)));
  }

  if (first === 'activity') {
    const sub = argv[1];
    if (sub === 'sync') {
      return emit(await runActivitySync(argv.slice(2)));
    }
    if (sub === 'show') {
      return emit(await runActivityShow(argv.slice(2)));
    }
    const usage =
      'Subcommands:\n' +
      '  takuhon activity sync [path]   Fetch and store the activity snapshot\n' +
      '  takuhon activity show [path]   Print the stored activity snapshot\n' +
      'Run `takuhon activity sync --help` for details.\n';
    if (sub === '--help' || sub === '-h') {
      process.stdout.write(usage);
      return 0;
    }
    process.stderr.write(
      sub === undefined
        ? `takuhon: \`activity\` requires a subcommand.\n${usage}`
        : `takuhon: unknown subcommand \`${sub}\` for \`activity\`.\n${usage}`,
    );
    return 2;
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

/** Interactive [y/N] confirmation used by `restore` on a TTY. */
async function promptConfirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${message} `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Process entry point: run {@link main} and exit with its code. This is the
 * only function that calls `process.exit`. Exported so the bare-name
 * `takuhon` package can invoke it after importing this module.
 */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    process.exit(await main(argv));
  } catch (error) {
    process.stderr.write(`takuhon: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
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
  void run();
}
