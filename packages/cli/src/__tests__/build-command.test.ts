import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runBuild } from '../build-command.js';

/** A valid multi-locale (en + ja) 0.4.0 profile carrying privacy-sensitive fields. */
function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '0.4.0',
    profile: {
      displayName: { en: 'Pat Rivera', ja: 'パット・リベラ' },
      tagline: { en: 'Maintainer', ja: 'メンテナ' },
    },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    certifications: [
      {
        id: 'c1',
        title: { en: 'Cert' },
        issuingOrganization: { en: 'Org' },
        issueDate: '2024-01',
        credentialId: 'CRED-SECRET',
      },
    ],
    education: [
      { id: 'e1', institution: { en: 'Uni' }, startDate: '2018-09', grade: 'GRADE-SECRET' },
    ],
    contact: { email: 'secret@example.com' },
    settings: { defaultLocale: 'en', availableLocales: ['en', 'ja'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  };
}

describe('runBuild()', () => {
  let dir: string;
  let src: string;
  let out: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'takuhon-build-'));
    src = join(dir, 'takuhon.json');
    out = join(dir, 'site');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(doc: Record<string, unknown>): void {
    writeFileSync(src, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }

  it('--help exits 0 with usage', () => {
    const res = runBuild(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Usage: takuhon build');
  });

  it('writes one page per locale (default at root, others under <locale>/)', () => {
    write(fixture());
    const res = runBuild([src, '--output', out]);
    expect(res.code).toBe(0);

    const rootHtml = readFileSync(join(out, 'index.html'), 'utf8');
    const jaHtml = readFileSync(join(out, 'ja', 'index.html'), 'utf8');
    expect(rootHtml).toContain('<html lang="en">');
    expect(rootHtml).toContain('Pat Rivera');
    expect(jaHtml).toContain('<html lang="ja">');
    expect(jaHtml).toContain('パット・リベラ');
  });

  it('emits JSON-LD by default and omits it when settings.enableJsonLd is false', () => {
    write(fixture());
    runBuild([src, '--output', out]);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('application/ld+json');

    rmSync(out, { recursive: true, force: true });
    write(
      fixture({ settings: { defaultLocale: 'en', availableLocales: ['en'], enableJsonLd: false } }),
    );
    runBuild([src, '--output', out]);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('application/ld+json');
  });

  it('adds absolute canonical + hreflang only with --base-url', () => {
    write(fixture());
    runBuild([src, '--output', out, '--base-url', 'https://me.example/']);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="canonical" href="https://me.example/">');
    expect(html).toContain('hreflang="ja" href="https://me.example/ja/"');
    expect(html).toContain('hreflang="x-default"');
    // The locale switcher stays relative even with --base-url.
    expect(html).toContain('href="ja/"');

    rmSync(out, { recursive: true, force: true });
    runBuild([src, '--output', out]);
    const relHtml = readFileSync(join(out, 'index.html'), 'utf8');
    expect(relHtml).not.toContain('rel="canonical"');
    expect(relHtml).not.toContain('hreflang=');
  });

  it('applies the privacy filter: email + credentialId + grade hidden by default', () => {
    write(fixture());
    runBuild([src, '--output', out]);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    // None of the privacy-sensitive strings may appear, including inside JSON-LD.
    expect(html).not.toContain('secret@example.com');
    expect(html).not.toContain('CRED-SECRET');
    expect(html).not.toContain('GRADE-SECRET');

    rmSync(out, { recursive: true, force: true });
    write(fixture({ contact: { email: 'secret@example.com', showEmail: true } }));
    runBuild([src, '--output', out]);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('secret@example.com');
  });

  it('rejects an invalid source with exit code 1', () => {
    write({ schemaVersion: '0.4.0' }); // missing required fields
    const res = runBuild([src, '--output', out]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('not a valid takuhon profile');
    expect(existsSync(out)).toBe(false);
  });

  it('exits 2 on missing file, non-JSON, and extra arguments', () => {
    expect(runBuild([join(dir, 'nope.json'), '--output', out]).code).toBe(2);

    writeFileSync(src, '{not json', 'utf8');
    expect(runBuild([src, '--output', out]).code).toBe(2);

    write(fixture());
    expect(runBuild([src, 'extra', '--output', out]).code).toBe(2);
  });

  it('exits 2 on a malformed --base-url', () => {
    write(fixture());
    const res = runBuild([src, '--output', out, '--base-url', 'not-a-url']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('absolute http(s) URL');
  });
});
