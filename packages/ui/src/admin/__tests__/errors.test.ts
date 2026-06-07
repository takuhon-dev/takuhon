import { describe, expect, it } from 'vitest';

import {
  canonicalPointer,
  errorsAt,
  hasErrorsUnder,
  indexErrors,
  NO_FIELD_ERRORS,
} from '../errors.js';

describe('canonicalPointer', () => {
  it('strips a leading # fragment marker', () => {
    expect(canonicalPointer('#/profile/displayName/en')).toBe('/profile/displayName/en');
  });

  it('leaves an already-canonical pointer unchanged (idempotent)', () => {
    expect(canonicalPointer('/links/0/url')).toBe('/links/0/url');
    expect(canonicalPointer(canonicalPointer('#/links/0/url'))).toBe('/links/0/url');
  });

  it('adds a leading slash to a bare path and preserves the empty root', () => {
    expect(canonicalPointer('profile/bio')).toBe('/profile/bio');
    expect(canonicalPointer('')).toBe('');
    expect(canonicalPointer('#')).toBe('');
  });
});

describe('indexErrors', () => {
  it('groups both the core (pointer) and wire (path) shapes by location', () => {
    const index = indexErrors([
      { pointer: '/profile/displayName/en', message: 'is required' },
      { path: '#/profile/displayName/en', message: 'too short' },
      { path: '#/links/0/url', message: 'must be a uri' },
    ]);
    expect(errorsAt(index, '/profile/displayName/en')).toEqual(['is required', 'too short']);
    expect(errorsAt(index, '#/links/0/url')).toEqual(['must be a uri']);
  });

  it('returns an empty array for a location with no errors', () => {
    const index = indexErrors([{ pointer: '/profile/bio/en', message: 'too long' }]);
    expect(errorsAt(index, '/profile/tagline/en')).toEqual([]);
    expect(errorsAt(NO_FIELD_ERRORS, '/anything')).toEqual([]);
  });
});

describe('hasErrorsUnder', () => {
  const index = indexErrors([{ path: '#/careers/1/role/ja', message: 'is required' }]);

  it('is true at the exact pointer and any ancestor prefix', () => {
    expect(hasErrorsUnder(index, '/careers')).toBe(true);
    expect(hasErrorsUnder(index, '/careers/1')).toBe(true);
    expect(hasErrorsUnder(index, '/careers/1/role/ja')).toBe(true);
  });

  it('is false for sibling or unrelated prefixes', () => {
    expect(hasErrorsUnder(index, '/careers/0')).toBe(false);
    expect(hasErrorsUnder(index, '/projects')).toBe(false);
  });
});
