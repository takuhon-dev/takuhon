import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_VERSION, migrateTakuhon, validate } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runImport } from '../import-command.js';

const FIXED = new Date('2026-05-11T12:00:00Z');
const now = () => FIXED;

const V010 = {
  schemaVersion: '0.1.0',
  profile: { displayName: { en: 'Imported' } },
  links: [],
  careers: [],
  projects: [],
  skills: [],
  contact: {},
  settings: { defaultLocale: 'en', availableLocales: ['en'] },
  meta: { contentLicense: { spdxId: 'CC0-1.0' } },
} as unknown as Takuhon;

const BACKUP_DIR = '.takuhon-backups';

function serialize(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

describe('runImport()', () => {
  let dir: string;
  let path: string;
  let input: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-import-'));
    path = join(dir, 'takuhon.json');
    input = join(dir, 'export.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', () => {
    const out = runImport(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon import');
  });

  it('imports an older export onto a fresh path, migrating to the current version', () => {
    writeFileSync(input, serialize(V010), 'utf8');
    const out = runImport([input, path], { now });

    expect(out.code).toBe(0);
    const written = JSON.parse(readFileSync(path, 'utf8')) as Takuhon;
    expect(written.schemaVersion).toBe(SCHEMA_VERSION); // migrated to latest
    expect(validate(written).ok).toBe(true);
    expect(written.profile.displayName).toEqual({ en: 'Imported' });
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // fresh import -> no backup
  });

  it('backs up the current profile before overwriting it', () => {
    const current = migrateTakuhon(
      { ...V010, profile: { displayName: { en: 'Current' } } },
      SCHEMA_VERSION,
    );
    writeFileSync(path, serialize(current), 'utf8');
    writeFileSync(input, serialize(V010), 'utf8');

    const out = runImport([input, path], { now });
    expect(out.code).toBe(0);

    // Target now holds the imported profile...
    expect((JSON.parse(readFileSync(path, 'utf8')) as Takuhon).profile.displayName).toEqual({
      en: 'Imported',
    });
    // ...and the previous profile was preserved under pre-import-<ts>.json.
    const backup = join(dir, BACKUP_DIR, 'pre-import-20260511T120000Z.json');
    expect(existsSync(backup)).toBe(true);
    expect((JSON.parse(readFileSync(backup, 'utf8')) as Takuhon).profile.displayName).toEqual({
      en: 'Current',
    });
    expect(out.stdout).toContain(backup);
  });

  it('round-trips: importing a latest-version export reproduces it', () => {
    const full = migrateTakuhon(V010, SCHEMA_VERSION); // a complete current-version profile
    writeFileSync(input, serialize(full), 'utf8');

    const out = runImport([input, path], { now });
    expect(out.code).toBe(0);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(full);
  });

  it('rejects an invalid input with exit code 1', () => {
    writeFileSync(input, JSON.stringify({ schemaVersion: SCHEMA_VERSION }), 'utf8');
    const out = runImport([input, path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('not a valid takuhon profile');
  });

  it('rejects an unsupported source version with exit code 1', () => {
    writeFileSync(input, JSON.stringify({ ...V010, schemaVersion: '9.9.9' }), 'utf8');
    const out = runImport([input, path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('cannot import');
  });

  it('exits 1 when the input JSON is not an object', () => {
    writeFileSync(input, 'null', 'utf8');
    const out = runImport([input, path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('expected a JSON object');
  });

  it('exits 1 when the input has no usable schemaVersion', () => {
    writeFileSync(input, JSON.stringify({ profile: {} }), 'utf8');
    const out = runImport([input, path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('no usable schemaVersion');
  });

  it('exits 2 when the input <file> is missing from the arguments', () => {
    const out = runImport([]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('requires an input');
  });

  it('exits 2 when the input file cannot be read', () => {
    const out = runImport([join(dir, 'nope.json'), path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read');
  });

  it('exits 2 on invalid JSON input', () => {
    writeFileSync(input, '{not json', 'utf8');
    const out = runImport([input, path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('not valid JSON');
  });
});
