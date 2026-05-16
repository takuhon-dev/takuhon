import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../examples/personal-profile/ownport.json' with { type: 'json' };
import {
  generateJsonLd,
  generatePersonJsonLd,
  generateProfilePageJsonLd,
  normalize,
  resolveLocale,
} from '../index.js';
import type { LocalizedMeport, Ownport } from '../index.js';

function cloneExample(): Ownport {
  return JSON.parse(JSON.stringify(exampleJson)) as Ownport;
}

function prepare(locale?: string): LocalizedMeport {
  return resolveLocale(normalize(cloneExample()), locale);
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function getProfilePage(data: LocalizedMeport): Record<string, unknown> {
  return asRecord(generateProfilePageJsonLd(data));
}

function getPerson(data: LocalizedMeport): Record<string, unknown> {
  return asRecord(getProfilePage(data).mainEntity as object);
}

describe('generateJsonLd() — root shape', () => {
  it('returns a single-element array containing the ProfilePage', () => {
    const out = generateJsonLd(prepare('en'));
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
    const profilePage = asRecord(out[0]!);
    expect(profilePage['@type']).toBe('ProfilePage');
  });

  it('inlines the Person as ProfilePage.mainEntity', () => {
    const out = generateJsonLd(prepare('en'));
    const profilePage = asRecord(out[0]!);
    const mainEntity = asRecord(profilePage.mainEntity as object);
    expect(mainEntity['@type']).toBe('Person');
  });
});

describe('generateProfilePageJsonLd() — required and optional fields', () => {
  it('emits @context, @type, and inLanguage derived from resolvedLocale', () => {
    const data = prepare('ja');
    const out = getProfilePage(data);
    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('ProfilePage');
    expect(out.inLanguage).toBe('ja');
    expect(out.inLanguage).toBe(data.resolvedLocale);
  });

  it('emits url and Person.@id from the featured website link', () => {
    const out = getProfilePage(prepare('en'));
    const person = asRecord(out.mainEntity as object);
    expect(out.url).toBe('https://example.com/pat');
    expect(person['@id']).toBe('https://example.com/pat#person');
    expect(person.url).toBe('https://example.com/pat');
  });

  it('omits url, Person.@id, and Person.url when no featured website link exists', () => {
    const data = prepare('en');
    data.links = data.links.filter((l) => !(l.type === 'website' && l.featured === true));
    const out = getProfilePage(data);
    const person = asRecord(out.mainEntity as object);
    expect(out.url).toBeUndefined();
    expect(person['@id']).toBeUndefined();
    expect(person.url).toBeUndefined();
  });

  it('emits dateCreated and dateModified from meta', () => {
    const out = getProfilePage(prepare('en'));
    expect(out.dateCreated).toBe('2026-01-15T09:00:00Z');
    expect(out.dateModified).toBe('2026-05-12T08:30:00Z');
  });

  it('omits dateCreated when meta.createdAt is absent', () => {
    const data = prepare('en');
    delete data.meta.createdAt;
    const out = getProfilePage(data);
    expect(out.dateCreated).toBeUndefined();
  });

  it('omits dateModified when meta.updatedAt is absent', () => {
    const data = prepare('en');
    delete data.meta.updatedAt;
    const out = getProfilePage(data);
    expect(out.dateModified).toBeUndefined();
  });

  it('emits primaryImageOfPage equal to Person.image.url', () => {
    const out = getProfilePage(prepare('en'));
    const person = asRecord(out.mainEntity as object);
    const image = asRecord(person.image as object);
    expect(out.primaryImageOfPage).toBe('/assets/avatar.webp');
    expect(out.primaryImageOfPage).toBe(image.url);
  });

  it('omits primaryImageOfPage when profile.avatar is absent', () => {
    const data = prepare('en');
    delete data.profile.avatar;
    const out = getProfilePage(data);
    expect(out.primaryImageOfPage).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — basic fields', () => {
  it('emits @context so the returned object is a standalone JSON-LD document', () => {
    const out = asRecord(generatePersonJsonLd(prepare('en')));
    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('Person');
  });

  it('emits name from profile.displayName', () => {
    const out = asRecord(generatePersonJsonLd(prepare('en')));
    expect(out.name).toBe('Pat Rivera');
  });

  it('emits description from profile.bio only — tagline is not surfaced', () => {
    const out = asRecord(generatePersonJsonLd(prepare('en')));
    const bio = exampleJson.profile.bio.en;
    expect(out.description).toBe(bio);
    expect(out.description).not.toContain('Open-source maintainer');
  });

  it('omits description when bio is absent', () => {
    const data = prepare('en');
    delete data.profile.bio;
    const out = asRecord(generatePersonJsonLd(data));
    expect(out.description).toBeUndefined();
  });

  it('emits image as an ImageObject with url and caption', () => {
    const out = asRecord(generatePersonJsonLd(prepare('en')));
    const image = asRecord(out.image as object);
    expect(image['@type']).toBe('ImageObject');
    expect(image.url).toBe('/assets/avatar.webp');
    expect(image.caption).toBe(exampleJson.profile.avatar.alt.en);
  });

  it('omits image.caption when avatar.alt is absent', () => {
    const data = prepare('en');
    if (data.profile.avatar) delete data.profile.avatar.alt;
    const out = asRecord(generatePersonJsonLd(data));
    const image = asRecord(out.image as object);
    expect(image.caption).toBeUndefined();
    expect(image.url).toBeDefined();
  });

  it('omits image entirely when avatar is absent', () => {
    const data = prepare('en');
    delete data.profile.avatar;
    const out = asRecord(generatePersonJsonLd(data));
    expect(out.image).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — address mapping', () => {
  it('emits PostalAddress with country, region, and locality', () => {
    const person = getPerson(prepare('ja'));
    const address = asRecord(person.address as object);
    expect(address['@type']).toBe('PostalAddress');
    expect(address.addressCountry).toBe('PT');
    expect(address.addressRegion).toBe('Lisbon');
    expect(address.addressLocality).toBe('リスボン');
  });

  it('does not surface profile.location.display in the address', () => {
    const person = getPerson(prepare('ja'));
    const address = asRecord(person.address as object);
    expect(JSON.stringify(address)).not.toContain('ポルトガル');
    expect(Object.keys(address)).not.toContain('display');
  });

  it('emits a partial PostalAddress when only some fields are present', () => {
    const data = prepare('en');
    if (data.profile.location) data.profile.location = { country: 'JP' };
    const person = getPerson(data);
    const address = asRecord(person.address as object);
    expect(address.addressCountry).toBe('JP');
    expect(address.addressRegion).toBeUndefined();
    expect(address.addressLocality).toBeUndefined();
  });

  it('omits address entirely when location has no structured fields', () => {
    const data = prepare('en');
    delete data.profile.location;
    const person = getPerson(data);
    expect(person.address).toBeUndefined();
  });

  it('omits address when location exists but has only display (UI-only)', () => {
    const data = prepare('en');
    if (data.profile.location) data.profile.location = { display: 'somewhere' };
    const person = getPerson(data);
    expect(person.address).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — careers partition', () => {
  it('emits jobTitle and worksFor from the current career', () => {
    const person = getPerson(prepare('en'));
    expect(person.jobTitle).toBe('Principal Accessibility Engineer');
    const worksFor = asRecord(person.worksFor as object);
    expect(worksFor['@type']).toBe('Organization');
    expect(worksFor.name).toBe('Stellar UX Studio');
    expect(worksFor.url).toBe('https://example.com/stellar');
  });

  it('treats isCurrent: false or undefined as past (strict === true)', () => {
    const data = prepare('en');
    for (const c of data.careers) {
      if (c.id === 'stellar-ux') c.isCurrent = false;
    }
    const person = getPerson(data);
    expect(person.jobTitle).toBeUndefined();
    expect(person.worksFor).toBeUndefined();
    const subjectOf = person.subjectOf as object[];
    expect(subjectOf.some((s) => asRecord(s).name === 'Principal Accessibility Engineer')).toBe(
      true,
    );
  });

  it('emits past careers as WorkRole entries inside subjectOf', () => {
    const person = getPerson(prepare('en'));
    const subjectOf = person.subjectOf as object[];
    const harbor = subjectOf.find((s) => asRecord(s).name === 'Senior Frontend Engineer');
    expect(harbor).toBeDefined();
    const role = asRecord(harbor!);
    expect(role['@type']).toBe('WorkRole');
    const memberOf = asRecord(role.memberOf as object);
    expect(memberOf['@type']).toBe('Organization');
    expect(memberOf.name).toBe('Harbor Labs');
    expect(role.startDate).toBe('2019-06');
    expect(role.endDate).toBe('2023-03');
  });

  it('omits jobTitle and worksFor when there is no current career', () => {
    const data = prepare('en');
    for (const c of data.careers) c.isCurrent = false;
    const person = getPerson(data);
    expect(person.jobTitle).toBeUndefined();
    expect(person.worksFor).toBeUndefined();
  });

  it('uses the first current career when multiple are flagged (normalize order)', () => {
    const data = prepare('en');
    // Mark the second career as also current to test stable selection.
    for (const c of data.careers) c.isCurrent = true;
    const person = getPerson(data);
    expect(person.jobTitle).toBe('Principal Accessibility Engineer');
  });

  it('omits WorkRole.endDate when source endDate is null', () => {
    const data = prepare('en');
    // The fixture's "stellar-ux" has endDate: null and isCurrent: true.
    // Flip it to past while keeping endDate: null to exercise the omit path.
    for (const c of data.careers) {
      if (c.id === 'stellar-ux') c.isCurrent = false;
    }
    const person = getPerson(data);
    const subjectOf = person.subjectOf as object[];
    const stellar = asRecord(
      subjectOf.find((s) => asRecord(s).name === 'Principal Accessibility Engineer')!,
    );
    expect(stellar.endDate).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — projects mapping', () => {
  it('maps projects to CreativeWork entries inside subjectOf', () => {
    const person = getPerson(prepare('en'));
    const subjectOf = person.subjectOf as object[];
    const axe = subjectOf.find((s) => asRecord(s).name === 'axe-helpers');
    expect(axe).toBeDefined();
    const work = asRecord(axe!);
    expect(work['@type']).toBe('CreativeWork');
    expect(work.url).toBe('https://example.com/axe-helpers');
    expect(work.datePublished).toBe('2023-09');
    expect(work.about).toEqual(['accessibility', 'testing', 'typescript']);
  });

  it('omits optional CreativeWork keys for a minimal project entry', () => {
    const person = getPerson(prepare('en'));
    const subjectOf = person.subjectOf as object[];
    const meetup = subjectOf.find((s) => asRecord(s).name === 'Local meetup talks');
    expect(meetup).toBeDefined();
    const work = asRecord(meetup!);
    expect(work.url).toBeUndefined();
    expect(work.datePublished).toBeUndefined();
    expect(work.about).toBeUndefined();
  });

  it('places WorkRoles before CreativeWorks in subjectOf', () => {
    const person = getPerson(prepare('en'));
    const subjectOf = person.subjectOf as object[];
    const types = subjectOf.map((s) => asRecord(s)['@type'] as string);
    const firstWorkRole = types.indexOf('WorkRole');
    const firstCreativeWork = types.indexOf('CreativeWork');
    expect(firstWorkRole).toBeGreaterThanOrEqual(0);
    expect(firstCreativeWork).toBeGreaterThanOrEqual(0);
    expect(firstWorkRole).toBeLessThan(firstCreativeWork);
  });

  it('omits subjectOf entirely when there are no past careers and no projects', () => {
    const data = prepare('en');
    data.careers = data.careers.filter((c) => c.isCurrent === true);
    data.projects = [];
    const person = getPerson(data);
    expect(person.subjectOf).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — sameAs filter', () => {
  it('includes identity-bearing link types and excludes custom / email / rss', () => {
    const person = getPerson(prepare('en'));
    const sameAs = person.sameAs as string[];
    expect(sameAs).toContain('https://github.com/example-pat');
    expect(sameAs).toContain('https://example.social/@pat');
    expect(sameAs).toContain('https://example.com/pat'); // website
    expect(sameAs).toContain('https://example.com/pat/blog'); // blog
    expect(sameAs).not.toContain('https://example.com/pat/newsletter'); // custom
  });

  it('preserves link order from normalize() (order asc)', () => {
    const person = getPerson(prepare('en'));
    const sameAs = person.sameAs as string[];
    expect(sameAs.indexOf('https://example.com/pat')).toBeLessThan(
      sameAs.indexOf('https://github.com/example-pat'),
    );
    expect(sameAs.indexOf('https://github.com/example-pat')).toBeLessThan(
      sameAs.indexOf('https://example.social/@pat'),
    );
  });

  it('omits sameAs entirely when no identity-bearing link exists', () => {
    const data = prepare('en');
    data.links = data.links.filter((l) => l.type === 'custom');
    const person = getPerson(data);
    expect(person.sameAs).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — knowsAbout', () => {
  it('maps skills[].label to a knowsAbout string array', () => {
    const person = getPerson(prepare('en'));
    expect(person.knowsAbout).toEqual([
      'TypeScript',
      'React',
      'WCAG 2.2',
      'ARIA',
      'Storybook',
      'Playwright',
      'Design tokens',
      'Portuguese (B2)',
    ]);
  });

  it('does not surface skill.category in the output', () => {
    const person = getPerson(prepare('en'));
    expect(JSON.stringify(person.knowsAbout)).not.toContain('programming');
    expect(JSON.stringify(person.knowsAbout)).not.toContain('design');
  });

  it('omits knowsAbout entirely when skills is empty', () => {
    const data = prepare('en');
    data.skills = [];
    const person = getPerson(data);
    expect(person.knowsAbout).toBeUndefined();
  });
});

describe('generatePersonJsonLd() — email (showEmail gate)', () => {
  it('omits email when contact.showEmail is false (fixture default)', () => {
    const person = getPerson(prepare('en'));
    expect(person.email).toBeUndefined();
  });

  it('emits email when contact.showEmail === true and email is set', () => {
    const data = prepare('en');
    data.contact = { ...data.contact, showEmail: true, email: 'pat@example.com' };
    const person = getPerson(data);
    expect(person.email).toBe('pat@example.com');
  });

  it('omits email when contact.showEmail is undefined', () => {
    const data = prepare('en');
    data.contact = { email: 'pat@example.com' };
    const person = getPerson(data);
    expect(person.email).toBeUndefined();
  });

  it('omits email when contact.email is empty string', () => {
    const data = prepare('en');
    data.contact = { ...data.contact, showEmail: true, email: '' };
    const person = getPerson(data);
    expect(person.email).toBeUndefined();
  });
});

describe('locale variance', () => {
  it('outputs ja content when prepared with locale "ja"', () => {
    const person = getPerson(prepare('ja'));
    expect(person.name).toBe('パット・リベラ');
    const worksFor = asRecord(person.worksFor as object);
    expect(worksFor.name).toBe('ステラ UX スタジオ');
  });

  it('outputs en content when prepared with locale "en"', () => {
    const person = getPerson(prepare('en'));
    expect(person.name).toBe('Pat Rivera');
    const worksFor = asRecord(person.worksFor as object);
    expect(worksFor.name).toBe('Stellar UX Studio');
  });

  it('emits ProfilePage.inLanguage equal to resolvedLocale', () => {
    const data = prepare('ja');
    const out = getProfilePage(data);
    expect(out.inLanguage).toBe(data.resolvedLocale);
  });
});

describe('determinism and invariants', () => {
  it('produces the same JSON.stringify output for the same input', () => {
    const data = prepare('en');
    const a = JSON.stringify(generateJsonLd(data));
    const b = JSON.stringify(generateJsonLd(data));
    expect(a).toBe(b);
  });

  it('does not mutate the input LocalizedMeport', () => {
    const data = prepare('en');
    const snapshot = JSON.stringify(data);
    generateJsonLd(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('emits ProfilePage keys in the spec-defined order', () => {
    const out = getProfilePage(prepare('en'));
    expect(Object.keys(out)).toEqual([
      '@context',
      '@type',
      'url',
      'inLanguage',
      'dateCreated',
      'dateModified',
      'primaryImageOfPage',
      'mainEntity',
    ]);
  });

  it('emits Person keys in the spec-defined order', () => {
    const person = getPerson(prepare('en'));
    expect(Object.keys(person)).toEqual([
      '@type',
      '@id',
      'name',
      'description',
      'image',
      'url',
      'jobTitle',
      'worksFor',
      'address',
      'knowsAbout',
      'sameAs',
      'subjectOf',
    ]);
  });
});

describe('empty-fields omission policy', () => {
  it('produces a minimal but well-formed ProfilePage from a near-empty document', () => {
    const minimal = cloneExample();
    minimal.profile = { displayName: { en: 'Minimal' } };
    minimal.links = [];
    minimal.careers = [];
    minimal.projects = [];
    minimal.skills = [];
    minimal.contact = {};
    minimal.meta = { contentLicense: { spdxId: 'CC0-1.0' } };
    const data = resolveLocale(normalize(minimal), 'en');
    const out = getProfilePage(data);
    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('ProfilePage');
    expect(out.url).toBeUndefined();
    expect(out.dateCreated).toBeUndefined();
    expect(out.dateModified).toBeUndefined();
    expect(out.primaryImageOfPage).toBeUndefined();
    const person = asRecord(out.mainEntity as object);
    expect(person['@type']).toBe('Person');
    expect(person.name).toBe('Minimal');
    expect(person['@id']).toBeUndefined();
    expect(person.description).toBeUndefined();
    expect(person.image).toBeUndefined();
    expect(person.url).toBeUndefined();
    expect(person.jobTitle).toBeUndefined();
    expect(person.worksFor).toBeUndefined();
    expect(person.address).toBeUndefined();
    expect(person.email).toBeUndefined();
    expect(person.knowsAbout).toBeUndefined();
    expect(person.sameAs).toBeUndefined();
    expect(person.subjectOf).toBeUndefined();
  });
});
