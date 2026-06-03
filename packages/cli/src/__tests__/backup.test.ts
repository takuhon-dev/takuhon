import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BackupError,
  backupDirFor,
  compactTimestamp,
  createBackup,
  migrateBackupName,
  preImportName,
  preRestoreName,
} from '../backup.js';

const FIXED = new Date('2026-05-11T12:00:00.123Z');

describe('compactTimestamp()', () => {
  it('formats UTC at second precision by default', () => {
    expect(compactTimestamp(FIXED)).toBe('20260511T120000Z');
  });

  it('keeps milliseconds when asked', () => {
    expect(compactTimestamp(FIXED, true)).toBe('20260511T120000.123Z');
  });
});

describe('backup filename builders', () => {
  it('migrateBackupName embeds the source version and timestamp', () => {
    expect(migrateBackupName('0.1.0', FIXED)).toBe('takuhon-backup-v0.1.0-20260511T120000Z.json');
    expect(migrateBackupName('0.1.0', FIXED, true)).toBe(
      'takuhon-backup-v0.1.0-20260511T120000.123Z.json',
    );
  });

  it('preRestoreName follows the pre-restore convention', () => {
    expect(preRestoreName(FIXED)).toBe('pre-restore-20260511T120000Z.json');
  });

  it('preImportName follows the pre-import convention', () => {
    expect(preImportName(FIXED)).toBe('pre-import-20260511T120000Z.json');
  });

  it('backupDirFor resolves .takuhon-backups beside the target', () => {
    expect(backupDirFor('/a/b/takuhon.json')).toBe('/a/b/.takuhon-backups');
    expect(backupDirFor('takuhon.json')).toBe('.takuhon-backups');
  });
});

describe('createBackup()', () => {
  let dir: string;
  let target: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-backup-'));
    target = join(dir, 'takuhon.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes content into .takuhon-backups beside the target', () => {
    const written = createBackup({
      targetPath: target,
      content: '{"v":1}',
      name: (ms) => migrateBackupName('0.1.0', FIXED, ms),
    });
    expect(written).toBe(
      join(dir, '.takuhon-backups', 'takuhon-backup-v0.1.0-20260511T120000Z.json'),
    );
    expect(readFileSync(written, 'utf8')).toBe('{"v":1}');
  });

  it('falls back to millisecond precision on a same-second collision (§3.3)', () => {
    const name = (ms: boolean) => migrateBackupName('0.1.0', FIXED, ms);
    const first = createBackup({ targetPath: target, content: 'a', name });
    const second = createBackup({ targetPath: target, content: 'b', name });

    expect(first).toBe(
      join(dir, '.takuhon-backups', 'takuhon-backup-v0.1.0-20260511T120000Z.json'),
    );
    expect(second).toBe(
      join(dir, '.takuhon-backups', 'takuhon-backup-v0.1.0-20260511T120000.123Z.json'),
    );
    // The original is never overwritten.
    expect(readFileSync(first, 'utf8')).toBe('a');
    expect(readFileSync(second, 'utf8')).toBe('b');
  });

  it('throws BackupError when both names already exist', () => {
    const name = (ms: boolean) => migrateBackupName('0.1.0', FIXED, ms);
    createBackup({ targetPath: target, content: 'a', name });
    createBackup({ targetPath: target, content: 'b', name });
    expect(() => createBackup({ targetPath: target, content: 'c', name })).toThrow(BackupError);
  });

  it('creates the backup directory if it does not exist yet', () => {
    expect(existsSync(join(dir, '.takuhon-backups'))).toBe(false);
    createBackup({
      targetPath: target,
      content: 'x',
      name: (ms) => preRestoreName(FIXED, ms),
    });
    expect(existsSync(join(dir, '.takuhon-backups'))).toBe(true);
  });
});
