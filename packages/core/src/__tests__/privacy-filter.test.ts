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

describe('applyPublicPrivacyFilter() — section visibility (settings.publicVisibility)', () => {
  /** A profile with content in several sections, all fields opted into. */
  function visible(publicVisibility?: Record<string, boolean>): Takuhon {
    return profile({
      links: [{ id: 'site', type: 'website', url: 'https://example.com' }],
      careers: [
        { id: 'job', organization: { en: 'Acme' }, role: { en: 'Eng' }, startDate: '2020-01' },
      ],
      contact: { email: 'me@example.com', showEmail: true, formUrl: 'https://example.com/c' },
      meta: {
        contentLicense: { spdxId: 'CC0-1.0' },
        privacy: { hideCredentialIds: false, hideEducationGrades: false },
      },
      settings: { defaultLocale: 'en', availableLocales: ['en'], publicVisibility },
    });
  }

  it('empties an array section the owner marked false', () => {
    const out = applyPublicPrivacyFilter(visible({ careers: false }));
    expect(out.careers).toEqual([]);
    // Sibling sections are untouched.
    expect(out.links).toHaveLength(1);
    expect(out.certifications).toHaveLength(1);
  });

  it('empties the contact section (email + formUrl) when contact is false', () => {
    const out = applyPublicPrivacyFilter(visible({ contact: false }));
    expect(out.contact).toEqual({});
  });

  it('keeps a section that is explicitly true', () => {
    const out = applyPublicPrivacyFilter(visible({ careers: true }));
    expect(out.careers).toHaveLength(1);
  });

  it('treats an absent publicVisibility key as visible (default true)', () => {
    const out = applyPublicPrivacyFilter(visible({ links: false }));
    // careers has no key → stays visible.
    expect(out.careers).toHaveLength(1);
    expect(out.links).toEqual([]);
  });

  it('returns the original reference when hidden sections are already empty', () => {
    const input = profile({
      certifications: [],
      education: [],
      contact: { email: 'me@example.com', showEmail: true },
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        // careers is already [] in the base profile, so hiding it is a no-op.
        publicVisibility: { careers: false },
      },
    });
    expect(applyPublicPrivacyFilter(input)).toBe(input);
  });

  it('does not mutate the input when emptying sections', () => {
    const input = visible({ careers: false, contact: false });
    const snapshot = JSON.stringify(input);
    applyPublicPrivacyFilter(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('applyPublicPrivacyFilter() — section × field composition (AND)', () => {
  it('hiding a section short-circuits its field-level strip (certifications)', () => {
    // credentialId would normally be kept (hideCredentialIds: false), but the
    // whole certifications section is hidden, so it is emptied regardless.
    const out = applyPublicPrivacyFilter(
      profile({
        meta: {
          contentLicense: { spdxId: 'CC0-1.0' },
          privacy: { hideCredentialIds: false },
        },
        settings: {
          defaultLocale: 'en',
          availableLocales: ['en'],
          publicVisibility: { certifications: false },
        },
      }),
    );
    expect(out.certifications).toEqual([]);
  });

  it('keeps field-level controls within a visible section (email still hidden by showEmail)', () => {
    // contact section is visible (default), but showEmail is false → email is
    // still stripped by the field layer; formUrl survives.
    const out = applyPublicPrivacyFilter(
      profile({
        contact: { email: 'me@example.com', formUrl: 'https://example.com/c' },
      }),
    );
    expect(out.contact).not.toHaveProperty('email');
    expect(out.contact.formUrl).toBe('https://example.com/c');
  });

  it('applies grade strip only on a visible education section', () => {
    // education visible (default) + hideEducationGrades default true → grade stripped.
    const out = applyPublicPrivacyFilter(profile());
    expect(out.education[0]).not.toHaveProperty('grade');
    expect(out.education[0]?.institution).toEqual({ en: 'Uni' });
  });
});
