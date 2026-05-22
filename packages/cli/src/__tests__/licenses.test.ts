import { describe, expect, it } from 'vitest';

import { LICENSE_OPTIONS, buildContentLicense, isValidSpdxInput } from '../licenses.js';

describe('LICENSE_OPTIONS', () => {
  it('exposes the four curated license options in interactive-picker order', () => {
    expect(LICENSE_OPTIONS.map((o) => o.spdxId)).toEqual([
      'CC-BY-4.0',
      'CC-BY-NC-4.0',
      'CC0-1.0',
      'Proprietary',
    ]);
  });

  it('attaches a canonical creativecommons.org URL to every Creative Commons option', () => {
    for (const opt of LICENSE_OPTIONS) {
      if (opt.spdxId.startsWith('CC')) {
        expect(opt.url).toMatch(/^https:\/\/creativecommons\.org\//);
      }
    }
  });

  it('omits the URL for Proprietary (rights are conveyed via the `rights` field)', () => {
    const proprietary = LICENSE_OPTIONS.find((o) => o.spdxId === 'Proprietary');
    expect(proprietary).toBeDefined();
    expect(proprietary?.url).toBeUndefined();
  });

  it('provides a label and a hint for every option (prompt cosmetics)', () => {
    for (const opt of LICENSE_OPTIONS) {
      expect(opt.label).toMatch(/\S/);
      expect(opt.hint).toMatch(/\S/);
    }
  });
});

describe('buildContentLicense()', () => {
  it('emits spdxId + url for a known Creative Commons identifier', () => {
    expect(buildContentLicense('CC-BY-4.0')).toEqual({
      spdxId: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('emits spdxId + rights (no url) for Proprietary', () => {
    const result = buildContentLicense('Proprietary');
    expect(result.spdxId).toBe('Proprietary');
    expect(result.url).toBeUndefined();
    expect(result.rights).toMatch(/all rights reserved/i);
  });

  it('looks up canonical URLs for SPDX identifiers outside the prompt set', () => {
    expect(buildContentLicense('CC-BY-SA-4.0').url).toBe(
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
    expect(buildContentLicense('MIT').url).toBe('https://spdx.org/licenses/MIT.html');
  });

  it('emits spdxId only for unknown SPDX expressions (best-effort UI)', () => {
    const result = buildContentLicense('MIT OR Apache-2.0');
    expect(result).toEqual({ spdxId: 'MIT OR Apache-2.0' });
    expect(result.url).toBeUndefined();
    expect(result.rights).toBeUndefined();
  });
});

describe('isValidSpdxInput()', () => {
  it('accepts canonical SPDX identifiers used by the prompt and other common licenses', () => {
    for (const id of [
      'CC-BY-4.0',
      'CC-BY-NC-4.0',
      'CC0-1.0',
      'Proprietary',
      'MIT',
      'Apache-2.0',
      'GPL-2.0-or-later',
    ]) {
      expect(isValidSpdxInput(id)).toBe(true);
    }
  });

  it('accepts SPDX boolean expressions', () => {
    expect(isValidSpdxInput('MIT OR Apache-2.0')).toBe(true);
    expect(isValidSpdxInput('(MIT AND Apache-2.0)')).toBe(true);
    expect(isValidSpdxInput('MIT+')).toBe(true);
  });

  it('rejects empty / whitespace-only input', () => {
    expect(isValidSpdxInput('')).toBe(false);
    expect(isValidSpdxInput('   ')).toBe(false);
    expect(isValidSpdxInput('\t\n')).toBe(false);
  });

  it('rejects input with characters disallowed by the SPDX grammar', () => {
    expect(isValidSpdxInput('MIT/Apache-2.0')).toBe(false);
    expect(isValidSpdxInput('CC-BY-4.0!')).toBe(false);
    expect(isValidSpdxInput('MIT\nApache')).toBe(false);
  });
});
