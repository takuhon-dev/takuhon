import { describe, expect, it } from 'vitest';

import { applyPublicPrivacyFilter } from '../index.js';
import type { Takuhon } from '../index.js';

/** Build a profile carrying every privacy-sensitive field. */
function profile(overrides: Partial<Takuhon> = {}): Takuhon {
  return {
    schemaVersion: '0.4.0',
    profile: { displayName: { en: 'Test' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    certifications: [
      {
        id: 'cert',
        title: { en: 'Cert' },
        issuingOrganization: { en: 'Org' },
        issueDate: '2024-01',
        credentialId: 'SECRET-123',
      },
    ],
    memberships: [],
    volunteering: [],
    honors: [],
    education: [{ id: 'edu', institution: { en: 'Uni' }, startDate: '2018-04', grade: 'A+' }],
    publications: [],
    languages: [],
    courses: [],
    patents: [{ id: 'pat', title: { en: 'Widget' }, patentNumber: 'US-123', status: 'granted' }],
    testScores: [],
    recommendations: [],
    contact: { email: 'me@example.com' },
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    ...overrides,
  } as unknown as Takuhon;
}

describe('applyPublicPrivacyFilter()', () => {
  it('hides credentialId, education grade, and email by default', () => {
    const out = applyPublicPrivacyFilter(profile());
    expect(out.certifications[0]).not.toHaveProperty('credentialId');
    expect(out.education[0]).not.toHaveProperty('grade');
    expect(out.contact).not.toHaveProperty('email');
  });

  it('keeps fields when the operator opts into disclosure', () => {
    const out = applyPublicPrivacyFilter(
      profile({
        contact: { email: 'me@example.com', showEmail: true },
        meta: {
          contentLicense: { spdxId: 'CC0-1.0' },
          privacy: { hideCredentialIds: false, hideEducationGrades: false },
        },
      }),
    );
    expect(out.certifications[0]?.credentialId).toBe('SECRET-123');
    expect(out.education[0]?.grade).toBe('A+');
    expect(out.contact.email).toBe('me@example.com');
  });

  it('never strips patentNumber (public record)', () => {
    const out = applyPublicPrivacyFilter(profile());
    expect(out.patents[0]?.patentNumber).toBe('US-123');
  });

  it('returns the original reference when nothing needs stripping', () => {
    const input = profile({
      certifications: [],
      education: [],
      contact: { email: 'me@example.com', showEmail: true },
    });
    expect(applyPublicPrivacyFilter(input)).toBe(input);
  });

  it('does not mutate the input', () => {
    const input = profile();
    const snapshot = JSON.stringify(input);
    applyPublicPrivacyFilter(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
