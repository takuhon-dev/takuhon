import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validate } from '@takuhon/core';
import type { Takuhon } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runExport } from '../export-command.js';

/** Minimal valid profile (0.1.0 is inside the supported window). */
const PROFILE = {
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

describe('runExport()', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-export-'));
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
    const out = runExport(['--help']);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('Usage: takuhon export');
  });

  it('prints a valid export to stdout by default and refreshes meta.updatedAt', () => {
    write(PROFILE);
    const out = runExport([path]);

    expect(out.code).toBe(0);
    const exported = JSON.parse(out.stdout) as Takuhon;
    expect(validate(exported).ok).toBe(true);
    expect(typeof exported.meta.updatedAt).toBe('string');
  });

  it('--output writes a file and leaves the source unchanged', () => {
    const original = write(PROFILE);
    const outPath = join(dir, 'export.json');
    const out = runExport([path, '--output', outPath]);

    expect(out.code).toBe(0);
    expect(out.stdout).toContain(`exported ${path} -> ${outPath}`);
    expect(validate(JSON.parse(readFileSync(outPath, 'utf8'))).ok).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(original); // source untouched
  });

  it('refuses to export over the source file (--output == source)', () => {
    const original = write(PROFILE);
    const out = runExport([path, '--output', path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('is the source file');
    expect(readFileSync(path, 'utf8')).toBe(original); // source untouched
  });

  it('rejects an invalid source with exit code 1', () => {
    write({ schemaVersion: '0.4.0' }); // missing required fields
    const out = runExport([path]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain('not a valid takuhon profile');
  });

  it('rejects --embed-assets as deferred with exit code 2', () => {
    write(PROFILE);
    const out = runExport([path, '--embed-assets']);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('--embed-assets is not supported');
  });

  it('exits 2 when the file cannot be read', () => {
    const out = runExport([join(dir, 'missing.json')]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('cannot read');
  });

  it('exits 2 on invalid JSON', () => {
    writeFileSync(path, '{not json', 'utf8');
    const out = runExport([path]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('not valid JSON');
  });

  it('does not write a file when exporting to stdout', () => {
    write(PROFILE);
    runExport([path]);
    // Only the source file exists; stdout export creates nothing on disk.
    expect(existsSync(join(dir, 'export.json'))).toBe(false);
  });
});
