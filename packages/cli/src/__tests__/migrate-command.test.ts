import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_VERSION, migrateTakuhon, validate } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runMigrate } from '../migrate-command.js';

const FIXED = new Date('2026-05-11T12:00:00Z');
const now = () => FIXED;

/** Minimal 0.1.0-shaped profile (mirrors core's migrate fixtures). */
const V010 = {
  schemaVersion: '0.1.0',
  profile: { displayName: { en: 'Test' } },
  links: [],
  careers: [],
  projects: [],
  skills: [],
  contact: {},
  settings: { defaultLocale: 'en', availableLocales: ['en'] },
  meta: { contentLicense: { spdxId: 'CC0-1.0' } },
} as unknown as Takuhon;

const BACKUP_DIR = '.takuhon-backups';

describe('runMigrate()', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-migrate-'));
    path = join(dir, 'takuhon.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(doc: unknown): string {
    const raw = `${JSON.stringify(doc, null, 2)}\n`;
    writeFileSync(path, raw, 'utf8');
    return raw;
  }

  it('--help exits 0 with usage', () => {
    const out = runMigrate(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon migrate');
  });

  it('forward-migrates a 0.1.0 file to the latest version and backs up the original', () => {
    const original = write(V010);
    const out = runMigrate([path], { now });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`migrated ${path}: 0.1.0 -> ${SCHEMA_VERSION}`);

    // The file is now at the latest version and validates.
    const migrated = JSON.parse(readFileSync(path, 'utf8')) as Takuhon;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(validate(migrated).ok).toBe(true);

    // The original bytes were backed up under the injected timestamp.
    const backup = join(dir, BACKUP_DIR, `takuhon-backup-v0.1.0-20260511T120000Z.json`);
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf8')).toBe(original);
    expect(out.stdout).toContain(backup);
  });

  it('is a no-op when already at the target version', () => {
    const v040 = migrateTakuhon(V010, SCHEMA_VERSION);
    const before = write(v040);
    const out = runMigrate([path], { now });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`already at schemaVersion ${SCHEMA_VERSION}`);
    expect(readFileSync(path, 'utf8')).toBe(before); // unchanged
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // no backup
  });

  it('--dry-run reports the plan and writes nothing', () => {
    const before = write(V010);
    const out = runMigrate([path, '--dry-run'], { now });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`would migrate 0.1.0 -> ${SCHEMA_VERSION}`);
    expect(out.stdout).toContain('takuhon-backup-v0.1.0-20260511T120000Z.json');
    expect(readFileSync(path, 'utf8')).toBe(before); // unchanged
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // nothing written
  });

  it('rejects a downgrade with exit code 1 and a forward-only hint', () => {
    write(migrateTakuhon(V010, SCHEMA_VERSION));
    const out = runMigrate([path, '--to', '0.2.0'], { now });

    expect(out.code).toBe(1);
    expect(out.stderr).toContain('forward-only');
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // no write, no backup
  });

  it('--dry-run on a downgrade still reports cannot-migrate (exit 1) and writes nothing', () => {
    const before = write(migrateTakuhon(V010, SCHEMA_VERSION));
    const out = runMigrate([path, '--to', '0.2.0', '--dry-run'], { now });

    // The dry-run runs the feasibility gate first, so it does not falsely
    // claim it "would migrate" a downgrade.
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('forward-only');
    expect(readFileSync(path, 'utf8')).toBe(before); // unchanged
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false);
  });

  it('an --out symlink that aliases the source does not clobber the source (atomic write)', () => {
    const original = write(V010);
    const alias = join(dir, 'alias.json');
    symlinkSync(path, alias); // alias -> takuhon.json

    const out = runMigrate([path, '--out', alias], { now });
    expect(out.code).toBe(0);

    // The atomic rename replaces the `alias` name rather than following it, so
    // the source file is left intact (no silent data loss).
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect((JSON.parse(readFileSync(alias, 'utf8')) as Takuhon).schemaVersion).toBe(SCHEMA_VERSION);
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // not in place -> no backup
  });

  it('rejects an out-of-window --to with exit code 2', () => {
    write(V010);
    const out = runMigrate([path, '--to', '9.9.9'], { now });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('unsupported --to version');
  });

  it('--out writes elsewhere and leaves the source (and backups) untouched', () => {
    const original = write(V010);
    const outPath = join(dir, 'out.json');
    const out = runMigrate([path, '--out', outPath], { now });

    expect(out.code).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(original); // source unchanged
    expect((JSON.parse(readFileSync(outPath, 'utf8')) as Takuhon).schemaVersion).toBe(
      SCHEMA_VERSION,
    );
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // source preserved -> no backup
  });

  it('exits 2 when the file cannot be read', () => {
    const out = runMigrate([join(dir, 'missing.json')], { now });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read');
  });

  it('exits 2 on invalid JSON', () => {
    writeFileSync(path, '{not json', 'utf8');
    const out = runMigrate([path], { now });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('not valid JSON');
  });

  it('exits 1 when schemaVersion is missing', () => {
    write({ profile: {} });
    const out = runMigrate([path], { now });
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('no usable schemaVersion');
    // Only the input remains in the directory; no stray backups.
    expect(readdirSync(dir)).toEqual(['takuhon.json']);
  });
});
