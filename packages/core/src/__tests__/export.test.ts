import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import { exportOwnport, ImportError, importOwnport, validate } from '../index.js';
import type { Ownport } from '../index.js';

function cloneExample(): Ownport {
  return JSON.parse(JSON.stringify(exampleJson)) as Ownport;
}

describe('exportOwnport', () => {
  it('returns a structural clone (mutating the output does not touch input)', () => {
    const input = cloneExample();
    const out = exportOwnport(input, { updateTimestamp: false });
    out.profile.displayName = { en: 'mutated' };
    expect(input.profile.displayName).not.toEqual({ en: 'mutated' });
  });

  it('overwrites meta.updatedAt with an ISO-8601 timestamp by default', () => {
    const input = cloneExample();
    input.meta.updatedAt = '2020-01-01T00:00:00Z';
    const before = Date.now();
    const out = exportOwnport(input);
    const after = Date.now();
    const updated = Date.parse(out.meta.updatedAt ?? '');
    expect(Number.isFinite(updated)).toBe(true);
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
  });

  it('leaves meta.updatedAt untouched when updateTimestamp: false', () => {
    const input = cloneExample();
    input.meta.updatedAt = '2020-01-01T00:00:00Z';
    const out = exportOwnport(input, { updateTimestamp: false });
    expect(out.meta.updatedAt).toBe('2020-01-01T00:00:00Z');
  });

  it('preserves meta.generator verbatim', () => {
    const input = cloneExample();
    input.meta.generator = 'my-tool@1.2.3';
    const out = exportOwnport(input);
    expect(out.meta.generator).toBe('my-tool@1.2.3');
  });

  it('output round-trips through validate()', () => {
    const out = exportOwnport(cloneExample());
    const result = validate(out);
    expect(result.ok).toBe(true);
  });
});

describe('importOwnport', () => {
  it('returns a Ownport for a valid input', () => {
    const out = importOwnport(cloneExample());
    expect(out.schemaVersion).toBe('0.1.0');
    expect(out.profile.displayName).toBeDefined();
  });

  it('throws ImportError carrying validation errors for malformed input', () => {
    const broken = cloneExample() as unknown as Record<string, unknown>;
    delete broken.profile;
    let caught: unknown;
    try {
      importOwnport(broken as unknown as Ownport);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ImportError);
    const err = caught as ImportError;
    expect(err.errors).toBeDefined();
    expect(err.errors!.length).toBeGreaterThan(0);
  });

  it('throws ImportError for an unsupported schemaVersion', () => {
    const futuristic = cloneExample();
    futuristic.schemaVersion = '9.9.9';
    expect(() => importOwnport(futuristic)).toThrow(ImportError);
  });

  it('does not mutate the input on success', () => {
    const input = cloneExample();
    const snapshot = JSON.stringify(input);
    importOwnport(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('roundtrip', () => {
  it('importOwnport(exportOwnport(x, { updateTimestamp: false })) deep-equals x', () => {
    const input = cloneExample();
    const out = importOwnport(exportOwnport(input, { updateTimestamp: false }));
    expect(out).toEqual(input);
  });

  it('two consecutive exports with updateTimestamp: false are deep-equal', () => {
    const input = cloneExample();
    const first = exportOwnport(input, { updateTimestamp: false });
    const second = exportOwnport(first, { updateTimestamp: false });
    expect(second).toEqual(first);
  });
});

describe('ImportError', () => {
  it('is an Error with name "ImportError" and exposes errors[]', () => {
    const err = new ImportError('boom', {
      errors: [{ pointer: '/foo', message: 'bad', keyword: 'required' }],
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.name).toBe('ImportError');
    expect(err.message).toBe('boom');
    expect(err.errors).toHaveLength(1);
    expect(err.errors![0]?.pointer).toBe('/foo');
  });

  it('preserves cause when supplied', () => {
    const cause = new Error('underlying');
    const err = new ImportError('boom', { cause });
    expect(err.cause).toBe(cause);
  });
});
