import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrateTakuhon } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runMigrate } from '../migrate-command.js';
import { runRestore } from '../restore-command.js';

const MIGRATE_AT = new Date('2026-05-11T12:00:00Z');
const RESTORE_AT = new Date('2026-05-11T13:00:00Z');

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

function serialize(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

describe('runRestore()', () => {
  let dir: string;
  let path: string;
  let backupPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-restore-'));
    path = join(dir, 'takuhon.json');
    backupPath = join(dir, 'backup.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('--help exits 0 with usage', async () => {
    const out = await runRestore(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon restore');
  });

  it('round-trips: migrate then restore reproduces the original bytes', async () => {
    const original = serialize(V010);
    writeFileSync(path, original, 'utf8');

    // Migrate forward; this leaves a backup of the original 0.1.0 bytes.
    const migrate = runMigrate([path], { now: () => MIGRATE_AT });
    expect(migrate.code).toBe(0);
    const migrateBackup = join(dir, BACKUP_DIR, 'takuhon-backup-v0.1.0-20260511T120000Z.json');
    expect(existsSync(migrateBackup)).toBe(true);

    // Restore from that backup.
    const restore = await runRestore([`--from`, migrateBackup, path, '--yes'], {
      now: () => RESTORE_AT,
    });
    expect(restore.code).toBe(0);

    // The file is byte-for-byte the original again.
    expect(readFileSync(path, 'utf8')).toBe(original);

    // The pre-migration 0.4.0 state was preserved before overwriting.
    const preRestore = join(dir, BACKUP_DIR, 'pre-restore-20260511T130000Z.json');
    expect(existsSync(preRestore)).toBe(true);
    expect((JSON.parse(readFileSync(preRestore, 'utf8')) as Takuhon).schemaVersion).not.toBe(
      '0.1.0',
    );
    expect(restore.stdout).toContain(preRestore);
  });

  it('with --yes, does not call the confirm prompt', async () => {
    writeFileSync(path, serialize(migrateTakuhon(V010, '0.4.0')), 'utf8');
    writeFileSync(backupPath, serialize(V010), 'utf8');

    let called = false;
    const out = await runRestore(['--from', backupPath, path, '--yes'], {
      now: () => RESTORE_AT,
      confirm: () => {
        called = true;
        return true;
      },
    });

    expect(out.code).toBe(0);
    expect(called).toBe(false);
    expect((JSON.parse(readFileSync(path, 'utf8')) as Takuhon).schemaVersion).toBe('0.1.0');
  });

  it('aborts with no changes when the prompt is declined', async () => {
    const current = serialize(migrateTakuhon(V010, '0.4.0'));
    writeFileSync(path, current, 'utf8');
    writeFileSync(backupPath, serialize(V010), 'utf8');

    const out = await runRestore(['--from', backupPath, path], { confirm: () => false });

    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Aborted');
    expect(readFileSync(path, 'utf8')).toBe(current); // untouched
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false); // no pre-restore backup
  });

  it('refuses to overwrite non-interactively without --yes', async () => {
    writeFileSync(path, serialize(migrateTakuhon(V010, '0.4.0')), 'utf8');
    writeFileSync(backupPath, serialize(V010), 'utf8');

    const out = await runRestore(['--from', backupPath, path]); // no confirm, no --yes
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('without confirmation');
  });

  it('shows an informative confirmation message including the pre-restore path', async () => {
    writeFileSync(path, serialize(migrateTakuhon(V010, '0.4.0')), 'utf8');
    writeFileSync(backupPath, serialize(V010), 'utf8');

    let seen = '';
    await runRestore(['--from', backupPath, path], {
      now: () => RESTORE_AT,
      confirm: (message) => {
        seen = message;
        return true;
      },
    });

    expect(seen).toContain(`overwrite the profile at ${path}`);
    expect(seen).toContain('pre-restore-20260511T130000Z.json');
    expect(seen).toContain('[y/N]');
  });

  it('rejects an invalid backup with exit code 1', async () => {
    writeFileSync(backupPath, JSON.stringify({ schemaVersion: '0.4.0' }), 'utf8');
    const out = await runRestore(['--from', backupPath, path, '--yes']);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('not a valid takuhon profile');
  });

  it('exits 2 when --from is missing', async () => {
    const out = await runRestore([path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('requires `--from');
  });

  it('exits 2 when the backup cannot be read', async () => {
    const out = await runRestore(['--from', join(dir, 'nope.json'), path, '--yes']);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read backup');
  });

  it('restores onto a fresh path with no pre-restore backup', async () => {
    writeFileSync(backupPath, serialize(V010), 'utf8');
    const out = await runRestore(['--from', backupPath, path, '--yes'], { now: () => RESTORE_AT });

    expect(out.code).toBe(0);
    expect((JSON.parse(readFileSync(path, 'utf8')) as Takuhon).schemaVersion).toBe('0.1.0');
    // Nothing to preserve, so no pre-restore backup was written.
    expect(existsSync(join(dir, BACKUP_DIR))).toBe(false);
  });
});
