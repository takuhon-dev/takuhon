#!/usr/bin/env node

/**
 * Entry point for `npx create-takuhon` (and `pnpm create takuhon`).
 *
 * Usage:
 *   create-takuhon <target-dir> [--license <spdxId>]
 *
 * The positional target directory is required; it must not already exist (we
 * refuse to overwrite). `--license` skips the interactive picker for CI /
 * automation, per planning doc license.md §2.3.
 */

import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { cancel, intro, outro } from '@clack/prompts';

import { buildContentLicense, isValidSpdxInput } from './licenses.js';
import { promptLicense } from './prompts.js';
import { TargetDirectoryExistsError, writeProject } from './scaffold/index.js';
import { isValidWorkerName } from './scaffold/wrangler-toml.js';

interface CliArgs {
  readonly targetArg: string | undefined;
  readonly license: string | undefined;
  readonly help: boolean;
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      license: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  return {
    targetArg: positionals[0],
    license: values.license,
    help: values.help === true,
  };
}

function printHelp(): void {
  process.stdout.write(
    `Usage: create-takuhon <target-dir> [--license <spdxId>]\n` +
      `\n` +
      `Scaffolds a Takuhon profile deployment in <target-dir>.\n` +
      `\n` +
      `Options:\n` +
      `  --license <spdxId>   Skip the interactive license prompt and use the\n` +
      `                       given SPDX identifier (e.g. CC-BY-4.0, MIT,\n` +
      `                       Proprietary). Useful for CI / automation.\n` +
      `  -h, --help           Show this help.\n`,
  );
}

async function main(argv: readonly string[]): Promise<number> {
  let parsed: CliArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n`);
    printHelp();
    return 2;
  }

  if (parsed.help) {
    printHelp();
    return 0;
  }

  if (parsed.targetArg === undefined) {
    process.stderr.write(`Error: missing target directory argument.\n\n`);
    printHelp();
    return 2;
  }

  const targetDir = resolve(process.cwd(), parsed.targetArg);
  const projectName = basename(targetDir);

  if (!isValidWorkerName(projectName)) {
    process.stderr.write(
      `Error: target directory basename "${projectName}" is not a valid Cloudflare Worker name.\n` +
        `Names must be lowercase, start with a letter or digit, and contain only ` +
        `letters, digits, and hyphens (max 63 chars).\n`,
    );
    return 2;
  }

  intro('create-takuhon');

  let spdxId: string;
  if (parsed.license !== undefined) {
    const raw = parsed.license.trim();
    if (!isValidSpdxInput(raw)) {
      cancel(`Invalid --license value: "${parsed.license}"`);
      return 2;
    }
    spdxId = raw;
  } else {
    const result = await promptLicense();
    if ('cancelled' in result) {
      return 130;
    }
    spdxId = result.spdxId;
  }

  const license = buildContentLicense(spdxId);

  try {
    await writeProject({ targetDir, projectName, license });
  } catch (err) {
    if (err instanceof TargetDirectoryExistsError) {
      cancel(`Target directory already exists: ${err.targetDir}`);
      return 1;
    }
    throw err;
  }

  outro(
    `Created ${projectName} (license: ${spdxId}).\n` +
      `\n` +
      `Next steps:\n` +
      `  cd ${parsed.targetArg}\n` +
      `  # 1. Edit takuhon.json with your profile data\n` +
      `  # 2. Provision Cloudflare KV: wrangler kv namespace create TAKUHON_KV\n` +
      `  # 3. Set admin token: openssl rand -base64 32 | wrangler secret put TAKUHON_ADMIN_TOKEN\n` +
      `  pnpm install\n` +
      `  pnpm dev`,
  );

  return 0;
}

void main(process.argv.slice(2))
  .then((code) => {
    process.exit(code);
  })
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  });
