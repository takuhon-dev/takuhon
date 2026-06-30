import { describe, expect, it } from 'vitest';

import { resolveConfig, resolveWidgetConfig } from './config.js';
import { t } from './i18n.js';
import { buildSubmission, messageKeyForError, type SubmissionState } from './protocol.js';

describe('i18n', () => {
  it('returns localized strings for ja and en', () => {
    expect(t('ja', 'send')).toBe('送信');
    expect(t('en', 'send')).toBe('Send');
  });

  it('has every key populated in both locales', () => {
    const keys = ['greeting', 'askEmail', 'askMessage', 'confirm', 'done', 'errorGeneric'] as const;
    for (const key of keys) {
      expect(t('ja', key).length).toBeGreaterThan(0);
      expect(t('en', key).length).toBeGreaterThan(0);
    }
  });
});

describe('resolveConfig', () => {
  it('defaults the endpoint to /api/contact', () => {
    expect(resolveConfig({ siteKey: 'k' }).endpoint).toBe('/api/contact');
    expect(resolveConfig({ siteKey: 'k', endpoint: '  ' }).endpoint).toBe('/api/contact');
  });

  it('keeps an explicit endpoint (trimmed)', () => {
    expect(resolveConfig({ siteKey: 'k', endpoint: ' /contact ' }).endpoint).toBe('/contact');
  });

  it('resolves locale from explicit value, then lang, defaulting to ja', () => {
    expect(resolveConfig({ siteKey: 'k', locale: 'en' }).locale).toBe('en');
    expect(resolveConfig({ siteKey: 'k', lang: 'en-US' }).locale).toBe('en');
    expect(resolveConfig({ siteKey: 'k', lang: 'fr' }).locale).toBe('ja');
    expect(resolveConfig({ siteKey: 'k' }).locale).toBe('ja');
  });

  it('omits pageUrl when not provided', () => {
    expect(resolveConfig({ siteKey: 'k' }).pageUrl).toBeUndefined();
    expect(resolveConfig({ siteKey: 'k', pageUrl: 'https://x/' }).pageUrl).toBe('https://x/');
  });
});

describe('resolveWidgetConfig (auto-mount source resolution)', () => {
  it('prefers the global config when it carries a site key', () => {
    const config = resolveWidgetConfig(
      { siteKey: 'global-key', endpoint: '/g' },
      { siteKey: 'ds' },
    );
    expect(config).toEqual({ siteKey: 'global-key', endpoint: '/g' });
  });

  it('falls back to data-* attributes when the global has no site key', () => {
    const config = resolveWidgetConfig(undefined, {
      siteKey: 'ds-key',
      endpoint: '/api/contact',
      locale: 'en',
      lang: 'en-US',
      pageUrl: 'https://x/',
    });
    expect(config).toEqual({
      siteKey: 'ds-key',
      endpoint: '/api/contact',
      locale: 'en',
      lang: 'en-US',
      pageUrl: 'https://x/',
    });
  });

  it('reads only the site key from data-* when the optional attributes are absent', () => {
    expect(resolveWidgetConfig(undefined, { siteKey: 'ds-key' })).toEqual({ siteKey: 'ds-key' });
  });

  it('returns undefined when neither source names a site key', () => {
    expect(resolveWidgetConfig(undefined, undefined)).toBeUndefined();
    expect(resolveWidgetConfig(undefined, {})).toBeUndefined();
    expect(resolveWidgetConfig({ siteKey: '' }, {})).toBeUndefined();
  });
});

describe('buildSubmission', () => {
  const base: SubmissionState = {
    email: 'a@b.co',
    message: 'hi',
    token: 'tok',
    honeypot: '',
    locale: 'ja',
  };

  it('produces the POST body with the honeypot field', () => {
    expect(buildSubmission(base)).toEqual({
      email: 'a@b.co',
      message: 'hi',
      locale: 'ja',
      token: 'tok',
      hp: '',
    });
  });

  it('includes pageUrl only when present', () => {
    expect(buildSubmission({ ...base, pageUrl: 'https://x/' })).toMatchObject({
      pageUrl: 'https://x/',
    });
    expect('pageUrl' in buildSubmission(base)).toBe(false);
  });
});

describe('messageKeyForError', () => {
  it('maps email errors to errorEmail', () => {
    expect(messageKeyForError('email_invalid')).toBe('errorEmail');
    expect(messageKeyForError('email_missing')).toBe('errorEmail');
    expect(messageKeyForError('email_too_long')).toBe('errorEmail');
  });

  it('maps challenge_failed to errorChallenge', () => {
    expect(messageKeyForError('challenge_failed')).toBe('errorChallenge');
  });

  it('falls back to errorGeneric', () => {
    expect(messageKeyForError('send_failed')).toBe('errorGeneric');
    expect(messageKeyForError(undefined)).toBe('errorGeneric');
  });
});
