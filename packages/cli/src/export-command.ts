/**
 * `takuhon export [path] [--output <file>]` — serialise a `takuhon.json` into
 * its transport form for transfer or archival.
 *
 * Mirrors the other command runners: {@link runExport} is a pure function that
 * reads the source itself but returns its output as strings plus an exit code.
 * It validates the source first (an export should be a valid transport
 * artifact), then delegates to core's `exportTakuhon`, which deep-clones and
 * refreshes `meta.updatedAt` (the round-trip exception in
 * operational-lifecycle §5.1). The source file is only read, never modified.
 *
 * Output defaults to stdout so the command composes in a pipeline; `--output`
 * writes a file atomically instead. Asset embedding (`--embed-assets`) is a
 * remote-storage concern and is deferred — it is rejected with a clear message
 * rather than silently ignored.
 *
 * Exit codes:
 *   0 — exported (to stdout or `--output`)
 *   1 — the source was read but is not a valid takuhon profile
 *   2 — the command could not run: bad arguments, a missing/unreadable file,
 *       a file that is not valid JSON, or a failed `--output` write
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { exportTakuhon, validate } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';

import { writeFileAtomic } from './backup.js';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

const USAGE = `Usage: takuhon export [path] [--output <file>]

Serialise a takuhon.json into its transport form and print it to stdout, or
write it to a file with --output. With no path, exports ./takuhon.json in the
current working directory.

Options:
  --output <file>  Write the export to <file> instead of stdout (atomic).

Exit codes: 0 = exported, 1 = source is not a valid profile,
2 = bad arguments / file missing / unreadable / not JSON / write failed.
`;

export interface ExportOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

interface ParsedArgs {
  path: string;
  output?: string;
}

/**
 * Run `takuhon export` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"export"`).
 */
export function runExport(args: readonly string[] = []): ExportOutcome {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  const parsed = parseArgs(args);
  if ('error' in parsed) {
    return {
      code: 2,
      stdout: '',
      stderr: `${parsed.error}\nRun \`takuhon export --help\` for usage.\n`,
    };
  }

  return exportFile(parsed);
}

function parseArgs(args: readonly string[]): ParsedArgs | { error: string } {
  let path: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--embed-assets') {
      return {
        error:
          'takuhon: --embed-assets is not supported yet; assets are remote and asset embedding is deferred.',
      };
    }
    if (arg === '--output') {
      const value = args[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        return { error: 'takuhon: `--output` requires a value.' };
      }
      output = value;
      i++;
      continue;
    }
    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length);
      if (value === '') {
        return { error: 'takuhon: `--output` requires a value.' };
      }
      output = value;
      continue;
    }
    if (arg.startsWith('-')) {
      return { error: `takuhon: unknown option \`${arg}\` for \`export\`.` };
    }
    if (path !== undefined) {
      return { error: 'takuhon: `export` takes at most one path argument.' };
    }
    path = arg;
  }

  return { path: path ?? DEFAULT_PATH, output };
}

function exportFile(parsed: ParsedArgs): ExportOutcome {
  const { path, output } = parsed;

  // Export produces a separate transport artifact; refuse to write it over the
  // source (which would mutate the source via the refreshed meta.updatedAt).
  if (output !== undefined && resolve(output) === resolve(path)) {
    return {
      code: 2,
      stdout: '',
      stderr:
        `takuhon: --output '${output}' is the source file; export writes a separate artifact.\n` +
        'Omit --output to print to stdout, or choose a different file.\n',
    };
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: cannot read '${path}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: '${path}' is not valid JSON: ${detail}\n` };
  }

  const result = validate(data);
  if (!result.ok) {
    const lines = result.errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`);
    return {
      code: 1,
      stdout: '',
      stderr: `takuhon: '${path}' is not a valid takuhon profile; refusing to export:\n${lines.join('\n')}\n`,
    };
  }

  // Export the validated source faithfully — only meta.updatedAt is refreshed
  // (operational-lifecycle §5.1). We pass the parsed document rather than
  // `result.data` so `validate`'s coercion of absent optional arrays into `[]`
  // does not silently rewrite the export.
  const content = `${JSON.stringify(exportTakuhon(data as Takuhon), null, 2)}\n`;

  if (output === undefined) {
    // No --output: the serialised profile is the command's stdout.
    return { code: 0, stdout: content, stderr: '' };
  }

  try {
    writeFileAtomic(output, content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { code: 2, stdout: '', stderr: `takuhon: failed to write '${output}': ${detail}\n` };
  }

  return { code: 0, stdout: `exported ${path} -> ${output}\n`, stderr: '' };
}
