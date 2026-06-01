/**
 * `takuhon validate [path]` — validate a `takuhon.json` against `@takuhon/core`.
 *
 * All argument handling and the validation itself live here as pure,
 * side-effect-free functions so the whole command is unit-testable: `index.ts`
 * runs `process.exit(main(...))` at module top level and is therefore not
 * import-safe. `runValidate` reads the target file itself but returns its
 * output as strings plus an exit code, leaving the actual stdout/stderr writes
 * and `process.exit` to the caller.
 *
 * Exit codes:
 *   0 — the document is valid (or `--help` was requested)
 *   1 — the document was read and parsed but failed schema validation
 *   2 — the command could not run: bad arguments, a missing/unreadable file,
 *       or a file that is not valid JSON (operational errors, distinct from an
 *       invalid-but-readable document)
 */

import { readFileSync } from 'node:fs';

import { validate } from '@takuhon/core';

/** Default profile filename, resolved relative to the current working directory. */
const DEFAULT_PATH = 'takuhon.json';

const USAGE = `Usage: takuhon validate [path]

Validate a takuhon.json against the takuhon schema. With no path, validates
./takuhon.json in the current working directory.

Exit codes: 0 = valid, 1 = invalid, 2 = file missing / unreadable / not JSON.
`;

export interface ValidateOutcome {
  /** Process exit code (see module docstring). */
  readonly code: number;
  /** Text destined for stdout (empty when there is nothing to print). */
  readonly stdout: string;
  /** Text destined for stderr (empty when there is nothing to print). */
  readonly stderr: string;
}

/**
 * Run `takuhon validate` against the arguments that follow the subcommand
 * (i.e. `process.argv.slice(2)` minus the leading `"validate"`).
 *
 * Handles `--help` / `-h` and rejects extra positionals, then validates the
 * `takuhon.json` at the single optional path argument (default
 * `./takuhon.json`). Never throws and never writes to the process streams —
 * the caller renders the returned `stdout` / `stderr` and exits with `code`.
 */
export function runValidate(args: readonly string[] = []): ValidateOutcome {
  if (args[0] === '--help' || args[0] === '-h') {
    return { code: 0, stdout: USAGE, stderr: '' };
  }

  if (args.length > 1) {
    return {
      code: 2,
      stdout: '',
      stderr:
        'takuhon: `validate` takes at most one path argument.\n' +
        'Run `takuhon validate --help` for usage.\n',
    };
  }

  return validateFile(args[0]);
}

/** Read, parse, and schema-validate the profile at `pathArg` (default `./takuhon.json`). */
function validateFile(pathArg?: string): ValidateOutcome {
  const target = pathArg ?? DEFAULT_PATH;

  let raw: string;
  try {
    raw = readFileSync(target, 'utf8');
  } catch {
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: cannot read '${target}'. Pass a path, or run from a directory containing a takuhon.json.\n`,
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      code: 2,
      stdout: '',
      stderr: `takuhon: '${target}' is not valid JSON: ${detail}\n`,
    };
  }

  const result = validate(data);
  if (result.ok) {
    return {
      code: 0,
      stdout: `${target}: valid (schemaVersion ${result.data.schemaVersion}).\n`,
      stderr: '',
    };
  }

  const count = result.errors.length;
  const lines = result.errors.map((error) => `  ${error.pointer || '/'}: ${error.message}`);
  return {
    code: 1,
    stdout: '',
    stderr: `${target}: invalid (${count} error${count === 1 ? '' : 's'}):\n${lines.join('\n')}\n`,
  };
}
