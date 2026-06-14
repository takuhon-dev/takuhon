import { describe, expect, it } from 'vitest';

import { gravatarUrl } from '../gravatar.js';

/**
 * SHA-256 hex of a trimmed + lower-cased email, computed independently via the
 * platform's Web Crypto (typed by the DOM lib, so core stays Node-type free).
 */
async function expectedHash(email: string): Promise<string> {
  const bytes = new Uint8Array(new TextEncoder().encode(email.trim().toLowerCase()));
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const BASE = 'https://gravatar.com/avatar/';

describe('gravatarUrl', () => {
  it('hashes the email with SHA-256 onto the canonical avatar path', async () => {
    const url = gravatarUrl('person@example.com');
    expect(url).toBe(`${BASE}${await expectedHash('person@example.com')}`);
    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}$/);
  });

  it('normalizes by trimming and lower-casing the email', () => {
    const canonical = gravatarUrl('person@example.com');
    expect(gravatarUrl('  Person@Example.com  ')).toBe(canonical);
    expect(gravatarUrl('PERSON@EXAMPLE.COM')).toBe(canonical);
  });

  it('omits the query string when no options are given', () => {
    expect(gravatarUrl('person@example.com')).not.toContain('?');
  });

  it('appends the pixel size as ?s=', async () => {
    expect(gravatarUrl('person@example.com', { size: 256 })).toBe(
      `${BASE}${await expectedHash('person@example.com')}?s=256`,
    );
  });

  it('appends the default image as ?d=', async () => {
    expect(gravatarUrl('person@example.com', { defaultImage: 'identicon' })).toBe(
      `${BASE}${await expectedHash('person@example.com')}?d=identicon`,
    );
  });

  it('appends both size and default image', async () => {
    expect(gravatarUrl('person@example.com', { size: 128, defaultImage: 'mp' })).toBe(
      `${BASE}${await expectedHash('person@example.com')}?s=128&d=mp`,
    );
  });

  it('percent-encodes a default image URL', () => {
    const url = gravatarUrl('person@example.com', {
      defaultImage: 'https://example.com/fallback.png',
    });
    expect(url).toContain('d=https%3A%2F%2Fexample.com%2Ffallback.png');
  });

  it('is deterministic and total for a blank email', async () => {
    expect(gravatarUrl('   ')).toBe(`${BASE}${await expectedHash('')}`);
  });
});
