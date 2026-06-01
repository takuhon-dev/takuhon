import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMA_VERSION } from '@takuhon/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runValidate } from '../validate-command.js';

/** A minimal schema-valid profile, mirroring examples/minimal-profile. */
function validProfile(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { displayName: { en: 'Sam Lee' } },
    links: [
      { id: 'github', type: 'github', url: 'https://example.com/github/sam-lee', featured: true },
    ],
    careers: [
      {
        id: 'first-job',
        organization: { en: 'Example Co.' },
        role: { en: 'Junior Software Engineer' },
        startDate: '2026-04',
        endDate: null,
        isCurrent: true,
      },
    ],
    projects: [{ id: 'personal-homepage', title: { en: 'Personal homepage' } }],
    skills: [{ id: 'html', label: 'HTML' }],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  };
}

describe('runValidate() — `takuhon validate`', () => {
  let workDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'takuhon-cli-validate-'));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
  });

  async function writeProfile(name: string, value: unknown): Promise<string> {
    const path = join(workDir, name);
    await writeFile(
      path,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      'utf8',
    );
    return path;
  }

  it('returns exit code 0 and a success line for a valid profile', async () => {
    const path = await writeProfile('takuhon.json', validProfile());

    const result = runValidate([path]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('valid');
    expect(result.stdout).toContain(SCHEMA_VERSION);
    expect(result.stderr).toBe('');
  });

  it('returns exit code 1 and lists errors for an invalid profile', async () => {
    const broken = validProfile();
    delete broken.profile; // `profile` is required by the schema.
    const path = await writeProfile('takuhon.json', broken);

    const result = runValidate([path]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('invalid');
    expect(result.stderr.toLowerCase()).toContain('profile');
  });

  it('returns exit code 1 for a schemaVersion outside the supported window', async () => {
    const future = validProfile();
    future.schemaVersion = '9.9.9';
    const path = await writeProfile('takuhon.json', future);

    const result = runValidate([path]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('schemaVersion');
  });

  it('returns exit code 1 for JSON that parses to a non-object', async () => {
    const path = await writeProfile('takuhon.json', '42');

    const result = runValidate([path]);

    expect(result.code).toBe(1);
    expect(result.stderr.toLowerCase()).toContain('object');
  });

  it('returns exit code 2 when the file does not exist', () => {
    const result = runValidate([join(workDir, 'missing.json')]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot read');
    expect(result.stdout).toBe('');
  });

  it('returns exit code 2 when the path is a directory', () => {
    const result = runValidate([workDir]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('cannot read');
  });

  it('returns exit code 2 when the file is not valid JSON', async () => {
    const path = await writeProfile('takuhon.json', '{ this is not json ');

    const result = runValidate([path]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('not valid JSON');
  });

  it('returns exit code 2 and a usage hint when given more than one path', async () => {
    const a = await writeProfile('a.json', validProfile());
    const b = await writeProfile('b.json', validProfile());

    const result = runValidate([a, b]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('at most one');
  });

  it('prints usage and exits 0 for --help / -h', () => {
    for (const flag of ['--help', '-h']) {
      const result = runValidate([flag]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: takuhon validate');
      expect(result.stderr).toBe('');
    }
  });

  it('defaults to ./takuhon.json in the current working directory', async () => {
    await writeProfile('takuhon.json', validProfile());
    process.chdir(workDir);

    const result = runValidate([]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('valid');
  });
});
