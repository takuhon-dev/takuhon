import { describe, expect, it } from 'vitest';

import { ERROR_SLUGS, buildProblem } from '../error-envelope.js';

describe('error-envelope', () => {
  it('builds the type URI from the slug under https://takuhon.dev/errors/', () => {
    const out = buildProblem({
      slug: ERROR_SLUGS.notFound,
      status: 404,
      title: 'Not Found',
      detail: 'route missing',
      instance: '/api/missing',
    });
    expect(out.type).toBe('https://takuhon.dev/errors/not-found');
  });

  it('preserves status / title / detail / instance verbatim', () => {
    const out = buildProblem({
      slug: ERROR_SLUGS.conflict,
      status: 409,
      title: 'Conflict',
      detail: 'version mismatch',
      instance: '/api/admin/profile',
    });
    expect(out.status).toBe(409);
    expect(out.title).toBe('Conflict');
    expect(out.detail).toBe('version mismatch');
    expect(out.instance).toBe('/api/admin/profile');
  });

  it('omits errors[] and currentVersion when the inputs are absent', () => {
    const out = buildProblem({
      slug: ERROR_SLUGS.internal,
      status: 500,
      title: 'Internal Error',
      detail: 'boom',
      instance: '/anywhere',
    });
    expect(Object.prototype.hasOwnProperty.call(out, 'errors')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'currentVersion')).toBe(false);
  });

  it('propagates errors[] and currentVersion when supplied', () => {
    const out = buildProblem({
      slug: ERROR_SLUGS.validationFailed,
      status: 422,
      title: 'Validation Failed',
      detail: 'see errors',
      instance: '/api/admin/profile',
      errors: [{ path: '#/profile/displayName', message: 'is required' }],
      currentVersion: 'abc123',
    });
    expect(out.errors).toEqual([{ path: '#/profile/displayName', message: 'is required' }]);
    expect(out.currentVersion).toBe('abc123');
  });

  it('ERROR_SLUGS covers all Spec-defined slugs plus the local method-not-allowed', () => {
    const values = Object.values(ERROR_SLUGS).sort();
    expect(values).toEqual(
      [
        'bad-request',
        'conflict',
        'forbidden',
        'internal',
        'method-not-allowed',
        'not-found',
        'payload-too-large',
        'service-unavailable',
        'too-many-requests',
        'unauthorized',
        'unsupported-media-type',
        'validation-failed',
      ].sort(),
    );
  });
});
