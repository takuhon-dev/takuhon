import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { SUPPORTED_SCHEMA_VERSIONS, validate } from '../index.js';
import type { ValidationError, ValidationResult } from '../index.js';

type DeepWritable<T> = T extends object ? { -readonly [K in keyof T]: DeepWritable<T[K]> } : T;
type ExampleMutable = DeepWritable<typeof exampleJson>;

function cloneExample(): ExampleMutable {
  return JSON.parse(JSON.stringify(exampleJson)) as ExampleMutable;
}

function expectError(
  result: ValidationResult,
  match: (error: ValidationError) => boolean,
): ValidationError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected validate() to fail');
  const found = result.errors.find(match);
  expect(
    found,
    `no error matched\nactual errors: ${JSON.stringify(result.errors, null, 2)}`,
  ).toBeDefined();
  return found!;
}

describe('validate() positive cases', () => {
  it('accepts the bundled example profile', () => {
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.schemaVersion).toBe('1.4.0');
    }
  });

  it('accepts a project with a localized role (schema 1.4.0)', () => {
    const doc = cloneExample();
    doc.projects[0]!.role = { en: 'Author & maintainer', ja: '作者・メンテナ' };
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects a project role whose value is blank (LocalizedTitle \\S pattern)', () => {
    const doc = cloneExample();
    doc.projects[0]!.role!.en = '   ';
    expect(validate(doc).ok).toBe(false);
  });

  it('treats Career.endDate: null as valid (current position)', () => {
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const current = result.data.careers.find((c) => c.isCurrent === true);
      expect(current?.endDate).toBeNull();
    }
  });

  it('exposes the supported schema version window', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain('0.1.0');
  });
});

describe('validate() top-level guards', () => {
  it('rejects array input with keyword=type and pointer=""', () => {
    const result = validate([]);
    const err = expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
    expect(err.message).toMatch(/JSON object/);
  });

  it('rejects null with keyword=type', () => {
    const result = validate(null);
    expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
  });

  it('rejects a primitive with keyword=type', () => {
    const result = validate('hello');
    expectError(result, (e) => e.keyword === 'type' && e.pointer === '');
  });

  it('rejects schemaVersion outside the supported window', () => {
    const broken = { ...exampleJson, schemaVersion: '99.0.0' };
    const result = validate(broken);
    const err = expectError(
      result,
      (e) => e.keyword === 'schemaVersion' && e.pointer === '/schemaVersion',
    );
    expect(err.message).toMatch(/99\.0\.0/);
  });
});

describe('validate() schema-level failures', () => {
  it('flags missing schemaVersion via Ajv required', () => {
    const broken = cloneExample() as Partial<ExampleMutable>;
    delete broken.schemaVersion;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'required' && e.pointer === '/schemaVersion');
  });

  it('flags unknown root-level key (closed root)', () => {
    const broken = { ...exampleJson, extra: 'nope' };
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'additionalProperties' && e.pointer === '/extra');
  });

  it('flags unknown key on ContentLicense (closed)', () => {
    const broken = cloneExample();
    (broken.meta.contentLicense as Record<string, unknown>).unexpected = 'x';
    const result = validate(broken);
    expectError(
      result,
      (e) =>
        e.keyword === 'additionalProperties' && e.pointer === '/meta/contentLicense/unexpected',
    );
  });

  it('flags unknown key on a Link entry (closed)', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).hint = 'no';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/links/0/hint',
    );
  });

  it('rejects unknown LinkType values', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).type = 'not-a-real-type';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'enum' && e.pointer === '/links/0/type');
  });

  it('requires iconUrl on a custom-type link', () => {
    const broken = cloneExample();
    const customIdx = broken.links.findIndex((l) => l.type === 'custom');
    expect(customIdx).toBeGreaterThanOrEqual(0);
    const customLink = broken.links[customIdx];
    if (!customLink) throw new Error('expected example to contain a custom link');
    delete (customLink as { iconUrl?: string }).iconUrl;
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'required' && e.pointer === `/links/${customIdx}/iconUrl`,
    );
  });

  it('rejects malformed Career.startDate (YearMonth pattern)', () => {
    const broken = cloneExample();
    const firstCareer = broken.careers[0];
    if (!firstCareer) throw new Error('expected example to contain at least one career');
    firstCareer.startDate = '2023-13';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'pattern' && e.pointer === '/careers/0/startDate');
  });

  it('rejects a LocalizedTitle key that violates the BCP-47 locale pattern', () => {
    const broken = cloneExample();
    (broken.profile.displayName as Record<string, string>)._ = 'underscore-tag';
    const result = validate(broken);
    // Ajv reports propertyNames violations on the parent object's path.
    expectError(result, (e) => e.keyword === 'pattern' && e.pointer === '/profile/displayName');
  });

  it('rejects links arrays beyond maxItems', () => {
    const broken = cloneExample();
    const overflow = Array.from({ length: 101 }, (_, i) => ({
      id: `link-${i}`,
      type: 'website',
      url: 'https://example.com',
    }));
    (broken as { links: unknown }).links = overflow;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'maxItems' && e.pointer === '/links');
  });

  it('rejects Skill.label longer than 100 chars (maxLength)', () => {
    const broken = cloneExample();
    const firstSkill = broken.skills[0];
    if (!firstSkill) throw new Error('expected example to contain at least one skill');
    firstSkill.label = 'a'.repeat(101);
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'maxLength' && e.pointer === '/skills/0/label');
  });

  it('rejects empty availableLocales (minItems)', () => {
    const broken = cloneExample();
    broken.settings.availableLocales = [];
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'minItems' && e.pointer === '/settings/availableLocales',
    );
  });

  it('rejects duplicate locales in availableLocales (uniqueItems)', () => {
    const broken = cloneExample();
    broken.settings.availableLocales = ['en', 'en'];
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'uniqueItems' && e.pointer === '/settings/availableLocales',
    );
  });

  it('accepts settings.sectionOrder and settings.sectionLabels (schema 1.4.0)', () => {
    const doc = cloneExample();
    doc.settings.sectionOrder = ['about', 'projects', 'careers'];
    doc.settings.sectionLabels = { skills: { en: 'Toolbox', ja: '道具箱' } } as never;
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects an unknown settings.sectionOrder value (enum)', () => {
    const broken = cloneExample();
    broken.settings.sectionOrder = ['about', 'bogus'] as never;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'enum' && e.pointer === '/settings/sectionOrder/1');
  });

  it('rejects duplicate settings.sectionOrder values (uniqueItems)', () => {
    const broken = cloneExample();
    broken.settings.sectionOrder = ['about', 'about'] as never;
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'uniqueItems' && e.pointer === '/settings/sectionOrder',
    );
  });

  it('rejects an unknown settings.sectionLabels key (closed object)', () => {
    const broken = cloneExample();
    broken.settings.sectionLabels = { bogusKey: { en: 'X' } } as never;
    const result = validate(broken);
    expectError(
      result,
      (e) =>
        e.keyword === 'additionalProperties' && e.pointer === '/settings/sectionLabels/bogusKey',
    );
  });

  it('rejects negative Link.order (minimum)', () => {
    const broken = cloneExample();
    const firstLink = broken.links[0];
    if (!firstLink) throw new Error('expected example to contain at least one link');
    firstLink.order = -1;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'minimum' && e.pointer === '/links/0/order');
  });

  it('rejects malformed Iso3166Alpha2 country code (pattern)', () => {
    const broken = cloneExample();
    if (!broken.profile.location) {
      throw new Error('expected example to include profile.location');
    }
    broken.profile.location.country = 'xyz';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'pattern' && e.pointer === '/profile/location/country',
    );
  });
});

describe('validate() format failures (ajv-formats)', () => {
  it('rejects a malformed Contact.email', () => {
    const broken = cloneExample();
    broken.contact.email = 'not-an-email';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/contact/email');
  });

  it('rejects a relative Link.url against format: uri', () => {
    const broken = cloneExample();
    const firstLink = broken.links[0];
    if (!firstLink) throw new Error('expected example to contain at least one link');
    firstLink.url = '/relative-not-uri';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/links/0/url');
  });

  it('accepts a relative Avatar.url against format: uri-reference', () => {
    // The bundled example uses "/assets/avatar.webp"; ensure that stays valid.
    const result = validate(exampleJson);
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed Meta.createdAt (date-time format)', () => {
    const broken = cloneExample();
    broken.meta.createdAt = 'not-a-date';
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'format' && e.pointer === '/meta/createdAt');
  });
});

describe('validate() error envelope details', () => {
  it('reports allErrors when multiple invariants fail simultaneously', () => {
    const broken = { ...exampleJson, extra1: 1, extra2: 2 };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const extras = result.errors.filter((e) => e.keyword === 'additionalProperties');
      expect(extras.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes a schemaPointer for Ajv-sourced errors', () => {
    const broken = cloneExample();
    (broken.links[0] as unknown as Record<string, unknown>).type = 'not-a-real-type';
    const result = validate(broken);
    const err = expectError(result, (e) => e.keyword === 'enum');
    expect(err.schemaPointer).toMatch(/Link/);
  });

  it('escapes RFC 6901 reserved characters (~, /) when building pointers', () => {
    // Root has additionalProperties: false, so an unknown property at the root
    // produces an `additionalProperties` error whose pointer is built by
    // appending `/<escaped property name>`. `/` must escape to `~1` and `~`
    // must escape to `~0` per RFC 6901.
    const broken = { ...exampleJson, 'foo/bar': 1, 'tilde~name': 2 };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected validate() to fail');
    const slashErr = result.errors.find(
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/foo~1bar',
    );
    const tildeErr = result.errors.find(
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/tilde~0name',
    );
    expect(slashErr, `expected escaped pointer /foo~1bar`).toBeDefined();
    expect(tildeErr, `expected escaped pointer /tilde~0name`).toBeDefined();
  });
});

describe('validate() 0.2.0 additions', () => {
  it('coerces missing 0.2.0 arrays to [] on a validated document (Takuhon TS contract)', () => {
    // The 0.2.0 schema marks the nine new arrays as optional for 0.1.x
    // back-compat. The TypeScript `Takuhon` shape, in contrast, requires
    // them. validate() bridges the gap by coercing missing keys to [].
    const minimal = {
      schemaVersion: '0.2.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.certifications).toEqual([]);
    expect(result.data.memberships).toEqual([]);
    expect(result.data.volunteering).toEqual([]);
    expect(result.data.honors).toEqual([]);
    expect(result.data.education).toEqual([]);
    expect(result.data.publications).toEqual([]);
    expect(result.data.languages).toEqual([]);
    expect(result.data.courses).toEqual([]);
    expect(result.data.patents).toEqual([]);
  });

  it('rejects duplicate languages[].language values (Spec §6.16 uniqueness)', () => {
    const broken = cloneExample();
    (broken as unknown as { languages: unknown[] }).languages = [
      { id: 'ja-1', language: 'ja', proficiency: 'native' },
      { id: 'ja-2', language: 'ja', proficiency: 'fluent' },
    ];
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const dup = result.errors.find((e) => e.keyword === 'uniqueItems');
    expect(dup).toBeDefined();
    expect(dup?.pointer).toBe('/languages/1/language');
  });

  it('treats Accept-Language case as equivalent when checking uniqueness', () => {
    const broken = cloneExample();
    (broken as unknown as { languages: unknown[] }).languages = [
      { id: 'ja-1', language: 'ja', proficiency: 'native' },
      { id: 'ja-2', language: 'JA', proficiency: 'fluent' },
    ];
    const result = validate(broken);
    expect(result.ok).toBe(false);
  });

  it('accepts the meta.privacy block with explicit booleans', () => {
    const profile = cloneExample();
    (profile.meta as unknown as { privacy: unknown }).privacy = {
      hideCredentialIds: false,
      hideEducationGrades: true,
    };
    const result = validate(profile);
    expect(result.ok).toBe(true);
  });
});

describe('validate() 1.0.0 freeze contract', () => {
  it('rejects an undeclared key on a content entity (closed reversal — ①)', () => {
    // Pre-1.0 the content entities were open (additionalProperties: true).
    // 1.0.0 closes them, so a misspelled/undeclared key on e.g. a Career is a
    // validation error rather than silently dropped data.
    const broken = cloneExample();
    (broken.careers[0] as unknown as Record<string, unknown>).tittle = { en: 'typo' };
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/careers/0/tittle',
    );
  });

  it('rejects an undeclared key on the Profile object (closed reversal — ①)', () => {
    const broken = cloneExample();
    (broken.profile as unknown as Record<string, unknown>).pronouns = 'they/them';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/profile/pronouns',
    );
  });

  it('rejects a whitespace-only localized value (non-whitespace pattern — ②)', () => {
    const broken = cloneExample();
    (broken.profile as unknown as { displayName: Record<string, string> }).displayName = {
      en: '   ',
    };
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'pattern');
  });

  it('rejects a duplicate id within an array (id uniqueness invariant — ③)', () => {
    const broken = cloneExample();
    (broken as unknown as { links: unknown[] }).links = [
      { id: 'dup', type: 'website', url: 'https://a.example' },
      { id: 'dup', type: 'blog', url: 'https://b.example' },
    ];
    const result = validate(broken);
    const err = expectError(
      result,
      (e) => e.keyword === 'uniqueItems' && e.pointer === '/links/1/id',
    );
    expect(err.message).toContain('links');
  });

  it('accepts a document omitting links/careers/projects/skills and coerces them to [] (optional arrays — ⑤)', () => {
    const minimal = {
      schemaVersion: '1.0.0',
      profile: { displayName: { en: 'Test' } },
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([]);
    expect(result.data.careers).toEqual([]);
    expect(result.data.projects).toEqual([]);
    expect(result.data.skills).toEqual([]);
  });
});

describe('validate() 0.3.0 additions (testScores)', () => {
  it('accepts a 0.3.0 document carrying testScores', () => {
    const withScores = {
      schemaVersion: '0.3.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      testScores: [
        { id: 'gre', title: { en: 'GRE General Test' }, score: '332 / 340', date: '2024-01' },
      ],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(withScores);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.testScores).toHaveLength(1);
    expect(result.data.testScores[0]?.score).toBe('332 / 340');
  });

  it('coerces a missing testScores array to [] (Takuhon TS contract)', () => {
    const minimal = {
      schemaVersion: '0.3.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.testScores).toEqual([]);
  });

  it('rejects a testScore entry missing its required score field', () => {
    const broken = {
      schemaVersion: '0.3.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      testScores: [{ id: 'gre', title: { en: 'GRE' }, date: '2024-01' }],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missingScore = result.errors.find(
      (e) => e.keyword === 'required' && e.pointer === '/testScores/0/score',
    );
    expect(missingScore).toBeDefined();
  });
});

describe('validate() 0.4.0 additions (recommendations)', () => {
  it('accepts a 0.4.0 document carrying recommendations', () => {
    const withRecs = {
      schemaVersion: '0.4.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      recommendations: [
        {
          id: 'rec-1',
          body: { en: 'Great engineer.' },
          author: {
            name: 'Jordan Avery',
            headline: { en: 'Manager' },
            url: 'https://example.com/j',
          },
          relationship: { en: 'Managed directly' },
          date: '2023-09',
        },
      ],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(withRecs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendations).toHaveLength(1);
    expect(result.data.recommendations[0]?.author.name).toBe('Jordan Avery');
  });

  it('coerces a missing recommendations array to [] (Takuhon TS contract)', () => {
    const minimal = {
      schemaVersion: '0.4.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendations).toEqual([]);
  });

  it('rejects a recommendation whose author is missing its required name', () => {
    const broken = {
      schemaVersion: '0.4.0',
      profile: { displayName: { en: 'Test' } },
      links: [],
      careers: [],
      projects: [],
      skills: [],
      recommendations: [
        { id: 'rec-1', body: { en: 'Great.' }, author: { headline: { en: 'Manager' } } },
      ],
      contact: {},
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
      meta: { contentLicense: { spdxId: 'CC0-1.0' } },
    };
    const result = validate(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missingName = result.errors.find(
      (e) => e.keyword === 'required' && e.pointer === '/recommendations/0/author/name',
    );
    expect(missingName).toBeDefined();
  });
});

describe('validate() 0.5.0 additions (settings.activity)', () => {
  const base = {
    schemaVersion: '0.5.0',
    profile: { displayName: { en: 'Test' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  };

  it('accepts a document carrying a full settings.activity block', () => {
    const result = validate({
      ...base,
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        activity: {
          enabled: true,
          github: { username: 'octocat', showLanguages: true, showContributions: true },
          wakatime: { username: 'octocat', showCodingTime: true },
          showRank: true,
          refreshHintHours: 24,
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings.activity?.github?.username).toBe('octocat');
  });

  it('accepts a document with no settings.activity (the field is optional)', () => {
    const result = validate({
      ...base,
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings.activity).toBeUndefined();
  });

  it('rejects a github activity entry missing its required username', () => {
    const result = validate({
      ...base,
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        activity: { enabled: true, github: { showLanguages: true } },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missing = result.errors.find(
      (e) => e.keyword === 'required' && e.pointer === '/settings/activity/github/username',
    );
    expect(missing).toBeDefined();
  });
});

describe('validate() 0.6.0 additions (settings.publicVisibility)', () => {
  const base = {
    schemaVersion: '0.6.0',
    profile: { displayName: { en: 'Test' } },
    links: [],
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  };

  it('accepts a document carrying a settings.publicVisibility block', () => {
    const result = validate({
      ...base,
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        publicVisibility: { careers: true, education: false, contact: false },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings.publicVisibility?.education).toBe(false);
  });

  it('accepts a document with no settings.publicVisibility (the field is optional)', () => {
    const result = validate({
      ...base,
      settings: { defaultLocale: 'en', availableLocales: ['en'] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.settings.publicVisibility).toBeUndefined();
  });

  it('rejects an unknown publicVisibility section key (additionalProperties: false)', () => {
    const result = validate({
      ...base,
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        publicVisibility: { profile: false },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const extra = result.errors.find(
      (e) =>
        e.keyword === 'additionalProperties' && e.pointer.startsWith('/settings/publicVisibility'),
    );
    expect(extra).toBeDefined();
  });

  it('rejects a non-boolean publicVisibility value', () => {
    const result = validate({
      ...base,
      settings: {
        defaultLocale: 'en',
        availableLocales: ['en'],
        publicVisibility: { careers: 'yes' },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const wrongType = result.errors.find(
      (e) => e.keyword === 'type' && e.pointer === '/settings/publicVisibility/careers',
    );
    expect(wrongType).toBeDefined();
  });
});

describe('validate() 0.7.0 additions (per-item visibility)', () => {
  const base = {
    schemaVersion: '0.7.0',
    profile: { displayName: { en: 'Test' } },
    careers: [],
    projects: [],
    skills: [],
    contact: {},
    settings: { defaultLocale: 'en', availableLocales: ['en'] },
    meta: { contentLicense: { spdxId: 'CC0-1.0' } },
  };

  it("accepts items carrying visibility: 'public' | 'private'", () => {
    const result = validate({
      ...base,
      links: [
        { id: 'a', type: 'website', url: 'https://a.example', visibility: 'private' },
        { id: 'b', type: 'website', url: 'https://b.example', visibility: 'public' },
      ],
      projects: [{ id: 'p', title: { en: 'P' }, visibility: 'private' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0]?.visibility).toBe('private');
    expect(result.data.projects[0]?.visibility).toBe('private');
  });

  it('accepts items with no visibility (the field is optional)', () => {
    const result = validate({
      ...base,
      links: [{ id: 'a', type: 'website', url: 'https://a.example' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0]?.visibility).toBeUndefined();
  });

  it('rejects an out-of-enum visibility value', () => {
    const result = validate({
      ...base,
      links: [{ id: 'a', type: 'website', url: 'https://a.example', visibility: 'draft' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const badEnum = result.errors.find(
      (e) => e.keyword === 'enum' && e.pointer === '/links/0/visibility',
    );
    expect(badEnum).toBeDefined();
  });
});

describe('settings.contact (1.1.0)', () => {
  it('accepts a settings.contact block', () => {
    const doc = cloneExample();
    (doc.settings as Record<string, unknown>).contact = {
      enabled: true,
      turnstileSiteKey: '0xAAAAExampleSiteKey',
      subjectPrefix: '[example contact]',
    };
    expect(validate(doc).ok).toBe(true);
  });

  it('accepts an absent settings.contact (optional, backwards-compatible)', () => {
    const doc = cloneExample();
    delete (doc.settings as Record<string, unknown>).contact;
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects an unknown key inside settings.contact (closed object)', () => {
    const doc = cloneExample();
    (doc.settings as Record<string, unknown>).contact = {
      enabled: true,
      recipient: 'x@example.com',
    };
    const result = validate(doc);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/settings/contact/recipient',
    );
  });
});

describe('highlights (1.4.0)', () => {
  it('accepts a valid highlight and settings.highlightsIntro (the bundled example)', () => {
    const doc = cloneExample();
    expect(doc.highlights.length).toBeGreaterThan(0);
    expect(doc.settings.highlightsIntro).toBeDefined();
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects a highlight missing a required field (title)', () => {
    const broken = cloneExample();
    delete (broken.highlights[0] as unknown as Record<string, unknown>).title;
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'required' && e.pointer === '/highlights/0/title');
  });

  it('rejects a highlight with a YYYY-MM postedAt (full date required)', () => {
    const broken = cloneExample();
    broken.highlights[0]!.postedAt = '2025-12';
    const result = validate(broken);
    expectError(result, (e) => e.pointer === '/highlights/0/postedAt');
  });

  it('rejects an impossible postedAt date (ajv format:date)', () => {
    const broken = cloneExample();
    broken.highlights[0]!.postedAt = '2025-02-30';
    const result = validate(broken);
    expectError(result, (e) => e.pointer === '/highlights/0/postedAt');
  });

  it('rejects an unknown property on a highlight (closed object)', () => {
    const broken = cloneExample();
    (broken.highlights[0] as unknown as Record<string, unknown>).bogus = 'x';
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'additionalProperties' && e.pointer === '/highlights/0/bogus',
    );
  });

  it('rejects duplicate highlight ids (post-Ajv id-uniqueness)', () => {
    const broken = cloneExample();
    const dupe = JSON.parse(JSON.stringify(broken.highlights[0])) as (typeof broken.highlights)[0];
    broken.highlights.push(dupe);
    const result = validate(broken);
    expectError(result, (e) => e.keyword === 'uniqueItems' && e.pointer.startsWith('/highlights/'));
  });
});

describe('Skill.label localization (1.4.0 — anyOf[string, LocalizedTitle])', () => {
  it('accepts a plain-string label (backward compatible)', () => {
    const doc = cloneExample();
    doc.skills[0]!.label = 'Rust';
    expect(validate(doc).ok).toBe(true);
  });

  it('accepts a localized-map label', () => {
    const doc = cloneExample();
    doc.skills[0]!.label = { en: 'Design tokens', ja: 'デザイントークン' };
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects a blank localized label value (LocalizedTitle \\S pattern)', () => {
    const doc = cloneExample();
    doc.skills[0]!.label = { en: '   ' } as never;
    expect(validate(doc).ok).toBe(false);
  });

  it('rejects a label that is neither a string nor a localized map', () => {
    const doc = cloneExample();
    doc.skills[0]!.label = 42 as never;
    const result = validate(doc);
    expectError(result, (e) => e.pointer === '/skills/0/label');
  });
});

describe('Volunteering.secondaryLink (1.4.0)', () => {
  it('accepts a secondary link with a url and localized label (the bundled example)', () => {
    const doc = cloneExample();
    expect(doc.volunteering[0]!.secondaryLink).toBeDefined();
    expect(validate(doc).ok).toBe(true);
  });

  it('accepts a secondary link with only a url (label optional)', () => {
    const doc = cloneExample();
    doc.volunteering[0]!.secondaryLink = { url: 'https://github.com/example' } as never;
    expect(validate(doc).ok).toBe(true);
  });

  it('rejects a secondary link missing its required url', () => {
    const broken = cloneExample();
    delete (broken.volunteering[0]!.secondaryLink as unknown as Record<string, unknown>).url;
    const result = validate(broken);
    expectError(
      result,
      (e) => e.keyword === 'required' && e.pointer === '/volunteering/0/secondaryLink/url',
    );
  });

  it('rejects an unknown property on a secondary link (closed object)', () => {
    const broken = cloneExample();
    (broken.volunteering[0]!.secondaryLink as unknown as Record<string, unknown>).bogus = 'x';
    const result = validate(broken);
    expectError(
      result,
      (e) =>
        e.keyword === 'additionalProperties' && e.pointer === '/volunteering/0/secondaryLink/bogus',
    );
  });
});
