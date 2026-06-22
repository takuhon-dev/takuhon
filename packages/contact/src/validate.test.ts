import { describe, expect, it } from 'vitest';

import type { ContactLocale, RawSubmission, ValidationError } from './types.js';
import {
  DEFAULT_MAX_MESSAGE_LENGTH,
  hasLineBreak,
  normalizeLocale,
  validateSubmission,
} from './validate.js';

describe('validateSubmission', () => {
  const good: RawSubmission = {
    email: 'visitor@example.com',
    message: 'Hello, I have a question.',
    locale: 'en',
  };

  it('accepts a well-formed submission and returns cleaned fields', () => {
    const result = validateSubmission({ ...good, pageUrl: ' https://me.tak3.jp/ ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('visitor@example.com');
      expect(result.value.message).toBe('Hello, I have a question.');
      expect(result.value.locale).toBe('en');
      expect(result.value.pageUrl).toBe('https://me.tak3.jp/');
    }
  });

  it('trims surrounding whitespace from email and message', () => {
    const result = validateSubmission({ email: '  a@b.co  ', message: '  hi  ', locale: 'ja' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('a@b.co');
      expect(result.value.message).toBe('hi');
    }
  });

  const emailCases: [string, RawSubmission, ValidationError][] = [
    ['missing', { message: 'x' }, 'email_missing'],
    ['empty after trim', { email: '   ', message: 'x' }, 'email_missing'],
    ['non-string', { email: 123, message: 'x' }, 'email_missing'],
    ['no domain', { email: 'foo', message: 'x' }, 'email_invalid'],
    ['no tld', { email: 'foo@bar', message: 'x' }, 'email_invalid'],
    ['internal space', { email: 'a b@c.co', message: 'x' }, 'email_invalid'],
    ['two addresses', { email: 'a@b.co, c@d.co', message: 'x' }, 'email_invalid'],
  ];
  for (const [label, payload, error] of emailCases) {
    it(`rejects email: ${label}`, () => {
      const result = validateSubmission(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    });
  }

  it('rejects CR/LF in the email (header-injection guard)', () => {
    const result = validateSubmission({ email: 'a@b.co\r\nBcc: victim@evil.com', message: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('email_invalid');
  });

  it('rejects an over-long email', () => {
    const result = validateSubmission({ email: `${'a'.repeat(300)}@b.co`, message: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('email_too_long');
  });

  const messageCases: [string, RawSubmission, ValidationError][] = [
    ['missing', { email: 'a@b.co' }, 'message_missing'],
    ['empty after trim', { email: 'a@b.co', message: '   ' }, 'message_missing'],
    ['non-string', { email: 'a@b.co', message: {} }, 'message_missing'],
  ];
  for (const [label, payload, error] of messageCases) {
    it(`rejects message: ${label}`, () => {
      const result = validateSubmission(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe(error);
    });
  }

  it('rejects an over-long message', () => {
    const result = validateSubmission({
      email: 'a@b.co',
      message: 'x'.repeat(DEFAULT_MAX_MESSAGE_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('message_too_long');
  });

  it('accepts a message at the exact limit and allows newlines in the body', () => {
    const result = validateSubmission({
      email: 'a@b.co',
      message: `line1\nline2\n${'x'.repeat(DEFAULT_MAX_MESSAGE_LENGTH - 12)}`,
    });
    expect(result.ok).toBe(true);
  });

  describe('honeypot', () => {
    it('flags a filled honeypot as spam', () => {
      const result = validateSubmission({ ...good, hp: 'i am a bot' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('honeypot');
        expect(result.spam).toBe(true);
      }
    });

    it('ignores an empty/whitespace honeypot', () => {
      expect(validateSubmission({ ...good, hp: '   ' }).ok).toBe(true);
    });
  });

  const localeCases: [unknown, ContactLocale][] = [
    ['en', 'en'],
    ['EN', 'en'],
    ['en-US', 'en'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['fr', 'ja'],
    ['', 'ja'],
    [undefined, 'ja'],
    [42, 'ja'],
  ];
  for (const [input, expected] of localeCases) {
    it(`normalizes locale ${String(input)} -> ${expected}`, () => {
      expect(normalizeLocale(input)).toBe(expected);
    });
  }

  it('hasLineBreak detects CR and LF', () => {
    expect(hasLineBreak('a\nb')).toBe(true);
    expect(hasLineBreak('a\rb')).toBe(true);
    expect(hasLineBreak('ab')).toBe(false);
  });
});
