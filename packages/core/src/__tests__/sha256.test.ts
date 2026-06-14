import { describe, expect, it } from 'vitest';

import { sha256hex } from '../sha256.js';

/**
 * Reference digest from the platform's Web Crypto, used as an oracle for the
 * pure-JS implementation. Web Crypto is async and typed via the DOM lib, so core
 * stays free of Node type dependencies.
 */
async function oracle(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer-backed view so the argument is a `BufferSource`.
  const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('sha256hex', () => {
  it('matches the canonical FIPS 180-4 test vectors', () => {
    // Empty input.
    expect(sha256hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    // "abc".
    expect(sha256hex(utf8('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // The 448-bit (56-byte) message that fills a single padded block.
    expect(sha256hex(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    // A 112-byte message that spans two padded blocks.
    expect(
      sha256hex(
        utf8(
          'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
        ),
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
  });

  it('always returns 64 lowercase hex characters', () => {
    expect(sha256hex(utf8('takuhon'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the platform digest across every padding boundary', async () => {
    // Lengths around 55/56/63/64 exercise one-block vs two-block padding.
    for (let len = 0; len <= 130; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 31 + 7) & 0xff;
      expect(sha256hex(bytes)).toBe(await oracle(bytes));
    }
  });

  it('hashes multi-byte UTF-8 the same as the platform', async () => {
    for (const text of ['héllo', '日本語', '🚀 emoji', 'Über', 'ascii@example.com']) {
      const bytes = utf8(text);
      expect(sha256hex(bytes)).toBe(await oracle(bytes));
    }
  });
});
